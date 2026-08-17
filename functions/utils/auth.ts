import type Env from './env'

/**
 * SHA-256 hex digest using native Web Crypto.
 */
export async function sha256(data: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Constant-time comparison for timing attack mitigation.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const aa = encoder.encode(a)
  const bb = encoder.encode(b)
  const len = Math.max(aa.byteLength, bb.byteLength)
  let result = aa.byteLength === bb.byteLength ? 0 : 1
  for (let i = 0; i < len; i++) {
    result |= (aa[i] ?? 0) ^ (bb[i] ?? 0)
  }
  return result === 0
}

async function hmacKey(secret: string, usage: ('sign' | 'verify')[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usage,
  )
}

/**
 * Sign data string with secret key using HMAC-SHA256 (Base64url safe).
 */
export async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await hmacKey(secret, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  const binary = String.fromCharCode(...new Uint8Array(sig))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Verify HMAC-SHA256 signature.
 */
export async function hmacVerify(data: string, secret: string, sign: string): Promise<boolean> {
  try {
    const key = await hmacKey(secret, ['verify'])
    let base64 = sign.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) base64 += '='
    const sig = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    return crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(data))
  } catch {
    return false
  }
}

/**
 * Resolve expected password hash from environment (supports PASSWORD_HASH or plaintext PASSWORD).
 */
export async function getExpectedHash(env: Env): Promise<string> {
  if (env.PASSWORD_HASH) return env.PASSWORD_HASH
  if (env.PASSWORD) return await sha256(env.PASSWORD)
  return ''
}

/**
 * Parse cookie header string into key-value map.
 */
export function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx > -1) {
      const k = part.slice(0, idx).trim()
      const v = part.slice(idx + 1).trim()
      if (k) cookies[k] = v
    }
  }
  return cookies
}

/**
 * Authenticate incoming request against session cookie, Bearer token, or HMAC share query.
 */
export async function checkAuth(env: Env, request: Request): Promise<boolean> {
  const expected = await getExpectedHash(env)
  if (!expected) return true // No password set means open access

  // 1. Session cookie check
  const cookieHeader = request.headers.get('Cookie') ?? ''
  const cookies = parseCookies(cookieHeader)
  if (cookies['__session'] && timingSafeEqual(cookies['__session'], expected)) {
    return true
  }

  // 2. Authorization header check (Bearer <token_or_password>)
  const authHeader = request.headers.get('Authorization')
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (token) {
      if (timingSafeEqual(token, expected)) return true
      const hashedToken = await sha256(token)
      if (timingSafeEqual(hashedToken, expected)) return true
    }
  }

  // 3. HMAC share signature verification (?sign=...&expire=...)
  const url = new URL(request.url)
  const sign = url.searchParams.get('sign')
  const expire = url.searchParams.get('expire')
  if (sign && expire) {
    const expireMs = Number(expire)
    if (Number.isFinite(expireMs) && Date.now() < expireMs) {
      const pathClean = (url.pathname + url.search)
        .replace(/([?&])sign=[^&]+&?/, (_, p1: string) => (p1 === '?' ? '?' : ''))
        .replace(/[?&]$/, '')
      return hmacVerify(pathClean, expected, sign)
    }
  }

  return false
}

/**
 * Generate standard Set-Cookie headers for successful login.
 */
export function createSessionCookieHeaders(hash: string): [string, string][] {
  return [
    ['Set-Cookie', `__session=${hash}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`],
    ['Set-Cookie', `__auth=1; Path=/; Secure; SameSite=Strict; Max-Age=31536000`],
  ]
}
