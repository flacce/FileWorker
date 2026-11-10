/** 宽容解码：遇到非法百分号序列时原样返回 */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function safeEncodeUri(value: string): string {
  try {
    return encodeURI(value)
  } catch {
    return value
  }
}

function distinct(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

export interface ObjectRef {
  /** 浏览器发送的原始百分号编码路径（不含前导斜杠） */
  raw: string
  /** 规范对象键（解码一次） */
  key: string
}

/** 直接从请求地址提取对象键，避免框架层的隐式解码 */
export function objectRefFromUrl(url: string): ObjectRef {
  const raw = new URL(url).pathname.replace(/^\/+/, '')
  return { raw, key: safeDecode(raw) }
}

/** 从请求体中的键（前端按路径段编码一次）构建引用 */
export function objectRefFromInput(input: string): ObjectRef {
  return { raw: input, key: safeDecode(input) }
}

/**
 * 读取时的候选键，按优先级排列。
 * 兼容历史版本以百分号编码形态直接写入 R2 的对象键。
 */
export function readCandidates(ref: ObjectRef): string[] {
  return distinct([ref.key, ref.raw, safeEncodeUri(ref.key), safeDecode(ref.key)])
}

/** 删除时需要一并清理的键形态 */
export function eraseCandidates(ref: ObjectRef): string[] {
  return distinct([ref.key, ref.raw])
}

/** 取对象键的末段文件名 */
export function leafName(key: string): string {
  const parts = key.split('/')
  return parts[parts.length - 1] || key
}
