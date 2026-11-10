import { describeKey, isGenericMime, TEXT_CONTENT_TYPE } from './mime'

export const STORE_HEADER_PREFIX = 'x-store-'
export const VISIBILITY_FIELD = 'x-store-visibility'
export const KIND_FIELD = 'x-store-type'

export type Visibility = 'public' | 'private'
export type StoreKind = 'file' | 'text'

type StoreMeta = Record<string, string>

/** 从请求头收集 x-store-* 自定义元数据（键名统一小写） */
export function pickStoreHeaders(headers: Headers): StoreMeta {
  const meta: StoreMeta = {}
  headers.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (lower.startsWith(STORE_HEADER_PREFIX)) meta[lower] = value.trim()
  })
  return meta
}

/** 未显式标记为私密的对象一律视为公开 */
export function visibilityOf(meta: StoreMeta | undefined): Visibility {
  return meta?.[VISIBILITY_FIELD] === 'private' ? 'private' : 'public'
}

export function isTextEntry(meta: StoreMeta | undefined): boolean {
  return meta?.[KIND_FIELD] === 'text'
}

/**
 * 计算对象最终的 Content-Type：
 * 文本片段固定为 UTF-8 纯文本，其余优先采用声明值，泛型二进制时按扩展名回退。
 */
export function resolveContentType(
  key: string,
  meta: StoreMeta | undefined,
  declared?: string | null
): string {
  if (isTextEntry(meta)) return TEXT_CONTENT_TYPE
  if (declared && !isGenericMime(declared)) return declared
  return describeKey(key).mime
}
