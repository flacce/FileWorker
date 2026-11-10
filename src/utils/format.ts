import type { RenderKind, ResourceCategory, StorageObject, VisibilityMode } from '@/types'

const IMAGE_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'bmp',
  'avif',
  'tif',
  'tiff'
])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv', 'm4v'])
const AUDIO_EXTS = new Set(['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'oga', 'opus'])
const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'epub'])
const ARCHIVE_EXTS = new Set([
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'bz2',
  'xz',
  'tgz',
  'iso',
  'dmg',
  'apk'
])
const TEXT_EXTS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'yaml',
  'yml',
  'toml',
  'ini',
  'conf',
  'env',
  'xml',
  'csv',
  'tsv',
  'log',
  'sql',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'bat',
  'js',
  'mjs',
  'cjs',
  'ts',
  'mts',
  'jsx',
  'tsx',
  'vue',
  'svelte',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'py',
  'java',
  'kt',
  'go',
  'rs',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'php',
  'rb',
  'lua',
  'r',
  'swift',
  'dart',
  'm3u',
  'm3u8',
  'properties'
])

export function decodeKey(rawKey: string): string {
  try {
    return decodeURIComponent(rawKey)
  } catch {
    return rawKey
  }
}

export function encodeKeyPath(key: string): string {
  return decodeKey(key)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

export function buildObjectPath(key: string): string {
  return `/${encodeKeyPath(key)}`
}

export function buildPublicUrl(key: string): string {
  return `${window.location.origin}${buildObjectPath(key)}`
}

export function extractExt(key: string): string {
  const clean = decodeKey(key)
  const leaf = clean.split('/').pop() || ''
  const dot = leaf.lastIndexOf('.')
  if (dot <= 0 || dot === leaf.length - 1) return ''
  return leaf.slice(dot + 1).toLowerCase()
}

export function leafName(key: string, currentPrefix = ''): string {
  const clean = decodeKey(key)
  if (currentPrefix && clean.startsWith(currentPrefix)) {
    return clean.slice(currentPrefix.length)
  }
  return clean
}

export function isTextClipObject(item: StorageObject): boolean {
  if (item.customMetadata?.['x-store-type'] === 'text') return true
  const ext = extractExt(item.Key)
  return ext === ''
}

export function resolveVisibility(item: StorageObject): VisibilityMode {
  return item.customMetadata?.['x-store-visibility'] === 'private' ? 'private' : 'public'
}

export function classifyResource(item: StorageObject): ResourceCategory {
  if (isTextClipObject(item)) return 'clip'
  const ext = extractExt(item.Key)
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext)) return 'media'
  if (DOC_EXTS.has(ext)) return 'document'
  if (TEXT_EXTS.has(ext)) return 'code'
  if (ARCHIVE_EXTS.has(ext)) return 'archive'
  return 'other'
}

export function resolveRenderKind(item: StorageObject): RenderKind {
  if (item.customMetadata?.['x-store-type'] === 'text') {
    const ext = extractExt(item.Key)
    if (ext === 'md' || ext === 'markdown') return 'markdown'
    return 'text'
  }
  const ext = extractExt(item.Key)
  if (!ext) return 'text'
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (TEXT_EXTS.has(ext)) return 'text'
  return 'binary'
}

export function categoryLabel(cat: ResourceCategory): string {
  const labels: Record<ResourceCategory, string> = {
    all: '全部资源',
    clip: '云剪贴板',
    image: '图像画幅',
    media: '音视流媒',
    document: '版式文档',
    code: '代码文本',
    archive: '归档压缩',
    other: '其他二进制'
  }
  return labels[cat]
}

export function iconForObject(item: StorageObject): string {
  if (isTextClipObject(item)) return 'i-mdi-text-box-edit-outline'
  const ext = extractExt(item.Key)
  if (IMAGE_EXTS.has(ext)) return 'i-mdi-image-outline'
  if (VIDEO_EXTS.has(ext)) return 'i-mdi-movie-open-outline'
  if (AUDIO_EXTS.has(ext)) return 'i-mdi-waveform'
  if (ext === 'pdf') return 'i-mdi-file-document-outline'
  if (DOC_EXTS.has(ext)) return 'i-mdi-book-open-page-variant-outline'
  if (ext === 'md' || ext === 'markdown') return 'i-mdi-text-long'
  if (ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'toml') return 'i-mdi-code-json'
  if (TEXT_EXTS.has(ext)) return 'i-mdi-code-braces'
  if (ARCHIVE_EXTS.has(ext)) return 'i-mdi-archive-outline'
  return 'i-mdi-cube-outline'
}

export function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '0 字节'
  const units = ['字节', '千字节', '兆字节', '吉字节', '太字节']
  const base = 1024
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1)
  if (idx === 0) return `${bytes} 字节`
  const val = bytes / Math.pow(base, idx)
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[idx]}`
}

export function formatRate(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '计算中'
  return `${formatFileSize(bytesPerSec)}/秒`
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '未知时间'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '未知时间'

  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diffSec < 45) return '刚刚'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 8) return `${diffDay} 天前`

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const md = `${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return date.getFullYear() === now.getFullYear() ? md : `${date.getFullYear()}年${md}`
}

export function generateShortKey(length = 4): string {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length]
  }
  return out
}

export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}
