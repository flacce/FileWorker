const MIME_TYPES: Record<string, string> = {
  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif',
  tiff: 'image/tiff',
  tif: 'image/tiff',

  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  flv: 'video/x-flv',
  m4v: 'video/x-m4v',

  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  weba: 'audio/webm',

  // Text & Markdown
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  tsv: 'text/tab-separated-values; charset=utf-8',
  xml: 'text/xml; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  env: 'text/plain; charset=utf-8',

  // Code formats (served as text/plain or specific UTF-8 text for inline view)
  json: 'application/json; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  ts: 'text/plain; charset=utf-8',
  tsx: 'text/plain; charset=utf-8',
  jsx: 'text/plain; charset=utf-8',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  py: 'text/plain; charset=utf-8',
  java: 'text/plain; charset=utf-8',
  go: 'text/plain; charset=utf-8',
  rs: 'text/plain; charset=utf-8',
  c: 'text/plain; charset=utf-8',
  cpp: 'text/plain; charset=utf-8',
  h: 'text/plain; charset=utf-8',
  hpp: 'text/plain; charset=utf-8',
  sh: 'text/plain; charset=utf-8',
  bash: 'text/plain; charset=utf-8',
  zsh: 'text/plain; charset=utf-8',
  toml: 'text/plain; charset=utf-8',
  ini: 'text/plain; charset=utf-8',
  sql: 'text/plain; charset=utf-8',
  lua: 'text/plain; charset=utf-8',
  php: 'text/plain; charset=utf-8',

  // Documents
  pdf: 'application/pdf',

  // Archives (force download)
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  bz2: 'application/x-bzip2',
  xz: 'application/x-xz',
  exe: 'application/x-msdownload',
  dmg: 'application/x-apple-diskimage',
  iso: 'application/x-iso9660-image',
  apk: 'application/vnd.android.package-archive',
}

const FORCE_ATTACHMENT_TYPES = new Set([
  'application/octet-stream',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-bzip2',
  'application/x-xz',
  'application/x-msdownload',
  'application/x-apple-diskimage',
  'application/vnd.android.package-archive',
])

export function guessMimeType(filename: string): string {
  const clean = filename.split('?')[0].split('#')[0]
  const ext = clean.includes('.') ? clean.split('.').pop()!.toLowerCase() : ''
  return MIME_TYPES[ext] || 'application/octet-stream'
}

export function isForceAttachment(contentType: string): boolean {
  const base = contentType.split(';')[0].trim().toLowerCase()
  return FORCE_ATTACHMENT_TYPES.has(base)
}

export function collectStoreHeaders(headers: Headers): Record<string, string> {
  const meta: Record<string, string> = {}
  headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower.startsWith('x-store-')) {
      meta[lower] = value
    }
  })
  return meta
}
