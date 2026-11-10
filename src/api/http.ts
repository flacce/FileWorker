import router from '@/router'
import { notify } from '@/composables/useNotice'

export class HttpStatusError extends Error {
  readonly code: number

  constructor(message: string, code: number) {
    super(message)
    this.name = 'HttpStatusError'
    this.code = code
  }
}

export function clearClientSessionCookies() {
  const expireSuffix = '=; Path=/; Max-Age=0; SameSite=Lax'
  document.cookie = `__auth${expireSuffix}`
  document.cookie = `PASSWORD${expireSuffix}`
}

function redirectToGate() {
  clearClientSessionCookies()
  const current = router.currentRoute.value
  if (current.path !== '/login') {
    router.replace({
      path: '/login',
      query: { redirect: current.fullPath }
    })
  }
}

export async function httpJson<T>(
  url: string,
  init: RequestInit = {},
  silentAuth = false
): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json, text/plain, */*')
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers,
      credentials: 'same-origin'
    })
  } catch (err: unknown) {
    const error = err as Error
    if (error.name !== 'AbortError' && !silentAuth) {
      notify(error.message || '网络连接中断，请检查服务状态', 'warn')
    }
    throw error
  }

  if (response.status === 401) {
    if (!silentAuth) {
      notify('会话已失效，请重新验证门禁口令', 'warn')
      redirectToGate()
    }
    throw new HttpStatusError('未授权访问', 401)
  }

  if (!response.ok) {
    let reason = `请求异常（状态码 ${response.status}）`
    try {
      const raw = await response.text()
      if (raw) {
        try {
          const obj = JSON.parse(raw) as { error?: string; message?: string }
          reason = obj.error || obj.message || raw
        } catch {
          reason = raw
        }
      }
    } catch {
      // 忽略响应体解析失败
    }
    if (!silentAuth) {
      notify(reason.slice(0, 120), 'warn')
    }
    throw new HttpStatusError(reason, response.status)
  }

  const ct = response.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    return (await response.json()) as T
  }
  return (await response.text()) as unknown as T
}

export function putBinaryStream(
  url: string,
  payload: Blob | File,
  headers: Record<string, string>,
  onProgress: (loaded: number, total: number) => void,
  withCredentials = true
): { done: Promise<void>; cancel: () => void } {
  const xhr = new XMLHttpRequest()

  const done = new Promise<void>((resolve, reject) => {
    xhr.open('PUT', url, true)
    xhr.withCredentials = withCredentials

    for (const [key, val] of Object.entries(headers)) {
      xhr.setRequestHeader(key, val)
    }

    if (xhr.upload) {
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          onProgress(ev.loaded, ev.total)
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status === 401) {
        notify('会话已过期，请重新验证口令', 'warn')
        redirectToGate()
        reject(new HttpStatusError('未授权访问', 401))
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      const msg = xhr.responseText || `传输失败（${xhr.status}）`
      reject(new HttpStatusError(msg, xhr.status))
    }

    xhr.onerror = () => {
      reject(new HttpStatusError('网络传输中断', 0))
    }

    xhr.onabort = () => {
      reject(new HttpStatusError('已取消传输', -1))
    }

    xhr.send(payload)
  })

  return {
    done,
    cancel: () => xhr.abort()
  }
}
