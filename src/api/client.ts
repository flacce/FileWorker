import router from '@/router'
import { toast } from '@/utils/toast'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    toast('登录已失效或无权访问，请登录', 'error')
    if (router.currentRoute.value.path !== '/login') {
      router.push({
        path: '/login',
        query: { redirect: router.currentRoute.value.fullPath },
      })
    }
    throw new ApiError('Unauthorized', 401)
  }

  if (!res.ok) {
    let errMsg = `请求失败 (${res.status})`
    try {
      const text = await res.text()
      if (text) {
        try {
          const parsed = JSON.parse(text)
          errMsg = parsed.error || parsed.message || text
        } catch {
          errMsg = text
        }
      }
    } catch {
      // ignore
    }
    toast(errMsg.slice(0, 150), 'error')
    throw new ApiError(errMsg, res.status)
  }

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return (await res.json()) as T
  }
  return (await res.text()) as unknown as T
}

export async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
  }

  const mergedHeaders = {
    ...defaultHeaders,
    ...((options.headers as Record<string, string>) || {}),
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers: mergedHeaders,
      credentials: 'same-origin',
    })
    return await handleResponse<T>(res)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    const error = err as Error
    if (error.name !== 'AbortError') {
      toast(error.message || '网络异常，请稍后重试', 'error')
    }
    throw error
  }
}

/**
 * Upload with live progress callback using XMLHttpRequest.
 */
export function uploadXhr(
  url: string,
  body: Blob | File | string,
  headers: Record<string, string> = {},
  onProgress?: (percent: number, loaded: number, total: number) => void,
): { promise: Promise<string>; abort: () => void } {
  const xhr = new XMLHttpRequest()

  const promise = new Promise<string>((resolve, reject) => {
    xhr.open('PUT', url, true)
    xhr.withCredentials = true

    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v)
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const percent = Math.round((e.loaded / e.total) * 100)
          onProgress(percent, e.loaded, e.total)
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status === 401) {
        toast('登录已失效，请重新登录', 'error')
        if (router.currentRoute.value.path !== '/login') {
          router.push({
            path: '/login',
            query: { redirect: router.currentRoute.value.fullPath },
          })
        }
        reject(new ApiError('Unauthorized', 401))
        return
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText || 'OK')
      } else {
        const msg = xhr.responseText || `上传失败: ${xhr.statusText}`
        toast(msg.slice(0, 150), 'error')
        reject(new ApiError(msg, xhr.status))
      }
    }

    xhr.onerror = () => {
      const msg = '网络错误，上传中断'
      toast(msg, 'error')
      reject(new ApiError(msg, 0))
    }

    xhr.onabort = () => {
      reject(new ApiError('Upload cancelled', -1))
    }

    xhr.send(body)
  })

  return {
    promise,
    abort: () => xhr.abort(),
  }
}
