<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import StudioHeader from '@/components/StudioHeader.vue'
import AssetList from '@/components/AssetList.vue'
import InspectorDrawer from '@/components/InspectorDrawer.vue'
import CreateClipDrawer from '@/components/CreateClipDrawer.vue'
import UploadOverlay from '@/components/UploadOverlay.vue'
import {
  batchDeleteFiles,
  createUploadTask,
  deleteFile,
  getStats,
  listFiles,
} from '@/api'
import { copyToClipboard, decodeObjectKey, fileCategory, type FileCategory } from '@/utils/utils'
import { toast } from '@/utils/toast'
import type { FileItem, StatsResult, UploadTask, Visibility } from '@/types'

const route = useRoute()

// Data state
const files = ref<FileItem[]>([])
const stats = ref<StatsResult | null>(null)
const loading = ref(true)
const continuationToken = ref<string | undefined>(undefined)
const isTruncated = ref(false)

// UI & Filter state
const activeCategory = ref<FileCategory>('all')
const searchQuery = ref('')
const viewMode = ref<'list' | 'grid'>('list')
const selectedKey = ref<string | null>(null)
const selectedKeys = ref<Set<string>>(new Set())

// Modals and Drawers
const openCreateClip = ref(false)
const clipInitialText = ref('')
const dragActive = ref(false)
const uploadTasks = ref<UploadTask[]>([])

const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef')

const selectedFile = computed<FileItem | null>(() => {
  if (!selectedKey.value) return null
  return files.value.find((f) => f.Key === selectedKey.value) || null
})

// Sync initial category with route
watch(
  () => route.path,
  (path) => {
    if (path === '/clip') {
      activeCategory.value = 'code'
    } else if (path === '/file') {
      activeCategory.value = 'all'
    }
  },
  { immediate: true },
)

const filteredFiles = computed(() => {
  let list = files.value

  // Category filter
  if (activeCategory.value !== 'all') {
    if (activeCategory.value === 'other') {
      list = list.filter((f) => fileCategory(f.Key) !== 'code' && fileCategory(f.Key) !== 'image')
    } else {
      list = list.filter((f) => fileCategory(f.Key) === activeCategory.value)
    }
  }

  // Search filter
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter((f) =>
      decodeObjectKey(f.Key || '').toLowerCase().includes(q),
    )
  }

  return list
})

const refresh = async (reset = true) => {
  if (reset) {
    continuationToken.value = undefined
    files.value = []
    selectedKeys.value.clear()
  }
  loading.value = true
  try {
    const res = await listFiles({
      continuationToken: continuationToken.value,
      maxKeys: 50,
    })
    if (reset) {
      files.value = res.Contents ?? []
    } else {
      files.value.push(...(res.Contents ?? []))
    }
    isTruncated.value = res.IsTruncated ?? false
    continuationToken.value = res.NextContinuationToken

    // Fetch storage stats
    void getStats().then((s) => {
      stats.value = s
    }).catch(() => {})
  } catch {
    if (reset) files.value = []
  } finally {
    loading.value = false
  }
}

const loadMore = () => {
  if (isTruncated.value && !loading.value) {
    refresh(false)
  }
}

// Single select file
const onSelectFile = (file: FileItem) => {
  if (selectedKey.value === file.Key) {
    selectedKey.value = null
  } else {
    selectedKey.value = file.Key || null
  }
}

// Checkbox selection for batch actions
const toggleCheck = (key: string) => {
  if (selectedKeys.value.has(key)) {
    selectedKeys.value.delete(key)
  } else {
    selectedKeys.value.add(key)
  }
}

const selectAll = () => {
  if (selectedKeys.value.size === filteredFiles.value.length) {
    selectedKeys.value.clear()
  } else {
    filteredFiles.value.forEach((f) => {
      if (f.Key) selectedKeys.value.add(f.Key)
    })
  }
}

// Upload file list
const uploadFiles = (fileList: File[], visibility: Visibility = 'public') => {
  if (!fileList.length) return

  for (const file of fileList) {
    const taskId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    let lastLoaded = 0
    let lastTime = Date.now()

    const task: UploadTask = {
      id: taskId,
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      speed: 0,
      status: 'uploading',
    }

    const { promise, abort } = createUploadTask(
      file.name,
      file,
      visibility,
      (percent, loaded) => {
        task.progress = percent
        const now = Date.now()
        const dt = (now - lastTime) / 1000
        if (dt > 0.4) {
          task.speed = (loaded - lastLoaded) / dt
          lastLoaded = loaded
          lastTime = now
        }
      },
    )

    task.xhr = { abort } as unknown as XMLHttpRequest
    uploadTasks.value.unshift(task)

    promise
      .then(async () => {
        task.status = 'success'
        task.progress = 100
        toast(`已成功上传「${file.name}」`, 'success')
        await refresh(true)
        selectedKey.value = file.name
      })
      .catch((err: unknown) => {
        const error = err as Error
        if (error.name !== 'AbortError' && task.status !== 'cancelled') {
          task.status = 'error'
          task.error = error.message
        }
      })
  }
}

const cancelUpload = (taskId: string) => {
  const task = uploadTasks.value.find((t) => t.id === taskId)
  if (task && task.status === 'uploading') {
    task.xhr?.abort()
    task.status = 'cancelled'
    toast(`已取消「${task.name}」上传`, 'info')
  }
}

const clearUploadHistory = () => {
  uploadTasks.value = uploadTasks.value.filter((t) => t.status === 'uploading')
}

