import { leafName } from './keys'

export type AssetGroup = 'image' | 'video' | 'audio' | 'document' | 'code' | 'archive' | 'other'

export interface AssetKind {
  mime: string
  group: AssetGroup
  /** 是否强制以附件形式下载 */
  download: boolean
}

const UTF8 = '; charset=utf-8'
const PLAIN_TEXT = `text/plain${UTF8}`
const OCTET = 'application/octet-stream'

const registry = new Map<string, AssetKind>()
const downloadMimes = new Set<string>([OCTET])

function register(group: AssetGroup, mime: string, extensions: string, download = false) {
  for (const ext of extensions.split(/\s+/)) {
    registry.set(ext, { mime, group, download })
  }
  if (download) downloadMimes.add(mime)
}

// 图像
register('image', 'image/png', 'png')
register('image', 'image/jpeg', 'jpg jpeg jfif')
register('image', 'image/gif', 'gif')
register('image', 'image/webp', 'webp')
register('image', 'image/avif', 'avif')
register('image', 'image/svg+xml', 'svg')
register('image', 'image/x-icon', 'ico')
register('image', 'image/bmp', 'bmp')
register('image', 'image/tiff', 'tif tiff')
register('image', 'image/heic', 'heic')

// 视频
register('video', 'video/mp4', 'mp4')
register('video', 'video/webm', 'webm')
register('video', 'video/ogg', 'ogv')
register('video', 'video/quicktime', 'mov')
register('video', 'video/x-matroska', 'mkv')
register('video', 'video/x-msvideo', 'avi')
register('video', 'video/x-flv', 'flv')
register('video', 'video/x-m4v', 'm4v')

// 音频与播放列表
register('audio', 'audio/mpeg', 'mp3')
register('audio', 'audio/wav', 'wav')
register('audio', 'audio/flac', 'flac')
register('audio', 'audio/aac', 'aac')
register('audio', 'audio/mp4', 'm4a')
register('audio', 'audio/ogg', 'ogg oga opus')
register('audio', 'audio/webm', 'weba')
register('audio', `application/vnd.apple.mpegurl${UTF8}`, 'm3u8')

// 文档
register('document', 'application/pdf', 'pdf')
register('document', 'application/epub+zip', 'epub')
register('document', 'application/msword', 'doc')
register(
  'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'docx'
)
register('document', 'application/vnd.ms-excel', 'xls')
register('document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx')
register('document', 'application/vnd.ms-powerpoint', 'ppt')
register(
  'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'pptx'
)

// 文本与代码（以可内联预览的 UTF-8 文本下发）
register('code', `text/markdown${UTF8}`, 'md markdown')
register('code', `text/csv${UTF8}`, 'csv')
register('code', `text/tab-separated-values${UTF8}`, 'tsv')
register('code', `text/xml${UTF8}`, 'xml')
register('code', `text/yaml${UTF8}`, 'yml yaml')
register('code', `application/json${UTF8}`, 'json')
register('code', `text/javascript${UTF8}`, 'js mjs cjs')
register('code', `text/css${UTF8}`, 'css')
register('code', `text/html${UTF8}`, 'html htm')
register(
  'code',
  PLAIN_TEXT,
  'txt log env conf ini toml properties m3u ' +
    'ts mts tsx jsx vue svelte scss less py java kt go rs c cpp h hpp cs php rb lua r swift dart ' +
    'sh bash zsh ps1 bat sql'
)

// 归档与安装包（强制下载）
register('archive', 'application/zip', 'zip', true)
register('archive', 'application/x-rar-compressed', 'rar', true)
register('archive', 'application/x-7z-compressed', '7z', true)
register('archive', 'application/x-tar', 'tar', true)
register('archive', 'application/gzip', 'gz tgz', true)
register('archive', 'application/x-bzip2', 'bz2', true)
register('archive', 'application/x-xz', 'xz', true)
register('archive', 'application/x-iso9660-image', 'iso', true)
register('archive', 'application/x-apple-diskimage', 'dmg', true)
register('archive', 'application/vnd.android.package-archive', 'apk', true)
register('other', 'application/x-msdownload', 'exe msi', true)

const TEXT_SNIPPET: AssetKind = { mime: PLAIN_TEXT, group: 'code', download: false }
const UNKNOWN: AssetKind = { mime: OCTET, group: 'other', download: true }

export const TEXT_CONTENT_TYPE = PLAIN_TEXT

/** 取末段文件名的扩展名，没有扩展名返回空串 */
export function extensionOf(key: string): string {
  const leaf = leafName(key)
  const dot = leaf.lastIndexOf('.')
  if (dot < 0 || dot === leaf.length - 1) return ''
  return leaf.slice(dot + 1).toLowerCase()
}

/** 按对象键推断资源类型；无扩展名视为剪贴板文本片段 */
export function describeKey(key: string): AssetKind {
  const ext = extensionOf(key)
  if (!ext) return TEXT_SNIPPET
  return registry.get(ext) ?? UNKNOWN
}

function baseMime(contentType: string): string {
  return contentType.split(';')[0]!.trim().toLowerCase()
}

export function isGenericMime(contentType: string | null | undefined): boolean {
  return !contentType || baseMime(contentType) === OCTET
}

export function shouldDownload(contentType: string): boolean {
  const base = baseMime(contentType)
  for (const mime of downloadMimes) {
    if (baseMime(mime) === base) return true
  }
  return false
}
