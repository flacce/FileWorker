import { Hono } from 'hono'
import type { AppEnv } from '../bindings'
import { errorMessage } from '../core/request'
import { getCachedBucketMetrics, invalidateBucketMetrics } from '../core/metrics-cache'
import { requireAuth } from '../security/guard'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 1000

function pageSize(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE
  return Math.min(Math.max(parsed, 1), MAX_PAGE_SIZE)
}

const catalog = new Hono<AppEnv>()

catalog.get('/list', requireAuth, async (c) => {
  const prefix = c.req.query('prefix') || undefined
  const delimiter = c.req.query('delimiter') || undefined
  const cursor = c.req.query('continuationToken') || c.req.query('cursor') || undefined
  const limit = pageSize(c.req.query('maxKeys'))

  try {
    const page = await c.env.BUCKET.list({
      prefix,
      delimiter,
      cursor,
      limit,
      include: ['customMetadata']
    })

    const contents = page.objects.map((object) => ({
      Key: object.key,
      Size: object.size,
      LastModified: object.uploaded.toISOString(),
      ETag: object.etag,
      customMetadata: object.customMetadata
    }))

    return c.json({
      Contents: contents,
      IsTruncated: page.truncated,
      NextContinuationToken: page.truncated ? page.cursor : undefined,
      KeyCount: contents.length,
      MaxKeys: limit,
      Name: 'BUCKET',
      Prefix: prefix ?? '',
      delimitedPrefixes: page.delimitedPrefixes
    })
  } catch (err) {
    return c.json({ error: errorMessage(err, '获取文件列表失败') }, 500)
  }
})

catalog.get('/stats', requireAuth, async (c) => {
  if (c.req.header('cache-control')?.includes('no-cache')) {
    invalidateBucketMetrics()
  }
  c.header('Cache-Control', 'private, no-store')
  return c.json(await getCachedBucketMetrics(c.env.BUCKET))
})

export default catalog
