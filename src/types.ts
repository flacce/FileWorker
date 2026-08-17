export type Visibility = 'public' | 'private'
export type StoreType = 'file' | 'text'

export type FileCategory =
  | 'all'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'code'
  | 'archive'
  | 'other'

export type PreviewType =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'markdown'
  | 'text'
  | 'none'

export interface FileItem {
  Key?: string
  Size?: number
  LastModified?: string | null
  ETag?: string
  httpMetadata?: {
    contentType?: string
    contentDisposition?: string
    [key: string]: unknown
  }
  customMetadata?: Record<string, string>
}

export interface ListFilesResult {
  Contents?: FileItem[]
  IsTruncated?: boolean
  NextContinuationToken?: string
  KeyCount?: number
  MaxKeys?: number
  Name?: string
  Prefix?: string
  delimitedPrefixes?: string[]
}

export interface StatsResult {
  totalCount: number
  isTruncated: boolean
  totalSize: number
  typeCount: {
    image: number
    video: number
    audio: number
    document: number
    code: number
    archive: number
    other: number
  }
}

export interface UploadTask {
  id: string
  file: File
  name: string
  size: number
  progress: number
  speed: number
  status: 'pending' | 'uploading' | 'success' | 'error' | 'cancelled'
  error?: string
  xhr?: XMLHttpRequest
}
