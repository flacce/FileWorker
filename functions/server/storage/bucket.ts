/** 按候选键依次读取完整对象，命中即返回 */
export async function locateObject(
  bucket: R2Bucket,
  candidates: string[]
): Promise<R2ObjectBody | null> {
  for (const key of candidates) {
    const object = await bucket.get(key)
    if (object) return object
  }
  return null
}

export class RangeNotSatisfiableError extends Error {
  constructor() {
    super('请求的字节范围无效')
    this.name = 'RangeNotSatisfiableError'
  }
}

/**
 * 带条件请求与区间请求的读取：直接把客户端请求头交给 R2 解析。
 * 条件不满足时返回不含 body 的 R2Object。
 */
export async function fetchObject(
  bucket: R2Bucket,
  candidates: string[],
  requestHeaders: Headers
): Promise<R2Object | R2ObjectBody | null> {
  const options: R2GetOptions = { onlyIf: requestHeaders }
  if (requestHeaders.has('range')) options.range = requestHeaders

  for (const key of candidates) {
    try {
      const object = await bucket.get(key, options)
      if (object) return object
    } catch (err) {
      if (err instanceof Error && /range/i.test(err.message)) throw new RangeNotSatisfiableError()
      throw err
    }
  }
  return null
}

export function hasBody(object: R2Object | R2ObjectBody): object is R2ObjectBody {
  return 'body' in object && Boolean(object.body)
}

/**
 * 按 HTTP Range 请求头与对象总大小计算闭区间字节偏移；
 * 区间越界或语法非法时返回 null（对应 416 响应）。
 */
export function resolveByteRange(
  rangeHeader: string,
  size: number
): { start: number; end: number } | null {
  if (size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!match) return null

  const [, startRaw, endRaw] = match
  if (!startRaw && !endRaw) return null

  if (!startRaw) {
    const suffix = Number(endRaw)
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null
    const length = Math.min(suffix, size)
    return { start: size - length, end: size - 1 }
  }

  const start = Number(startRaw)
  const requestedEnd = endRaw ? Number(endRaw) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)) return null
  if (start >= size || requestedEnd < start) return null

  return { start, end: Math.min(requestedEnd, size - 1) }
}
