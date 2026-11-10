import { Hono, type Context } from 'hono'
import type { AppEnv } from '../bindings'
import { eraseCandidates, leafName, objectRefFromUrl, readCandidates } from '../core/keys'
import {
  isTextEntry,
  pickStoreHeaders,
  resolveContentType,
  STORE_HEADER_PREFIX,
  visibilityOf
} from '../core/metadata'
import { shouldDownload } from '../core/mime'
import { badRequest } from '../core/request'
import { isAuthorized, requireAuth } from '../security/guard'
import {
  fetchObject,
  hasBody,
  locateObject,
  RangeNotSatisfiableError,
  resolveByteRange
} from '../storage/bucket'

const PUBLIC_CACHE = 'public, max-age=300, stale-while-revalidate=86400'
const PRIVATE_CACHE = 'private, no-store'

function requireKey(c: Context<AppEnv>) {
  const ref = objectRefFromUrl(c.req.url)
  if (!ref.key) badRequest('无效文件名')
  return ref
}

function contentDisposition(contentType: string, key: string): string {
  if (!shouldDownload(contentType)) return 'inline'
  return `attachment; filename*=UTF-8''${encodeURIComponent(leafName(key))}`
}

/** 组装对象下发的公共响应头 */
function deliveryHeaders(object: R2Object, contentType: string): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(object.customMetadata ?? {})) {
    if (name.toLowerCase().startsWith(STORE_HEADER_PREFIX)) headers.set(name, value)
  }
  const isPublic = visibilityOf(object.customMetadata) === 'public'
  headers.set('Content-Type', contentType)
  headers.set('Content-Disposition', contentDisposition(contentType, object.key))
  headers.set('ETag', object.httpEtag)
  headers.set('Last-Modified', object.uploaded.toUTCString())
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Cache-Control', isPublic ? PUBLIC_CACHE : PRIVATE_CACHE)
  headers.set('X-Content-Type-Options', 'nosniff')
  return headers
}

const objects = new Hono<AppEnv>()

objects.get('/:key{.+}', async (c) => {
  const ref = objectRefFromUrl(c.req.url)
  if (!ref.key) return c.text('未找到文件', 404)

  let object: R2Object | R2ObjectBody | null
  try {
    object = await fetchObject(c.env.BUCKET, readCandidates(ref), c.req.raw.headers)
  } catch (err) {
    if (!(err instanceof RangeNotSatisfiableError)) throw err
    const head = await c.env.BUCKET.head(ref.key)
    return new Response(null, {
      status: 416,
      headers: head ? { 'Content-Range': `bytes */${head.size}` } : {}
    })
  }
  if (!object) return c.text('未找到文件', 404)

  // 私密对象先鉴权，避免通过 304/412 探测到对象存在
  const isPrivate = visibilityOf(object.customMetadata) === 'private'
  if (isPrivate && !(await isAuthorized(c, { allowShare: true }))) {
    if (hasBody(object)) await object.body.cancel()
    return c.text('未找到文件或无权访问', 404)
  }

  const contentType = resolveContentType(
    object.key,
    object.customMetadata,
    object.httpMetadata?.contentType
  )
  const headers = deliveryHeaders(object, contentType)

  if (!hasBody(object)) {
    const conditionalGet = c.req.header('if-none-match') || c.req.header('if-modified-since')
    const passthrough = ['ETag', 'Last-Modified', 'Cache-Control']
    for (const name of [...headers.keys()]) {
      if (!passthrough.some((p) => p.toLowerCase() === name)) headers.delete(name)
    }
    return new Response(null, { status: conditionalGet ? 304 : 412, headers })
  }

  const rangeHeader = c.req.header('range')
  if (rangeHeader) {
    const span = resolveByteRange(rangeHeader, object.size)
    if (!span) {
      await object.body.cancel()
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${object.size}` }
      })
    }
    headers.set('Content-Range', `bytes ${span.start}-${span.end}/${object.size}`)
    headers.set('Content-Length', String(span.end - span.start + 1))
    return new Response(object.body, { status: 206, headers })
  }

  headers.set('Content-Length', String(object.size))
  return new Response(object.body, { status: 200, headers })
})

objects.put('/:key{.+}', requireAuth, async (c) => {
  const { key } = requireKey(c)
  const body = c.req.raw.body
  if (!body) badRequest('请求体为空')

  const customMetadata = pickStoreHeaders(c.req.raw.headers)
  const contentType = resolveContentType(key, customMetadata, c.req.header('content-type'))
  await c.env.BUCKET.put(key, body, { customMetadata, httpMetadata: { contentType } })
  return c.text('OK')
})

objects.patch('/:key{.+}', requireAuth, async (c) => {
  const ref = requireKey(c)
  const object = await locateObject(c.env.BUCKET, readCandidates(ref))
  if (!object) return c.text('未找到文件', 404)

  const customMetadata = { ...object.customMetadata, ...pickStoreHeaders(c.req.raw.headers) }
  const contentType = isTextEntry(customMetadata)
    ? resolveContentType(object.key, customMetadata)
    : resolveContentType(object.key, customMetadata, object.httpMetadata?.contentType)

  await c.env.BUCKET.put(object.key, object.body, {
    customMetadata,
    httpMetadata: { ...object.httpMetadata, contentType }
  })
  return c.text('OK')
})

objects.delete('/:key{.+}', requireAuth, async (c) => {
  const ref = requireKey(c)
  await c.env.BUCKET.delete(eraseCandidates(ref))
  return c.text('OK')
})

export default objects
