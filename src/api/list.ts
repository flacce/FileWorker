import { request } from './client'
import type { ListFilesResult, StatsResult } from '@/types'

export async function listFiles(options?: {
  maxKeys?: number | string
  prefix?: string
  continuationToken?: string
  delimiter?: string
}): Promise<ListFilesResult> {
  const params = new URLSearchParams()
  if (options?.maxKeys != null) params.set('MaxKeys', String(options.maxKeys))
  if (options?.prefix) params.set('Prefix', options.prefix)
  if (options?.continuationToken) {
    params.set('ContinuationToken', options.continuationToken)
  }
  if (options?.delimiter) params.set('delimiter', options.delimiter)

  const query = params.toString()
  const url = query ? `/api/list?${query}` : '/api/list'
  return await request<ListFilesResult>(url)
}

export async function getStats(): Promise<StatsResult> {
  return await request<StatsResult>('/api/stats')
}

/** @deprecated use listFiles */
export const ListFiles = (
  MaxKeys?: string,
  Prefix?: string,
  ContinuationToken?: string,
) =>
  listFiles({
    maxKeys: MaxKeys,
    prefix: Prefix,
    continuationToken: ContinuationToken,
  })