// Delete handlers
const onDelete = async (key: string) => {
  if (!window.confirm(`确认删除「${decodeObjectKey(key)}」？`)) return
  try {
    await deleteFile(key)
    toast('已删除', 'success')
    if (selectedKey.value === key) selectedKey.value = null
    await refresh(true)
  } catch {
    toast('删除失败', 'error')
  }
}

const onBatchDelete = async () => {
  const keys = Array.from(selectedKeys.value)
  if (!keys.length) return
  if (!window.confirm(`确认批量删除选中的 ${keys.length} 项？`)) return

  try {
    await batchDeleteFiles(keys)
    toast(`已删除 ${keys.length} 项`, 'success')
    selectedKeys.value.clear()
    selectedKey.value = null
    await refresh(true)
  } catch {
    toast('批量删除失败', 'error')
  }
}

const onBatchCopy = async () => {
  const keys = Array.from(selectedKeys.value)
  if (!keys.length) return
  const text = keys.map((k) => `${location.origin}/${k}`).join('\n')
  const ok = await copyToClipboard(text)
  toast(ok ? `已复制 ${keys.length} 个直链` : '复制失败', ok ? 'success' : 'error')
}

// Global Paste Anywhere Event Listener
const onGlobalPaste = (e: ClipboardEvent) => {
  // If target is an active input or CodeMirror editor, do not intercept
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('.cm-editor'))) {
    return
  }

  // 1. Files / Screenshots in clipboard
  if (e.clipboardData?.files.length) {
    e.preventDefault()
    uploadFiles(Array.from(e.clipboardData.files), 'public')
    toast('检测到剪贴板文件/截图，正在自动上传…', 'info')
    return
  }

  // 2. Plain text / Code snippet in clipboard
  const text = e.clipboardData?.getData('text')
  if (text && text.trim()) {
    e.preventDefault()
    clipInitialText.value = text
    openCreateClip.value = true
  }
}

// Global Drag-drop Listeners
let dragCounter = 0
const onGlobalDragEnter = (e: DragEvent) => {
  e.preventDefault()
  dragCounter++
  dragActive.value = true
}
const onGlobalDragLeave = (e: DragEvent) => {
  e.preventDefault()
  dragCounter--
  if (dragCounter <= 0) {
    dragActive.value = false
    dragCounter = 0
  }
}
const onGlobalDragOver = (e: DragEvent) => {
  e.preventDefault()
}
const onGlobalDrop = (e: DragEvent) => {
  e.preventDefault()
  dragActive.value = false
  dragCounter = 0
  if (e.dataTransfer?.files.length) {
    uploadFiles(Array.from(e.dataTransfer.files))
  }
}

onMounted(() => {
  void refresh()
  window.addEventListener('paste', onGlobalPaste)
  window.addEventListener('dragenter', onGlobalDragEnter)
  window.addEventListener('dragleave', onGlobalDragLeave)
  window.addEventListener('dragover', onGlobalDragOver)
  window.addEventListener('drop', onGlobalDrop)
})

onUnmounted(() => {
  window.removeEventListener('paste', onGlobalPaste)
  window.removeEventListener('dragenter', onGlobalDragEnter)
  window.removeEventListener('dragleave', onGlobalDragLeave)
  window.removeEventListener('dragover', onGlobalDragOver)
  window.removeEventListener('drop', onGlobalDrop)
})
</script>

<template>
  <div class="h-screen w-screen flex flex-col overflow-hidden bg-studio-bg select-none">
    <!-- Hidden File Input for header trigger -->
    <input
      ref="fileInputRef"
      type="file"
      class="hidden"
      multiple
      @change="fileInputRef?.files && uploadFiles(Array.from(fileInputRef.files)); (fileInputRef as HTMLInputElement).value = ''"
    />

    <!-- Header Toolbar -->
    <StudioHeader
      v-model:activeCategory="activeCategory"
      v-model:searchQuery="searchQuery"
      v-model:viewMode="viewMode"
      :stats="stats"
      :totalFilesCount="files.length"
      @triggerUpload="fileInputRef?.click()"
      @openNewClip="openCreateClip = true; clipInitialText = ''"
      @refresh="refresh(true)"
    />

    <!-- Studio Main Body (Asset List + Inspector Drawer) -->
    <div class="flex-1 flex min-h-0 relative overflow-hidden">
      <!-- Master Asset List -->
      <AssetList
        :files="filteredFiles"
        :loading="loading"
        :selectedKey="selectedKey"
        :selectedKeys="selectedKeys"
        :viewMode="viewMode"
        :isTruncated="isTruncated"
        @select="onSelectFile"
        @toggleCheck="toggleCheck"
        @selectAll="selectAll"
        @delete="onDelete"
        @batchDelete="onBatchDelete"
        @batchCopy="onBatchCopy"
        @loadMore="loadMore"
      />

      <!-- Right Detail Inspector Drawer -->
      <InspectorDrawer
        :file="selectedFile"
        @close="selectedKey = null"
        @refresh="refresh(false)"
        @delete="onDelete"
      />
    </div>

    <!-- Quick Create Clip Drawer -->
    <CreateClipDrawer
      :open="openCreateClip"
      :initialText="clipInitialText"
      @close="openCreateClip = false"
      @saved="refresh(true); selectedKey = $event"
    />

    <!-- Global Upload Drop Overlay & Task Floating Dock -->
    <UploadOverlay
      :dragActive="dragActive"
      :tasks="uploadTasks"
      @cancel="cancelUpload"
      @clear="clearUploadHistory"
    />
  </div>
</template>
