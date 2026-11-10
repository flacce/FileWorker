import type { Context } from 'hono'
import { setCookie } from 'hono/cookie'
import type { AppEnv } from '../bindings'
import { constantTimeEqual, hmacBase64Url } from '../core/crypto'

export const SESSION_COOKIE = '__session'
/** 前端路由守卫读取的可见标记 */
export const PRESENCE_COOKIE = '__auth'
/** 历史版本写入的明文口令 Cookie，仅用于兼容校验 */
export const LEGACY_PASSWORD_COOKIE = 'PASSWORD'

const SESSION_TTL_SECONDS = 365 * 24 * 60 * 60
const TOKEN_VERSION = 'v2'

function sessionPayload(expiresAt: number): string {
  return `fileworker-session|${expiresAt}`
}

/**
 * 会话令牌：v2.<过期秒级时间戳>.<HMAC 签名>
 * 令牌本身不包含口令或口令摘要，修改口令后旧令牌自动失效。
 */
export async function mintSessionToken(secret: string, now = Date.now()): Promise<string> {
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS
  const signature = await hmacBase64Url(secret, sessionPayload(expiresAt))
  return `${TOKEN_VERSION}.${expiresAt}.${signature}`
}

export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  const [version, expiresRaw, signature] = token.split('.')
  if (version !== TOKEN_VERSION || !expiresRaw || !signature) return false
  const expiresAt = Number(expiresRaw)
  if (!Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= Date.now()) return false
  const expected = await hmacBase64Url(secret, sessionPayload(expiresAt))
  return constantTimeEqual(signature, expected)
}

/** 登录成功后下发会话 Cookie；开放模式下只下发可见标记 */
export function issueSessionCookies(c: Context<AppEnv>, token: string | null) {
  const base = { path: '/', secure: true, sameSite: 'Lax', maxAge: SESSION_TTL_SECONDS } as const
  if (token) setCookie(c, SESSION_COOKIE, token, { ...base, httpOnly: true })
  setCookie(c, PRESENCE_COOKIE, '1', base)
  // 清理历史版本遗留的明文口令 Cookie
  setCookie(c, LEGACY_PASSWORD_COOKIE, '', { path: '/', secure: true, sameSite: 'Lax', maxAge: 0 })
}
