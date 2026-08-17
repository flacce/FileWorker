export function getRandomFilename(length = 6): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length]
  }
  return out
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(
    sizes.length - 1,
    Math.floor(Math.log(bytes) / Math.log(k)),
  )
  const value = bytes / k ** i
  return `${parseFloat(value.toFixed(decimals))} ${sizes[i]}`
}

export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / 1000

    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`

    return d.toLocaleDateString('zh-CN', {
      year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export function decodeObjectKey(key: string): string {
  try {
    return decodeURIComponent(key)
  } catch {
    return key
  }
}

export function encodeObjectKey(name: string): string {
  return name
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}

export type FileCategory =
  | 'all'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'code'
  | 'archive'
  | 'other'

export function fileCategory(key: string | undefined): FileCategory {
  if (!key) return 'other'
  const ext = key.includes('.') ? key.split('.').pop()!.toLowerCase() : ''
  const images = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif', 'tiff', 'tif'])
  const videos = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogg', 'flv', 'm4v'])
  const audios = new Set(['mp3', 'wav', 'flac', 'aac', 'm4a', 'oga', 'opus', 'weba'])
  const documents = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'epub'])
  const codes = new Set([
    'txt', 'md', 'markdown', 'json', 'xml', 'yml', 'yaml', 'csv', 'tsv',
    'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h',
    'hpp', 'css', 'html', 'sh', 'bash', 'zsh', 'toml', 'ini', 'sql', 'lua',
  ])
  const archives = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg', 'apk'])

  if (images.has(ext)) return 'image'
  if (videos.has(ext)) return 'video'
  if (audios.has(ext)) return 'audio'
  if (documents.has(ext)) return 'document'
  if (codes.has(ext)) return 'code'
  if (archives.has(ext)) return 'archive'
  return 'other'
}

export function fileIcon(key: string | undefined): string {
  if (!key) return 'i-mdi-file-outline'
  const ext = key.includes('.') ? key.split('.').pop()!.toLowerCase() : ''
  const map: Record<string, string> = {
    // 文本 & Markdown
    txt: 'i-mdi-file-document-outline',
    md: 'i-mdi-language-markdown-outline',
    markdown: 'i-mdi-language-markdown-outline',
    json: 'i-mdi-code-json',
    xml: 'i-mdi-xml',
    csv: 'i-mdi-file-table-outline',
    tsv: 'i-mdi-file-table-outline',
    log: 'i-mdi-file-clock-outline',
    // 编程语言
    js: 'i-mdi-language-javascript',
    mjs: 'i-mdi-language-javascript',
    ts: 'i-mdi-language-typescript',
    jsx: 'i-mdi-language-javascript',
    tsx: 'i-mdi-language-typescript',
    py: 'i-mdi-language-python',
    java: 'i-mdi-language-java',
    go: 'i-mdi-language-go',
    rs: 'i-mdi-language-rust',
    css: 'i-mdi-language-css3',
    html: 'i-mdi-language-html5',
    sh: 'i-mdi-console',
    bash: 'i-mdi-console',
    sql: 'i-mdi-database',
    // 图片
    png: 'i-mdi-file-image-outline',
    jpg: 'i-mdi-file-image-outline',
    jpeg: 'i-mdi-file-image-outline',
    gif: 'i-mdi-file-gif-box',
    webp: 'i-mdi-file-image-outline',
    svg: 'i-mdi-svg',
    ico: 'i-mdi-file-image-outline',
    avif: 'i-mdi-file-image-outline',
    // 文档
    pdf: 'i-mdi-file-pdf-box',
    doc: 'i-mdi-file-word-outline',
    docx: 'i-mdi-file-word-outline',
    xls: 'i-mdi-file-excel-outline',
    xlsx: 'i-mdi-file-excel-outline',
    ppt: 'i-mdi-file-powerpoint-outline',
    pptx: 'i-mdi-file-powerpoint-outline',
    // 音视频
    mp4: 'i-mdi-file-video-outline',
    webm: 'i-mdi-file-video-outline',
    avi: 'i-mdi-file-video-outline',
    mkv: 'i-mdi-file-video-outline',
    mov: 'i-mdi-file-video-outline',
    mp3: 'i-mdi-file-music-outline',
    wav: 'i-mdi-file-music-outline',
    flac: 'i-mdi-file-music-outline',
    ogg: 'i-mdi-file-music-outline',
    // 压缩
    zip: 'i-mdi-folder-zip-outline',
    rar: 'i-mdi-folder-zip-outline',
    '7z': 'i-mdi-folder-zip-outline',
    tar: 'i-mdi-folder-zip-outline',
    gz: 'i-mdi-folder-zip-outline',
    dmg: 'i-mdi-package-variant-closed',
    apk: 'i-mdi-android',
  }
  return map[ext] || 'i-mdi-file-outline'
}

export type PreviewType =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'markdown'
  | 'text'
  | 'none'

export function getPreviewType(key: string | undefined): PreviewType {
  if (!key) return 'none'
  const ext = key.includes('.') ? key.split('.').pop()!.toLowerCase() : ''
  const images = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif', 'tiff', 'tif'])
  const videos = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogg', 'flv', 'm4v'])
  const audios = new Set(['mp3', 'wav', 'flac', 'aac', 'm4a', 'oga', 'opus', 'weba'])
  const texts = new Set([
    'txt', 'csv', 'tsv', 'xml', 'yml', 'yaml', 'json',
    'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'htm',
    'py', 'java', 'go', 'rs', 'sh', 'bash', 'zsh', 'c', 'cpp', 'h',
    'toml', 'ini', 'log', 'sql', 'lua', 'env',
  ])

  if (images.has(ext)) return 'image'
  if (videos.has(ext)) return 'video'
  if (audios.has(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (texts.has(ext)) return 'text'
  return 'none'
}
