import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type Env from './utils/env'
import {
  checkAuth,
  createSessionCookieHeaders,
  getExpectedHash,
  hmacSign,
  sha256,
} from './utils/auth'
import {
  collectStoreHeaders,
  guessMimeType,
  isForceAttachment,
} from './utils/mime'

const app = new Hono<{ Bindings: Env }>()

// Global CORS & Error Handling
app.use('*', cors())
app.onError((err, c) => {
  console.error('Worker Error:', err)
  return c.text(`Server Error: ${err.message}`, 500)
})

// ── Auth APIs ───────────────────────────────────────────────

app.get('/api/auth', async (c) => {
  const ok = await checkAuth(c.env, c.req.raw)
  if (!ok) return c.text('Unauthorized', 401)
  return c.json({ ok: true })
})

app.post('/api/auth', async (c) => {
  const expectedHash = await getExpectedHash(c.env)
  if (!expectedHash) {
    // Open mode: no password required
    const headers = new Headers({ 'Content-Type': 'application/json' })
    createSessionCookieHeaders('').forEach(([k, v]) => headers.append(k, v))
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  }

  let body: { password?: string }
  try {
    body = await c.req.json<{ password?: string }>()
  } catch {
    return c.text('无效请求体', 400)
  }

  const password = body.password ?? ''
  if (!password) return c.text('请输入密码', 400)

  const hash = await sha256(password)
  if (hash !== expectedHash) {
    return c.text('密码错误', 401)
  }

  const headers = new Headers({ 'Content-Type': 'application/json' })
  createSessionCookieHeaders(hash).forEach(([k, v]) => headers.append(k, v))
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
})

// ── List API ────────────────────────────────────────────────

app.get('/api/list', async (c) => {
  if (!(await checkAuth(c.env, c.req.raw))) {
    return c.text('Unauthorized', 401)
  }

  const query = c.req.query()
  const maxKeysRaw = query['MaxKeys'] || query['limit']
  const maxKeys = maxKeysRaw ? Number(maxKeysRaw) : 1000
  const prefix = query['Prefix'] || query['prefix'] || undefined
  const cursor = query['ContinuationToken'] || query['cursor'] || undefined
  const delimiter = query['delimiter'] || undefined

  try {
    const listed = await c.env.BUCKET.list({
      limit: Number.isFinite(maxKeys) && maxKeys > 0 ? Math.min(maxKeys, 1000) : 1000,
      prefix,
      cursor,
      delimiter,
    })

    const contents = listed.objects.map((item: R2Object) => ({
      Key: item.key,
      Size: item.size,
      LastModified: item.uploaded.toISOString(),
      ETag: item.etag,
      httpMetadata: item.httpMetadata,
      customMetadata: item.customMetadata,
    }))

    return c.json({
      Contents: contents,
      IsTruncated: listed.truncated,
      NextContinuationToken: listed.truncated ? listed.cursor : undefined,
      KeyCount: contents.length,
      MaxKeys: maxKeys,
      Name: 'BUCKET',
      Prefix: prefix ?? '',
      delimitedPrefixes: listed.delimitedPrefixes,
    })
  } catch (err: unknown) {
    const error = err as Error
    return c.json({ error: error.message || '获取文件列表失败' }, 500)
  }
})

// ── Rename API ──────────────────────────────────────────────

app.post('/api/rename', async (c) => {
  if (!(await checkAuth(c.env, c.req.raw))) return c.text('Unauthorized', 401)

  try {
    const { oldKey, newKey } = await c.req.json<{ oldKey: string; newKey: string }>()
    if (!oldKey || !newKey) return c.text('参数无效', 400)

    const dk = decodeURIComponent(oldKey)
    const nk = decodeURIComponent(newKey)

    let object = await c.env.BUCKET.get(dk)
    let sourceKey = dk
    if (!object && oldKey !== dk) {
      object = await c.env.BUCKET.get(oldKey)
      sourceKey = oldKey
    }

    if (!object || !('body' in object)) return c.text('未找到源文件', 404)

    await c.env.BUCKET.put(nk, object.body, {
      customMetadata: object.customMetadata,
      httpMetadata: object.httpMetadata,
    })

    await c.env.BUCKET.delete(sourceKey)
    if (sourceKey !== oldKey) {
      await c.env.BUCKET.delete(oldKey)
    }

    return c.text('OK', 200)
  } catch (err: unknown) {
    const error = err as Error
    return c.text(error.message || '重命名失败', 500)
  }
})

// ── Batch Delete API ────────────────────────────────────────

