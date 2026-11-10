import type {
  BucketMetrics,
  RawListResponse,
  StorageObject,
  StoreKind,
  VisibilityMode
} from '@/types'
import { buildObjectPath, decodeKey, encodeKeyPath } from '@/utils/format'
import { clearClientSessionCookies, httpJson, HttpStatusError, putBinaryStream } from './http'

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

export async function queryBucketMetrics(): Promise<BucketMetrics> {
  return await httpJson<BucketMetrics>('/api/stats')
}

export async function readObjectText(key: string, signal?: AbortSignal): Promise<string> {
  const url = `${buildObjectPath(key)}?_t=${Date.now()}`
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal
  })
  if (!res.ok) {
    throw new HttpStatusError(`读取内容失败（${res.status}）`, res.status)
  }
  return await res.text()
}

export async function probeObjectMetadata(
  key: string,
  signal?: AbortSignal
): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(buildObjectPath(key), {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      credentials: 'same-origin',
      cache: 'no-store',
      signal
    })
    if (!res.ok && res.status !== 206) return null
    const meta: Record<string, string> = {}
    const vis = res.headers.get('x-store-visibility')
    const st = res.headers.get('x-store-type')
    if (vis) meta['x-store-visibility'] = vis
    if (st) meta['x-store-type'] = st
    return Object.keys(meta).length > 0 ? meta : null
  } catch {
    return null
  }
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
}

export async function deleteSingleObject(key: string): Promise<void> {
  await httpJson<string>(buildObjectPath(key), {
    method: 'DELETE'
  })
}

export async function deleteMultipleObjects(keys: string[]): Promise<number> {
  const res = await httpJson<{ ok: boolean; count: number }>('/api/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys: keys.map((k) => encodeKeyPath(k)) })
  })
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
