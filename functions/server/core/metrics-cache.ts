import { describeKey, type AssetGroup } from './mime'

export interface BucketMetricsSnapshot {
  totalCount: number
  isTruncated: boolean
  totalSize: number
  typeCount: Record<AssetGroup, number>
}

interface CacheEntry {
  expiresAt: number
  value?: BucketMetricsSnapshot
  pending?: Promise<BucketMetricsSnapshot>
}

const CACHE_TTL_MS = 30_000
const MAX_STATS_PAGE_SIZE = 1000
const MAX_STATS_PAGES = 20
let cacheEntry: CacheEntry | undefined

async function scanBucket(bucket: R2Bucket): Promise<BucketMetricsSnapshot> {
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
    const page = await bucket.list({ limit: MAX_STATS_PAGE_SIZE, cursor })
    for (const object of page.objects) {
      totalCount++
      totalSize += object.size
      typeCount[describeKey(object.key).group]++
    }
    cursor = page.truncated ? page.cursor : undefined
    pages++
  } while (cursor && pages < MAX_STATS_PAGES)

  return { totalCount, isTruncated: Boolean(cursor), totalSize, typeCount }
}

export async function getCachedBucketMetrics(bucket: R2Bucket): Promise<BucketMetricsSnapshot> {
  const now = Date.now()
  let entry = cacheEntry
  if (entry?.value && entry.expiresAt > now) return entry.value
  if (entry?.pending) return await entry.pending

  if (!entry) {
    entry = { expiresAt: 0 }
    cacheEntry = entry
  }

  const current = entry
  const pending = scanBucket(bucket)
  current.pending = pending
  try {
    const value = await pending
    current.value = value
    current.expiresAt = Date.now() + CACHE_TTL_MS
    return value
  } finally {
    if (current.pending === pending) current.pending = undefined
  }
}

export function invalidateBucketMetrics() {
  cacheEntry = undefined
}
