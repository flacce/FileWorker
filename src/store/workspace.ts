import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  BucketMetrics,
  ResourceCategory,
  SortDirection,
  SortField,
  StorageObject,
  TransferRecord,
  ViewLayout,
  VisibilityMode
} from '@/types'
import {
  changeObjectVisibility,
  deleteMultipleObjects,
  deleteSingleObject,
  HttpStatusError,
  moveObjectKey,
  queryBucketMetrics,
  queryObjects,
  startFileUpload
} from '@/api'
import { classifyResource, decodeKey, isTextClipObject } from '@/utils/format'
import { notify } from '@/composables/useNotice'

export const usePrefsStore = defineStore(
  'bento-prefs',
  () => {
    const defaultVisibility = ref<VisibilityMode>('public')
    const viewLayout = ref<ViewLayout>('list')
    const sortField = ref<SortField>('time')
    const sortDirection = ref<SortDirection>('desc')
    const expandedInspector = ref(false)

    function toggleVisibilityDefault() {
      defaultVisibility.value = defaultVisibility.value === 'public' ? 'private' : 'public'
    }

    return {
      defaultVisibility,
      viewLayout,
      sortField,
      sortDirection,
      expandedInspector,
      toggleVisibilityDefault
    }
  },
  { persist: true }
)

const MAX_CONCURRENT_UPLOADS = 3

