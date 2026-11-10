import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../bindings'
import { constantTimeEqual, sha256Hex } from '../core/crypto'
import { resolveSecret } from './secret'
import { LEGACY_PASSWORD_COOKIE, SESSION_COOKIE, verifySessionToken } from './session'
import { verifyShareSignature } from './share'

/** 判断一段凭据（口令明文、口令摘要）是否与配置匹配 */
async function matchesPassword(candidate: string, secret: string, plain?: string) {
  if (!candidate) return false
  if (plain && constantTimeEqual(candidate, plain)) return true
  if (constantTimeEqual(candidate.toLowerCase(), secret)) return true
  return constantTimeEqual(await sha256Hex(candidate), secret)
}

export async function verifyPassword(input: string, secret: string, plain?: string) {
  if (!input) return false
  if (plain && constantTimeEqual(input, plain)) return true
  return constantTimeEqual(await sha256Hex(input), secret)
}

function bearerToken(c: Context<AppEnv>): string {
  const header = c.req.header('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() ?? ''
}

interface IdentifyOptions {
  /** 是否接受对象直链上的临时签名 */
  allowShare?: boolean
}

/**
 * 依次校验：会话 Cookie → 历史口令 Cookie → Bearer 令牌 → 临时签名。
 * 未配置口令时直接放行。
 */
export async function isAuthorized(
  c: Context<AppEnv>,
  options: IdentifyOptions = {}
): Promise<boolean> {
  const secret = await resolveSecret(c.env)
  if (!secret) return true
  const plain = c.env.PASSWORD

  const session = getCookie(c, SESSION_COOKIE)
  if (session) {
    if (await verifySessionToken(session, secret)) return true
    // 兼容历史版本以口令摘要直接作为会话值
    if (constantTimeEqual(session, secret)) return true
  }

  const legacy = getCookie(c, LEGACY_PASSWORD_COOKIE)
  if (legacy && (await matchesPassword(legacy, secret, plain))) return true

  const bearer = bearerToken(c)
  if (bearer) {
    if (await verifySessionToken(bearer, secret)) return true
    if (await matchesPassword(bearer, secret, plain)) return true
  }

  if (options.allowShare) {
    const keys = plain ? [secret, plain] : [secret]
    if (await verifyShareSignature(c.req.url, keys)) return true
  }

  return false
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!(await isAuthorized(c))) return c.text('未授权访问', 401)
  await next()
})
