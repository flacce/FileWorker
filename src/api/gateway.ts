import type {
  BucketMetrics,
  RawListResponse,
  StorageObject,
  StoreKind,
  VisibilityMode
} from '@/types'
import { buildObjectPath, decodeKey, encodeKeyPath } from '@/utils/format'
import {
  clearClientSessionCookies,
  httpJson,
  httpText,
  HttpStatusError,
  putBinaryStream
} from './http'

const TEXT_CACHE_TTL_MS = 30_000
const TEXT_CACHE_MAX_ENTRIES = 8
const textCache = new Map<string, { value: string; expiresAt: number }>()
let textCacheVersion = 0

function canonicalTextKey(key: string): string {
  return decodeKey(key)
}

function invalidateTextCache(key: string) {
  textCacheVersion++
  textCache.delete(canonicalTextKey(key))
}

function cacheText(key: string, value: string) {
  const cacheKey = canonicalTextKey(key)
  textCache.delete(cacheKey)
  while (textCache.size >= TEXT_CACHE_MAX_ENTRIES) {
    const oldest = textCache.keys().next().value
    if (oldest === undefined) break
    textCache.delete(oldest)
  }
  textCache.set(cacheKey, { value, expiresAt: Date.now() + TEXT_CACHE_TTL_MS })
}

export async function probeSession(): Promise<boolean> {
  try {
    await httpJson<{ ok: boolean }>('/api/auth', { method: 'GET' }, true)
    return true
  } catch {
    return false
  }
}

export async function submitPasscode(password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await httpJson<{ ok: boolean }>(
      '/api/auth',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      },
      true
    )
    return { ok: Boolean(res.ok) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '验证失败'
    return { ok: false, error: message }
  }
}

export function endSession() {
  clearClientSessionCookies()
}

export async function queryObjects(params?: {
  maxKeys?: number
  prefix?: string
  continuationToken?: string
  delimiter?: string
}): Promise<{
  items: StorageObject[]
  folders: string[]
  truncated: boolean
  nextToken?: string
}> {
  const search = new URLSearchParams()
  search.set('maxKeys', String(params?.maxKeys ?? 200))
  if (params?.prefix) search.set('prefix', params.prefix)
  if (params?.continuationToken) search.set('continuationToken', params.continuationToken)
  if (params?.delimiter) search.set('delimiter', params.delimiter)

  const res = await httpJson<RawListResponse>(`/api/list?${search.toString()}`)
  const items: StorageObject[] = (res.Contents ?? [])
    .filter((entry): entry is Required<Pick<typeof entry, 'Key'>> & typeof entry =>
      Boolean(entry.Key)
    )
    .map((entry) => ({
      Key: entry.Key,
      Size: entry.Size ?? 0,
      LastModified: entry.LastModified ?? '',
      ETag: entry.ETag,
      httpMetadata: entry.httpMetadata,
      customMetadata: entry.customMetadata
    }))

  return {
    items,
    folders: res.delimitedPrefixes ?? [],
    truncated: Boolean(res.IsTruncated),
    nextToken: res.NextContinuationToken
  }
}

export async function queryBucketMetrics(force = false): Promise<BucketMetrics> {
  return await httpJson<BucketMetrics>(
    '/api/stats',
    force ? { headers: { 'Cache-Control': 'no-cache' } } : undefined
  )
}

export async function readObjectText(
  key: string,
  signal?: AbortSignal,
  cacheable = false
): Promise<string> {
  const cacheKey = canonicalTextKey(key)
  const cacheVersion = textCacheVersion
  if (cacheable) {
    const cached = textCache.get(cacheKey)
    if (cached) {
      if (cached.expiresAt > Date.now()) return cached.value
      textCache.delete(cacheKey)
    }
  }

  const value = await httpText(buildObjectPath(cacheKey), {
    method: 'GET',
    cache: 'no-store',
    signal
  })
  if (cacheable && cacheVersion === textCacheVersion) cacheText(cacheKey, value)
  return value
}

