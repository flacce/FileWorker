import type { Bindings } from '../bindings'
import { sha256Hex } from '../core/crypto'

let cachedSource = ''
let cachedSecret = ''

/**
 * 解析访问密钥（口令的 SHA-256 摘要）。返回空串表示未设口令，处于开放模式。
 * 同一 isolate 内按配置值缓存，避免每次请求重复计算摘要。
 */
export async function resolveSecret(env: Bindings): Promise<string> {
  const source = `${env.PASSWORD_HASH ?? ''}\u0000${env.PASSWORD ?? ''}`
  if (source === cachedSource) return cachedSecret

  let secret = ''
  if (env.PASSWORD_HASH?.trim()) secret = env.PASSWORD_HASH.trim().toLowerCase()
  else if (env.PASSWORD) secret = await sha256Hex(env.PASSWORD)

  cachedSource = source
  cachedSecret = secret
  return secret
}
