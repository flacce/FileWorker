const encoder = new TextEncoder()

type KeyMaterial = string | Uint8Array

function asBytes(input: KeyMaterial): BufferSource {
  return typeof input === 'string' ? encoder.encode(input) : input
}

export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Hex(input: KeyMaterial): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', asBytes(input))))
}

export async function hmacSha256(key: KeyMaterial, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    asBytes(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data)))
}

export async function hmacBase64Url(key: KeyMaterial, data: string): Promise<string> {
  return toBase64Url(await hmacSha256(key, data))
}

/** 常数时间字符串比较，长度不同也会走完整轮次 */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  const span = Math.max(left.length, right.length)
  let diff = left.length ^ right.length
  for (let i = 0; i < span; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  return diff === 0
}