export async function writeTextObject(
  key: string,
  content: string,
  visibility: VisibilityMode,
  storeKind: StoreKind = 'text'
): Promise<void> {
  await httpJson<string>(buildObjectPath(key), {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'x-store-visibility': visibility,
      'x-store-type': storeKind
    },
    body: content
  })
  invalidateTextCache(key)
}

interface PresignResult {
  supported: boolean
  presignedUrl?: string
  metadata?: Record<string, string>
  error?: string
}

export function startFileUpload(
  targetKey: string,
  file: File,
  visibility: VisibilityMode,
  onProgress: (loaded: number, total: number) => void
): { done: Promise<void>; cancel: () => void } {
  let activeCancel: (() => void) | null = null
  let cancelled = false
  const cleanKey = decodeKey(targetKey)
  const mime = file.type || 'application/octet-stream'

  const done = (async () => {
    try {
      const presign = await httpJson<PresignResult>(
        '/api/upload-url',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: cleanKey,
            contentType: mime,
            visibility,
            type: 'file'
          })
        },
        true
      )

      if (cancelled) throw new HttpStatusError('已取消传输', -1)

      if (presign.supported && presign.presignedUrl) {
        const s3Headers: Record<string, string> = {
          'Content-Type': mime
        }
        if (presign.metadata) {
          for (const [k, v] of Object.entries(presign.metadata)) {
            s3Headers[`x-amz-meta-${k}`] = v
          }
        }
        const task = putBinaryStream(presign.presignedUrl, file, s3Headers, onProgress, false)
        activeCancel = task.cancel
        await task.done
        invalidateTextCache(cleanKey)
        return
      }
    } catch (err: unknown) {
      if (err instanceof HttpStatusError && err.code === -1) throw err
      // 预签名未启用或跨域受阻时无感回退至同源流式直传
    }

    if (cancelled) throw new HttpStatusError('已取消传输', -1)

    const fallbackTask = putBinaryStream(
      buildObjectPath(cleanKey),
      file,
      {
        'Content-Type': mime,
        'x-store-visibility': visibility,
        'x-store-type': 'file'
      },
      onProgress,
      true
    )
    activeCancel = fallbackTask.cancel
    await fallbackTask.done
    invalidateTextCache(cleanKey)
  })()

  return {
    done,
    cancel: () => {
      cancelled = true
      activeCancel?.()
    }
  }
}

export async function changeObjectVisibility(
  key: string,
  visibility: VisibilityMode,
  storeKind: StoreKind
): Promise<void> {
  await httpJson<string>(buildObjectPath(key), {
    method: 'PATCH',
    headers: {
      'x-store-visibility': visibility,
      'x-store-type': storeKind
    }
  })
  invalidateTextCache(key)
}

export async function moveObjectKey(oldKey: string, newKey: string): Promise<void> {
  await httpJson<string>('/api/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      oldKey: encodeKeyPath(oldKey),
      newKey: encodeKeyPath(newKey)
    })
  })
  invalidateTextCache(oldKey)
  invalidateTextCache(newKey)
}

export async function deleteSingleObject(key: string): Promise<void> {
  await httpJson<string>(buildObjectPath(key), {
    method: 'DELETE'
  })
  invalidateTextCache(key)
}

export async function deleteMultipleObjects(keys: string[]): Promise<number> {
  const res = await httpJson<{ ok: boolean; count: number }>('/api/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys: keys.map((k) => encodeKeyPath(k)) })
  })
  for (const key of keys) invalidateTextCache(key)
  return res.count
}

export async function issueSignedUrl(
  key: string,
  expireInSeconds: number
): Promise<{ signedUrl: string; expire: number; openMode: boolean }> {
  const res = await httpJson<{
    key?: string
    expire: number
    sign: string
    signedUrl?: string
  }>('/api/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: decodeKey(key),
      expireInSeconds
    })
  })

  if (!res.sign || !res.signedUrl) {
    return {
      signedUrl: `${window.location.origin}${buildObjectPath(key)}`,
      expire: 0,
      openMode: true
    }
  }

  return {
    signedUrl: `${window.location.origin}${res.signedUrl}`,
    expire: res.expire,
    openMode: false
  }
}
