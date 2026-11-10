import { Hono } from 'hono'
import type { AppEnv } from '../bindings'
import { safeDecode } from '../core/keys'
import { KIND_FIELD, VISIBILITY_FIELD } from '../core/metadata'
import { presignUrl } from '../core/presign'
import { asText, badRequest, errorMessage, readJsonBody } from '../core/request'
import { requireAuth } from '../security/guard'
import { resolveSecret } from '../security/secret'
import { createShareLink } from '../security/share'

const DEFAULT_SHARE_TTL = 24 * 60 * 60
const MAX_SHARE_TTL = 366 * 24 * 60 * 60
const UPLOAD_URL_TTL = 15 * 60
const DEFAULT_BUCKET_NAME = 'fff'

function shareTtl(raw: unknown): number {
  const value = typeof raw === 'string' ? Number(raw) : raw
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return DEFAULT_SHARE_TTL
  return Math.min(Math.floor(value), MAX_SHARE_TTL)
}

const delivery = new Hono<AppEnv>()

delivery.post('/sign', requireAuth, async (c) => {
  const secret = await resolveSecret(c.env)
  if (!secret) return c.json({ sign: '', expire: 0 })

  const body = await readJsonBody<{ key: string; expireInSeconds: number }>(c)
  const key = safeDecode(asText(body.key))
  if (!key) badRequest('缺少 key 参数')

  return c.json(await createShareLink(secret, key, shareTtl(body.expireInSeconds)))
})

delivery.post('/upload-url', requireAuth, async (c) => {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = c.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return c.json({
      supported: false,
      error:
        '未配置 R2 S3 API 密钥环境变量（R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY）'
    })
  }

  const body = await readJsonBody<{
    filename: string
    contentType: string
    visibility: string
    type: string
  }>(c)
  const filename = safeDecode(asText(body.filename))
  if (!filename) badRequest('参数 filename 无效')

  const contentType = asText(body.contentType) || 'application/octet-stream'
  const metadata: Record<string, string> = {
    [VISIBILITY_FIELD]: body.visibility === 'private' ? 'private' : 'public',
    [KIND_FIELD]: body.type === 'text' ? 'text' : 'file'
  }

  try {
    // 内容类型与元数据均纳入签名，客户端必须原样携带对应请求头
    const signedHeaders: Record<string, string> = { 'content-type': contentType }
    for (const [name, value] of Object.entries(metadata)) {
      signedHeaders[`x-amz-meta-${name}`] = value
    }

    const presignedUrl = await presignUrl({
      method: 'PUT',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      bucket: R2_BUCKET_NAME || DEFAULT_BUCKET_NAME,
      key: filename,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      expiresIn: UPLOAD_URL_TTL,
      signedHeaders
    })

    return c.json({ supported: true, presignedUrl, filename, contentType, metadata })
  } catch (err) {
    return c.json({ supported: false, error: errorMessage(err, '生成直传链接失败') }, 500)
  }
})

export default delivery
