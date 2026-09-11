import { request, uploadXhr } from './client'
import type { StoreType, Visibility } from '@/types'
import { encodeObjectKey } from '@/utils/utils'

export async function putFile(
  filename: string,
  body: File | Blob | string,
  visibility: Visibility,
  type: StoreType = 'file',
  onProgress?: (percent: number, loaded: number, total: number) => void,
) {
  const url = `/${encodeObjectKey(filename)}`
  const headers: Record<string, string> = {
    'x-store-visibility': visibility,
    'x-store-type': type,
  }

  if (typeof body === 'string') {
    headers['Content-Type'] = 'text/plain; charset=utf-8'
  } else if (body instanceof File && body.type) {
    headers['Content-Type'] = body.type
  }

  if (onProgress && (body instanceof File || body instanceof Blob)) {
    const uploader = uploadXhr(url, body, headers, onProgress)
    return await uploader.promise
  }

  return await request<string>(url, {
    method: 'PUT',
    headers,
    body,
  })
}

export interface PresignedUploadResponse {
  supported: boolean
  presignedUrl?: string
  filename?: string
  contentType?: string
  metadata?: Record<string, string>
  error?: string
}

export async function getPresignedUploadUrl(
  filename: string,
  contentType: string,
  visibility: Visibility = 'public',
  type: StoreType = 'file',
) {
  return await request<PresignedUploadResponse>('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType, visibility, type }),
  })
}

export function createUploadTask(
  filename: string,
  file: File,
  visibility: Visibility,
  onProgress: (percent: number, loaded: number, total: number) => void,
) {
  let activeAbort: (() => void) | null = null
  let isAborted = false

  const promise = (async () => {
    const contentType = file.type || 'application/octet-stream'

    // 针对大文件（或尝试）获取 R2 S3 预签名直传链接，避免 Worker 100MB 限制
    try {
      const presigned = await getPresignedUploadUrl(filename, contentType, visibility, 'file')
      if (isAborted) throw new Error('Upload cancelled')

      if (presigned.supported && presigned.presignedUrl) {
        // 构建 S3 预签名需要的 Headers（S3 PUT 需要带上对应的 x-amz-meta 元数据）
        const headers: Record<string, string> = {
          'Content-Type': contentType,
        }
        if (presigned.metadata) {
          for (const [k, v] of Object.entries(presigned.metadata)) {
            headers[`x-amz-meta-${k}`] = v
          }
        }
        const uploader = uploadXhr(presigned.presignedUrl, file, headers, onProgress, false)
        activeAbort = uploader.abort
        return await uploader.promise
      }
    } catch (e: unknown) {
      if ((e as Error)?.message === 'Upload cancelled') throw e
      // 预签名未开启或异常时，自动平滑 fallback 走原生 Pages Worker PUT
      console.warn('R2 Direct Upload not available or failed, fallback to Worker proxy:', e)
    }

    if (isAborted) throw new Error('Upload cancelled')

    // 回退到原 Worker 管道直传
    const url = `/${encodeObjectKey(filename)}`
    const headers: Record<string, string> = {
      'x-store-visibility': visibility,
      'x-store-type': 'file',
      'Content-Type': contentType,
    }
    const uploader = uploadXhr(url, file, headers, onProgress, true)
    activeAbort = uploader.abort
    return await uploader.promise
  })()

  return {
    promise,
    abort: () => {
      isAborted = true
      activeAbort?.()
    },
  }
}

export async function patchFile(
  filename: string,
  visibility: Visibility,
  type: StoreType = 'file',
) {
  const url = `/${encodeObjectKey(filename)}`
  return await request<string>(url, {
    method: 'PATCH',
    headers: {
      'x-store-visibility': visibility,
      'x-store-type': type,
    },
  })
}

export async function deleteFile(filename: string) {
  const url = `/${encodeObjectKey(filename)}`
  return await request<string>(url, {
    method: 'DELETE',
  })
}

export async function batchDeleteFiles(keys: string[]) {
  return await request<{ ok: boolean; count: number }>('/api/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  })
}

export async function renameFile(oldKey: string, newKey: string) {
  return await request<string>('/api/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      oldKey: encodeObjectKey(oldKey),
      newKey: encodeObjectKey(newKey),
    }),
  })
}

export async function signShareLink(key: string, expireInSeconds = 86400) {
  return await request<{
    key: string
    expire: number
    sign: string
    signedUrl: string
  }>('/api/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, expireInSeconds }),
  })
}

/** @deprecated use putFile */
export const PutFile = putFile
/** @deprecated use patchFile */
export const PatchFile = patchFile
/** @deprecated use deleteFile */
export const DeleteFile = deleteFile
