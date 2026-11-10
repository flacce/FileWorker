import { hmacSha256, sha256Hex, toHex } from './crypto'

/**
 * 基于 Web Crypto 的 AWS Signature V4 查询串预签名（S3 兼容，适配 Cloudflare R2）。
 * 不引入 SDK，避免把数 MB 依赖打进边缘函数，也规避新版 SDK 默认附带空载荷校验和的问题。
 */
export interface PresignRequest {
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE'
  /** 例如 https://<account>.r2.cloudflarestorage.com */
  endpoint: string
  bucket: string
  key: string
  accessKeyId: string
  secretAccessKey: string
  expiresIn: number
  region?: string
  /** 需要纳入签名的请求头，客户端发起请求时必须原样携带 */
  signedHeaders?: Record<string, string>
  /** 附加查询参数（参与签名） */
  query?: Record<string, string>
  now?: Date
}

const ALGORITHM = 'AWS4-HMAC-SHA256'
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD'

/** RFC 3986 严格编码：在 encodeURIComponent 基础上补齐 !'()* */
export function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

function amzTimestamp(date: Date): { stamp: string; day: string } {
  const stamp = date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  return { stamp, day: stamp.slice(0, 8) }
}

async function deriveSigningKey(secret: string, day: string, region: string) {
  const kDate = await hmacSha256(`AWS4${secret}`, day)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, 's3')
  return hmacSha256(kService, 'aws4_request')
}

export async function presignUrl(request: PresignRequest): Promise<string> {
  const region = request.region ?? 'auto'
  const endpoint = new URL(request.endpoint)
  const { stamp, day } = amzTimestamp(request.now ?? new Date())
  const scope = `${day}/${region}/s3/aws4_request`

  const canonicalUri = `/${rfc3986(request.bucket)}/${request.key.split('/').map(rfc3986).join('/')}`

  const headers = new Map<string, string>([['host', endpoint.host]])
  for (const [name, value] of Object.entries(request.signedHeaders ?? {})) {
    headers.set(name.toLowerCase(), value.trim().replace(/\s+/g, ' '))
  }
  const headerNames = [...headers.keys()].sort()
  const signedHeaderList = headerNames.join(';')

  const params: Record<string, string> = {
    ...request.query,
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Content-Sha256': UNSIGNED_PAYLOAD,
    'X-Amz-Credential': `${request.accessKeyId}/${scope}`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(Math.floor(request.expiresIn)),
    'X-Amz-SignedHeaders': signedHeaderList
  }
  const canonicalQuery = Object.entries(params)
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const canonicalHeaders = headerNames.map((name) => `${name}:${headers.get(name)}\n`).join('')
  const canonicalRequest = [
    request.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaderList,
    UNSIGNED_PAYLOAD
  ].join('\n')

  const stringToSign = [ALGORITHM, stamp, scope, await sha256Hex(canonicalRequest)].join('\n')
  const signingKey = await deriveSigningKey(request.secretAccessKey, day, region)
  const signature = toHex(await hmacSha256(signingKey, stringToSign))

  return `${endpoint.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}
