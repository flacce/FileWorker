import { constantTimeEqual, hmacBase64Url } from '../core/crypto'
import { safeDecode } from '../core/keys'

export interface ShareLink {
  key: string
  expire: number
  sign: string
  signedUrl: string
}

/**
 * 签名载荷格式与已分发的历史链接保持一致：
 *   /<encodeURIComponent(key)>?expire=<毫秒时间戳>
 * 签名算法：HMAC-SHA256(口令摘要, 载荷)，Base64URL 无填充。
 */
function sharePayload(encodedPath: string, expire: string | number): string {
  return `/${encodedPath}?expire=${expire}`
}

export async function createShareLink(
  secret: string,
  key: string,
  ttlSeconds: number,
  now = Date.now()
): Promise<ShareLink> {
  const encodedKey = encodeURIComponent(key)
  const expire = now + ttlSeconds * 1000
  const payload = sharePayload(encodedKey, expire)
  const sign = await hmacBase64Url(secret, payload)
  return { key: encodedKey, expire, sign, signedUrl: `${payload}&sign=${sign}` }
}

/** 校验对象直链上的临时签名（仅对象读取接口接受） */
export async function verifyShareSignature(
  requestUrl: string,
  signingKeys: string[]
): Promise<boolean> {
  const url = new URL(requestUrl)
  const sign = url.searchParams.get('sign')
  const expire = url.searchParams.get('expire')
  if (!sign || !expire || !/^\d+$/.test(expire)) return false
  if (Number(expire) <= Date.now()) return false

  const rawPath = url.pathname.replace(/^\/+/, '')
  const payloads = new Set([
    sharePayload(encodeURIComponent(safeDecode(rawPath)), expire),
    sharePayload(rawPath, expire)
  ])

  for (const key of signingKeys) {
    for (const payload of payloads) {
      if (constantTimeEqual(sign, await hmacBase64Url(key, payload))) return true
    }
  }
  return false
}
