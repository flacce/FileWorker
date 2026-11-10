import { Hono } from 'hono'
import type { AppEnv } from '../bindings'
import { describeKey, type AssetGroup } from '../core/mime'
import { errorMessage } from '../core/request'
import { requireAuth } from '../security/guard'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 1000
/** 统计时最多翻阅的页数，防止超大桶耗尽子请求配额 */
const STATS_PAGE_BUDGET = 20

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
      include: ['httpMetadata', 'customMetadata']
    })

    const contents = page.objects.map((object) => ({
      Key: object.key,
      Size: object.size,
      LastModified: object.uploaded.toISOString(),
      ETag: object.etag,
      httpMetadata: object.httpMetadata,
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
  const typeCount: Record<AssetGroup, number> = {
    image: 0,
    video: 0,
    audio: 0,
    document: 0,
    code: 0,
    archive: 0,
    other: 0
  }
  let totalCount = 0
  let totalSize = 0
  let cursor: string | undefined
  let pages = 0

  do {
    const page = await c.env.BUCKET.list({ limit: MAX_PAGE_SIZE, cursor })
    for (const object of page.objects) {
      totalCount++
      totalSize += object.size
      typeCount[describeKey(object.key).group]++
    }
    cursor = page.truncated ? page.cursor : undefined
    pages++
  } while (cursor && pages < STATS_PAGE_BUDGET)

  return c.json({ totalCount, isTruncated: Boolean(cursor), totalSize, typeCount })
})

export default catalog