app.post('/api/batch-delete', async (c) => {
  if (!(await checkAuth(c.env, c.req.raw))) return c.text('Unauthorized', 401)

  try {
    const { keys } = await c.req.json<{ keys: string[] }>()
    if (!Array.isArray(keys) || !keys.length) {
      return c.text('参数 keys 必须为非空数组', 400)
    }

    const decodedKeys = keys.map((k: string) => decodeURIComponent(k))
    await c.env.BUCKET.delete(decodedKeys)

    return c.json({ ok: true, count: decodedKeys.length })
  } catch (err: unknown) {
    const error = err as Error
    return c.text(error.message || '批量删除失败', 500)
  }
})

// ── Temporary Signed Share Link API ────────────────────────

app.post('/api/sign', async (c) => {
  if (!(await checkAuth(c.env, c.req.raw))) return c.text('Unauthorized', 401)

  const expectedHash = await getExpectedHash(c.env)
  if (!expectedHash) {
    return c.json({ sign: '', expire: 0 })
  }

  try {
    const { key, expireInSeconds = 86400 } = await c.req.json<{ key: string; expireInSeconds?: number }>()
    if (!key) return c.text('缺少 key 参数', 400)

    const cleanKey = encodeURIComponent(decodeURIComponent(String(key)))
    const expire = Date.now() + expireInSeconds * 1000
    const payload = `/${cleanKey}?expire=${expire}`
    const sign = await hmacSign(payload, expectedHash)

    return c.json({
      key: cleanKey,
      expire,
      sign,
      signedUrl: `/${cleanKey}?expire=${expire}&sign=${sign}`,
    })
  } catch (err: unknown) {
    const error = err as Error
    return c.text(error.message || '生成签名失败', 500)
  }
})

// ── Storage Stats API ───────────────────────────────────────

app.get('/api/stats', async (c) => {
  if (!(await checkAuth(c.env, c.req.raw))) return c.text('Unauthorized', 401)

  try {
    const listed = await c.env.BUCKET.list({ limit: 1000 })
    let totalSize = 0
    const typeCount: Record<string, number> = {
      image: 0,
      video: 0,
      audio: 0,
      document: 0,
      code: 0,
      archive: 0,
      other: 0,
    }

    for (const obj of listed.objects) {
      totalSize += obj.size
      const mime = guessMimeType(obj.key)
      if (mime.startsWith('image/')) typeCount.image++
      else if (mime.startsWith('video/')) typeCount.video++
      else if (mime.startsWith('audio/')) typeCount.audio++
      else if (mime.includes('pdf') || mime.includes('document')) typeCount.document++
      else if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) typeCount.code++
      else if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar')) typeCount.archive++
      else typeCount.other++
    }

    return c.json({
      totalCount: listed.objects.length,
      isTruncated: listed.truncated,
      totalSize,
      typeCount,
    })
  } catch (err: unknown) {
    const error = err as Error
    return c.text(error.message || '统计失败', 500)
  }
})

// ── Object CRUD ( /{key} ) ──────────────────────────────────

