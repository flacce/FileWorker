export type VisibilityMode = 'public' | 'private'
export type StoreKind = 'file' | 'text'

export type ResourceCategory =
  'all' | 'clip' | 'image' | 'media' | 'document' | 'code' | 'archive' | 'other'

export type RenderKind = 'image' | 'video' | 'audio' | 'pdf' | 'markdown' | 'text' | 'binary'

export type ViewLayout = 'list' | 'grid'
export type SortField = 'time' | 'size' | 'name'
export type SortDirection = 'asc' | 'desc'
export type WorkspaceMode = 'file' | 'clip'

export interface StorageObject {
  Key: string
  Size: number
  LastModified: string
  ETag?: string
  httpMetadata?: {
    contentType?: string
    contentDisposition?: string
  }
  customMetadata?: Record<string, string>
}

export interface RawListResponse {
  Contents?: Array<{
    Key?: string
    Size?: number
    LastModified?: string | null
    ETag?: string
    httpMetadata?: {
      contentType?: string
      contentDisposition?: string
    }
    customMetadata?: Record<string, string>
  }>
  IsTruncated?: boolean
  NextContinuationToken?: string
  KeyCount?: number
  MaxKeys?: number
  Name?: string
  Prefix?: string
  delimitedPrefixes?: string[]
}

export interface BucketMetrics {
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

export type TransferState = 'queued' | 'running' | 'done' | 'failed' | 'aborted'

export interface TransferRecord {
  id: string
  key: string
  size: number
  loaded: number
  percent: number
  rateBytes: number
  state: TransferState
  message?: string
  cancel?: () => void
}

export type NoticeTone = 'normal' | 'ok' | 'warn'

export interface NoticeEntry {
  id: number
  text: string
  tone: NoticeTone
}
