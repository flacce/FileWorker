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

export function createUploadTask(
  filename: string,
  file: File,
  visibility: Visibility,
  onProgress: (percent: number, loaded: number, total: number) => void,
) {
  const url = `/${encodeObjectKey(filename)}`
  const headers: Record<string, string> = {
    'x-store-visibility': visibility,
    'x-store-type': 'file',
    'Content-Type': file.type || 'application/octet-stream',
  }
  return uploadXhr(url, file, headers, onProgress)
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