// GET /{key} (Handles Range 206, ETag 304, Streaming, inline/attachment)
app.get('/:key{.+}', async (c) => {
  const rawKey = c.req.param('key')
  if (!rawKey) return c.text('未找到文件', 404)

  const dk = decodeURIComponent(rawKey)
  const reqHeaders = c.req.raw.headers

  // R2 native Range and Conditional Get support
  let object = await c.env.BUCKET.get(dk, {
    range: reqHeaders,
    onlyIf: reqHeaders,
  })

  // Fallback to raw key if not decoded
  if (!object && rawKey !== dk) {
    object = await c.env.BUCKET.get(rawKey, {
      range: reqHeaders,
      onlyIf: reqHeaders,
    })
  }

  if (!object) return c.text('未找到文件', 404)

  // Conditional request 304 Not Modified
  if (!('body' in object) || !object.body) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: object.httpEtag,
        'Last-Modified': object.uploaded.toUTCString(),
      },
    })
  }

  const customMetadata = object.customMetadata ?? {}
  const visibility = customMetadata['x-store-visibility'] ?? 'private'

  // Access control
  if (visibility !== 'public' && !(await checkAuth(c.env, c.req.raw))) {
    return c.text('未找到文件或无权访问', 404)
  }

  const isText = customMetadata['x-store-type'] === 'text'
  const contentType = isText
    ? 'text/plain; charset=utf-8'
    : (object.httpMetadata?.contentType || guessMimeType(dk))

  const headers = new Headers()

  // Forward custom x-store-* metadata
  for (const [k, v] of Object.entries(customMetadata)) {
    if (k.toLowerCase().startsWith('x-store-') && v != null) {
      headers.set(k, v)
    }
  }

  headers.set('Content-Type', contentType)
  headers.set('ETag', object.httpEtag)
  headers.set('Last-Modified', object.uploaded.toUTCString())
  headers.set('Accept-Ranges', 'bytes')

  // Content Disposition
  if (isForceAttachment(contentType)) {
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(dk)}`)
  } else {
    headers.set('Content-Disposition', 'inline')
  }

  // Cache-Control
  headers.set(
    'Cache-Control',
    visibility === 'public'
      ? 'public, max-age=300, stale-while-revalidate=86400'
      : 'private, no-store',
  )

  // Range response (206 Partial Content)
  if ('range' in object && object.range) {
    const range = object.range as { offset?: number; length?: number }
    const offset = range.offset ?? 0
    const length = range.length ?? (object.size - offset)
    const end = offset + length - 1
    headers.set('Content-Range', `bytes ${offset}-${end}/${object.size}`)
    headers.set('Content-Length', String(length))

    return new Response(object.body, {
      status: 206,
      headers,
    })
  }

  headers.set('Content-Length', String(object.size))
  return new Response(object.body, {
    status: 200,
    headers,
  })
})

// PUT /{key} (Direct Streaming Upload)
app.put('/:key{.+}', async (c) => {
  if (!(await checkAuth(c.env, c.req.raw))) return c.text('未授权', 401)

  const rawKey = c.req.param('key')
  const dk = decodeURIComponent(rawKey)
  if (!dk) return c.text('无效文件名', 400)
  if (!c.req.raw.body) return c.text('请求体为空', 400)

  const customMetadata = collectStoreHeaders(c.req.raw.headers)
  const isText = customMetadata['x-store-type'] === 'text'
  const contentType = isText
    ? 'text/plain; charset=utf-8'
    : (c.req.raw.headers.get('content-type') || guessMimeType(dk))

  await c.env.BUCKET.put(dk, c.req.raw.body, {
    customMetadata,
    httpMetadata: { contentType },
  })

  return c.text('OK', 200)
})

// PATCH /{key} (Metadata updates)
app.patch('/:key{.+}', async (c) => {
  if (!(await checkAuth(c.env, c.req.raw))) return c.text('未授权', 401)

  const rawKey = c.req.param('key')
  const dk = decodeURIComponent(rawKey)
  if (!dk) return c.text('无效文件名', 400)

  let object = await c.env.BUCKET.get(dk)
  let actualKey = dk
  if (!object && rawKey !== dk) {
    object = await c.env.BUCKET.get(rawKey)
    actualKey = rawKey
  }

  if (!object || !('body' in object)) return c.text('未找到文件', 404)

  const newCustomMetadata = {
    ...(object.customMetadata ?? {}),
    ...collectStoreHeaders(c.req.raw.headers),
  }

  const isText = newCustomMetadata['x-store-type'] === 'text'
  const fixedContentType = isText
    ? 'text/plain; charset=utf-8'
    : (object.httpMetadata?.contentType || guessMimeType(actualKey))

  await c.env.BUCKET.put(actualKey, object.body, {
    customMetadata: newCustomMetadata,
    httpMetadata: { contentType: fixedContentType },
  })

  return c.text('OK', 200)
})

// DELETE /{key}
app.delete('/:key{.+}', async (c) => {
  if (!(await checkAuth(c.env, c.req.raw))) return c.text('未授权', 401)

  const rawKey = c.req.param('key')
  const dk = decodeURIComponent(rawKey)
  if (!dk) return c.text('无效文件名', 400)

  await c.env.BUCKET.delete(dk)
  if (rawKey !== dk) {
    await c.env.BUCKET.delete(rawKey)
  }

  return c.text('OK', 200)
})

// Cloudflare Pages Functions entry point
export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  const pathname = url.pathname

  // 1. Direct pass-through for static SPA entry and built assets
  if (
    pathname === '/' ||
    pathname === '/index.html' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/assets/')
  ) {
    return context.next()
  }

  // 2. Delegate to Hono router
  const response = await app.fetch(context.request, context.env)

  // 3. If Hono returned 404 on GET (and not an explicit /api endpoint), check static asset fallback
  if (
    response.status === 404 &&
    context.request.method === 'GET' &&
    !pathname.startsWith('/api/')
  ) {
    const assetResp = await context.next()
    if (assetResp.status !== 404) {
      return assetResp
    }
  }

  return response
}