export const useWorkspaceStore = defineStore('bento-workspace', () => {
  const objects = ref<StorageObject[]>([])
  const metrics = ref<BucketMetrics | null>(null)
  const loading = ref(false)
  const loadingMore = ref(false)
  const truncated = ref(false)
  const nextToken = ref<string | undefined>(undefined)

  const currentPrefix = ref('')
  const activeCategory = ref<ResourceCategory>('all')
  const searchQuery = ref('')

  const selectedKeys = ref<string[]>([])
  const activeKey = ref<string | null>(null)
  const creatingClip = ref(false)

  const transfers = ref<TransferRecord[]>([])
  const pendingFiles = new Map<string, { file: File; visibility: VisibilityMode }>()
  let runningCount = 0

  const activeObject = computed<StorageObject | null>(() => {
    if (!activeKey.value) return null
    return objects.value.find((item) => item.Key === activeKey.value) ?? null
  })

  // 计算各分类实时数量（基于已加载集合与统计接口结合）
  const categoryCounts = computed<Record<ResourceCategory, number>>(() => {
    const counts: Record<ResourceCategory, number> = {
      all: objects.value.length,
      clip: 0,
      image: 0,
      media: 0,
      document: 0,
      code: 0,
      archive: 0,
      other: 0
    }
    for (const item of objects.value) {
      const cat = classifyResource(item)
      counts[cat]++
    }
    return counts
  })

  // 派生当前前缀下的虚拟子目录（仅在无全局搜索词且分类为全部时展示层级）
  const virtualFolders = computed<string[]>(() => {
    if (searchQuery.value.trim() || activeCategory.value !== 'all') return []
    const prefix = currentPrefix.value
    const dirs = new Set<string>()
    for (const item of objects.value) {
      const clean = decodeKey(item.Key)
      if (!clean.startsWith(prefix)) continue
      const rest = clean.slice(prefix.length)
      const slashIdx = rest.indexOf('/')
      if (slashIdx > 0) {
        dirs.add(prefix + rest.slice(0, slashIdx + 1))
      }
    }
    return [...dirs].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  })

  // 过滤与排序后的可见资源列表
  const visibleObjects = computed<StorageObject[]>(() => {
    const prefs = usePrefsStore()
    const kw = searchQuery.value.trim().toLowerCase()
    const prefix = currentPrefix.value
    const cat = activeCategory.value

    const filtered = objects.value.filter((item) => {
      const clean = decodeKey(item.Key)

      if (kw) {
        if (!clean.toLowerCase().includes(kw)) return false
      } else if (cat === 'all') {
        if (!clean.startsWith(prefix)) return false
        const rest = clean.slice(prefix.length)
        if (!rest || rest.includes('/')) return false
      }

      if (cat !== 'all' && classifyResource(item) !== cat) {
        return false
      }

      return true
    })

    const dirFactor = prefs.sortDirection === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (prefs.sortField === 'size') {
        return ((a.Size ?? 0) - (b.Size ?? 0)) * dirFactor
      }
      if (prefs.sortField === 'name') {
        return decodeKey(a.Key).localeCompare(decodeKey(b.Key), 'zh-CN') * dirFactor
      }
      const ta = a.LastModified ? new Date(a.LastModified).getTime() : 0
      const tb = b.LastModified ? new Date(b.LastModified).getTime() : 0
      return (ta - tb) * dirFactor
    })
  })

  const activeTransferCount = computed(
    () => transfers.value.filter((t) => t.state === 'queued' || t.state === 'running').length
  )

  async function refreshList() {
    loading.value = true
    try {
      const res = await queryObjects({ maxKeys: 300 })
      objects.value = res.items
      truncated.value = res.truncated
      nextToken.value = res.nextToken

      if (activeKey.value && !objects.value.some((i) => i.Key === activeKey.value)) {
        activeKey.value = null
      }
      selectedKeys.value = selectedKeys.value.filter((k) => objects.value.some((i) => i.Key === k))
    } finally {
      loading.value = false
    }
  }

  async function loadMoreObjects() {
    if (!truncated.value || !nextToken.value || loadingMore.value) return
    loadingMore.value = true
    try {
      const res = await queryObjects({
        maxKeys: 300,
        continuationToken: nextToken.value
      })
      const existing = new Set(objects.value.map((i) => i.Key))
      for (const item of res.items) {
        if (!existing.has(item.Key)) {
          objects.value.push(item)
        }
      }
      truncated.value = res.truncated
      nextToken.value = res.nextToken
    } finally {
      loadingMore.value = false
    }
  }

  async function refreshMetrics() {
    try {
      metrics.value = await queryBucketMetrics()
    } catch {
      // 统计失败不阻塞主列表
    }
  }

  async function bootstrap() {
    await Promise.all([refreshList(), refreshMetrics()])
  }

  function inspectObject(key: string | null) {
    creatingClip.value = false
    activeKey.value = key
  }

  function openClipCreator() {
    activeKey.value = null
    creatingClip.value = true
  }

  function enterFolder(folderPrefix: string) {
    currentPrefix.value = folderPrefix
    selectedKeys.value = []
  }

  function navigateUp() {
    if (!currentPrefix.value) return
    const trimmed = currentPrefix.value.replace(/\/$/, '')
    const idx = trimmed.lastIndexOf('/')
    currentPrefix.value = idx >= 0 ? trimmed.slice(0, idx + 1) : ''
    selectedKeys.value = []
  }

  function toggleSelection(key: string) {
    const idx = selectedKeys.value.indexOf(key)
    if (idx >= 0) {
      selectedKeys.value.splice(idx, 1)
    } else {
      selectedKeys.value.push(key)
    }
  }

  function toggleSelectAllVisible() {
    const visibleKeys = visibleObjects.value.map((i) => i.Key)
    if (!visibleKeys.length) return
    const allChecked = visibleKeys.every((k) => selectedKeys.value.includes(k))
    if (allChecked) {
      const removeSet = new Set(visibleKeys)
      selectedKeys.value = selectedKeys.value.filter((k) => !removeSet.has(k))
    } else {
      const merged = new Set([...selectedKeys.value, ...visibleKeys])
      selectedKeys.value = [...merged]
    }
  }

  function clearSelection() {
    selectedKeys.value = []
  }

  function enqueueUploads(fileList: File[] | FileList, customPrefix?: string) {
    const prefs = usePrefsStore()
    const files = Array.from(fileList)
    if (!files.length) return

    const basePrefix = customPrefix ?? currentPrefix.value
    for (const file of files) {
      const relPath =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      const key = `${basePrefix}${relPath.replace(/^\/+/, '')}`
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      transfers.value.unshift({
        id,
        key,
        size: file.size,
        loaded: 0,
        percent: 0,
        rateBytes: 0,
        state: 'queued'
      })
      pendingFiles.set(id, {
        file,
        visibility: prefs.defaultVisibility
      })
    }

    notify(`已加入 ${files.length} 项上传队列`, 'normal')
    pumpTransferQueue()
  }

  function pumpTransferQueue() {
    while (runningCount < MAX_CONCURRENT_UPLOADS) {
      const next = transfers.value.find((item) => item.state === 'queued')
      if (!next) break
      const meta = pendingFiles.get(next.id)
      if (!meta) {
        next.state = 'failed'
        next.message = '源文件丢失'
        continue
      }
      runSingleTransfer(next, meta.file, meta.visibility)
    }
  }

  function runSingleTransfer(record: TransferRecord, file: File, visibility: VisibilityMode) {
    runningCount++
    record.state = 'running'
    let lastLoaded = 0
    let lastStamp = performance.now()

    const handle = startFileUpload(record.key, file, visibility, (loaded, total) => {
      const now = performance.now()
      const elapsedSec = (now - lastStamp) / 1000
      if (elapsedSec >= 0.25) {
        const instantRate = (loaded - lastLoaded) / elapsedSec
        record.rateBytes =
          record.rateBytes > 0 ? record.rateBytes * 0.6 + instantRate * 0.4 : instantRate
        lastLoaded = loaded
        lastStamp = now
      }
      record.loaded = loaded
      record.percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0
    })

    record.cancel = handle.cancel

    handle.done
      .then(() => {
        record.state = 'done'
        record.percent = 100
        record.loaded = record.size
        record.rateBytes = 0
      })
      .catch((err: unknown) => {
        if (err instanceof HttpStatusError && err.code === -1) {
          record.state = 'aborted'
          record.message = '已手动取消'
        } else {
          record.state = 'failed'
          record.message = err instanceof Error ? err.message : '上传异常'
        }
        record.rateBytes = 0
      })
      .finally(() => {
        pendingFiles.delete(record.id)
        record.cancel = undefined
        runningCount = Math.max(0, runningCount - 1)
        if (activeTransferCount.value === 0) {
          void bootstrap()
        } else {
          pumpTransferQueue()
        }
      })
  }

  function cancelTransfer(id: string) {
    const target = transfers.value.find((t) => t.id === id)
    if (!target) return
    if (target.state === 'queued') {
      pendingFiles.delete(id)
      target.state = 'aborted'
      target.message = '已取消排队'
      return
    }
    target.cancel?.()
  }

  function pruneFinishedTransfers() {
    transfers.value = transfers.value.filter((t) => t.state === 'queued' || t.state === 'running')
  }

  async function toggleObjectVisibility(item: StorageObject) {
    const current = item.customMetadata?.['x-store-visibility'] === 'private' ? 'private' : 'public'
    const next: VisibilityMode = current === 'public' ? 'private' : 'public'
    const storeKind = isTextClipObject(item) ? 'text' : 'file'

    await changeObjectVisibility(item.Key, next, storeKind)
    item.customMetadata = {
      ...(item.customMetadata ?? {}),
      'x-store-visibility': next,
      'x-store-type': storeKind
    }
    notify(next === 'public' ? '已设为公开直链访问' : '已设为私密受控访问', 'ok')
  }

  async function renameSingleObject(oldKey: string, newKey: string) {
    const cleanNew = newKey.trim().replace(/^\/+/, '')
    if (!cleanNew || cleanNew === decodeKey(oldKey)) return
    await moveObjectKey(oldKey, cleanNew)
    notify('对象重命名已完成', 'ok')
    await refreshList()
    const matched = objects.value.find((i) => decodeKey(i.Key) === cleanNew)
    if (matched) {
      activeKey.value = matched.Key
    }
  }

  async function deleteObject(key: string) {
    await deleteSingleObject(key)
    objects.value = objects.value.filter((i) => i.Key !== key)
    selectedKeys.value = selectedKeys.value.filter((k) => k !== key)
    if (activeKey.value === key) {
      activeKey.value = null
    }
    notify('对象已永久移除', 'ok')
    void refreshMetrics()
  }

  async function deleteBatchSelected() {
    const keys = [...selectedKeys.value]
    if (!keys.length) return
    const count = await deleteMultipleObjects(keys)
    const removed = new Set(keys)
    objects.value = objects.value.filter((i) => !removed.has(i.Key))
    if (activeKey.value && removed.has(activeKey.value)) {
      activeKey.value = null
    }
    selectedKeys.value = []
    notify(`已批量移除 ${count} 项资源`, 'ok')
    void refreshMetrics()
  }

  return {
    objects,
    metrics,
    loading,
    loadingMore,
    truncated,
    currentPrefix,
    activeCategory,
    searchQuery,
    selectedKeys,
    activeKey,
    creatingClip,
    transfers,
    activeObject,
    categoryCounts,
    virtualFolders,
    visibleObjects,
    activeTransferCount,
    refreshList,
    loadMoreObjects,
    refreshMetrics,
    bootstrap,
    inspectObject,
    openClipCreator,
    enterFolder,
    navigateUp,
    toggleSelection,
    toggleSelectAllVisible,
    clearSelection,
    enqueueUploads,
    cancelTransfer,
    pruneFinishedTransfers,
    toggleObjectVisibility,
    renameSingleObject,
    deleteObject,
    deleteBatchSelected
  }
})
