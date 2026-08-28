<script setup lang="ts">
import { computed } from 'vue'
import {
  copyToClipboard,
  decodeObjectKey,
  fileIcon,
  formatBytes,
  formatDate,
  getPreviewType,
} from '@/utils/utils'
import { toast } from '@/utils/toast'
import type { FileItem } from '@/types'

const props = defineProps<{
  files: FileItem[]
  loading: boolean
  selectedKey: string | null
  selectedKeys: Set<string>
  viewMode: 'list' | 'grid'
  isTruncated: boolean
}>()

const emit = defineEmits<{
  'select': [file: FileItem]
  'toggleCheck': [key: string]
  'selectAll': []
  'delete': [key: string]
  'batchDelete': []
  'batchCopy': []
  'loadMore': []
}>()

const isAllSelected = computed(() => {
  if (!props.files.length) return false
  return props.files.every((f) => f.Key && props.selectedKeys.has(f.Key))
})

const onCopy = async (key?: string) => {
  if (!key) return
  const url = `${location.origin}/${encodeURIComponent(decodeURIComponent(key))}`
  const ok = await copyToClipboard(url)
  toast(ok ? '直链已复制' : '复制失败', ok ? 'success' : 'error')
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 relative overflow-hidden bg-studio-bg select-none">
    <!-- List / Grid Content Container -->
    <div class="flex-1 overflow-y-auto min-h-0 p-3 sm:p-4">
      <div class="max-w-7xl mx-auto w-full">
        <!-- Loading Skeleton -->
        <div v-if="loading && !files.length" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          <div v-for="i in 9" :key="i" class="h-12 rounded-xl bg-studio-surface border border-white/5 animate-pulse-subtle flex items-center px-3.5 gap-3">
            <div class="w-6 h-6 rounded bg-white/10 shrink-0"></div>
            <div class="h-3 rounded bg-white/10 w-1/3"></div>
            <div class="ml-auto h-3 rounded bg-white/10 w-14 shrink-0"></div>
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-else-if="!files.length"
          class="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500 min-h-[300px]"
        >
          <div class="w-14 h-14 rounded-2xl bg-studio-surface border border-white/8 flex items-center justify-center text-zinc-600 mb-3">
            <div class="i-mdi-folder-open-outline text-2xl"></div>
          </div>
          <p class="text-sm font-medium text-zinc-300">暂无任何文件或剪贴板</p>
          <p class="text-xs text-zinc-500 mt-1 max-w-xs">
            直接按 <kbd class="px-1.5 py-0.5 rounded bg-zinc-800 border border-white/10 font-mono text-[10px] text-zinc-300">Ctrl + V</kbd> 粘贴任意内容，或拖拽文件至此快速上传
          </p>
        </div>

        <!-- List View Mode -->
        <div v-else-if="viewMode === 'list'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          <div
            v-for="file in files"
            :key="file.Key"
            class="group flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all cursor-pointer select-none relative overflow-hidden"
            :class="[
              selectedKey === file.Key
                ? 'bg-edge-orange/10 border-edge-orange/40 text-white shadow-sm ring-1 ring-edge-orange/30'
                : selectedKeys.has(file.Key || '')
                  ? 'bg-white/8 border-white/25 text-white'
                  : 'bg-studio-surface/80 border-white/6 hover:border-white/20 hover:bg-studio-surface text-zinc-300 shadow-sm'
            ]"
            @click="emit('select', file)"
          >
            <!-- Checkbox -->
            <button
              type="button"
              class="text-zinc-500 hover:text-white transition-colors shrink-0"
              @click.stop="file.Key && emit('toggleCheck', file.Key)"
            >
              <div
                :class="
                  selectedKeys.has(file.Key || '')
                    ? 'i-mdi-checkbox-marked text-edge-orange'
                    : 'i-mdi-checkbox-blank-outline opacity-40 group-hover:opacity-100'
                "
                class="text-base"
              ></div>
            </button>

            <!-- Type Icon -->
            <div class="w-6 h-6 rounded flex items-center justify-center shrink-0 text-zinc-400 group-hover:text-edge-orange transition-colors">
              <div :class="fileIcon(file.Key)" class="text-base"></div>
            </div>

            <!-- Filename -->
            <div class="min-w-0 flex-1 flex items-center gap-1.5 overflow-hidden">
              <span class="truncate text-xs font-medium text-zinc-200 group-hover:text-white" :title="decodeObjectKey(file.Key || '')">
                {{ decodeObjectKey(file.Key || '') }}
              </span>
              <span
                v-if="file.customMetadata?.['x-store-visibility'] === 'public'"
                class="badge-public shrink-0 text-[10px] px-1 py-0"
              >
                公开
              </span>
            </div>

            <!-- Metadata -->
            <div class="flex items-center gap-1 font-mono text-[10px] text-zinc-500 shrink-0">
              <span>{{ formatBytes(file.Size ?? 0) }}</span>
            </div>

            <!-- Hover Action Buttons -->
            <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                class="btn-ghost p-1"
                title="复制直链"
                @click.stop="onCopy(file.Key)"
              >
                <div class="i-mdi-link-variant text-xs"></div>
              </button>
              <a
                class="btn-ghost p-1"
                title="下载"
                :href="`/${encodeURIComponent(decodeURIComponent(file.Key || ''))}`"
                :download="decodeObjectKey(file.Key || '')"
                @click.stop
              >
                <div class="i-mdi-download text-xs"></div>
              </a>
              <button
                class="btn-ghost p-1 hover:text-rose-400"
                title="删除"
                @click.stop="file.Key && emit('delete', file.Key)"
              >
                <div class="i-mdi-delete-outline text-xs"></div>
              </button>
            </div>
          </div>
        </div>

        <!-- Grid View Mode -->
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
          <div
            v-for="file in files"
            :key="file.Key"
            class="group relative flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer overflow-hidden"
            :class="[
              selectedKey === file.Key
                ? 'bg-edge-orange/10 border-edge-orange/40 text-white'
                : selectedKeys.has(file.Key || '')
                  ? 'bg-white/6 border-white/20 text-white'
                  : 'bg-studio-surface/70 border-white/6 hover:border-white/16 hover:bg-studio-surface text-zinc-300'
            ]"
            @click="emit('select', file)"
          >
            <!-- Top bar in card -->
            <div class="flex items-center justify-between">
              <div class="w-7 h-7 rounded-lg bg-black/30 border border-white/8 flex items-center justify-center text-zinc-400 group-hover:text-edge-orange transition-colors">
                <div :class="fileIcon(file.Key)" class="text-sm"></div>
              </div>

              <!-- Checkbox -->
              <button
                type="button"
                class="text-zinc-500 hover:text-white transition-colors"
                @click.stop="file.Key && emit('toggleCheck', file.Key)"
              >
                <div
                  :class="
                    selectedKeys.has(file.Key || '')
                      ? 'i-mdi-checkbox-marked text-edge-orange'
                      : 'i-mdi-checkbox-blank-outline opacity-40 group-hover:opacity-100'
                  "
                  class="text-base"
                ></div>
              </button>
            </div>

            <!-- Image Preview Thumbnail if available -->
            <div
              v-if="getPreviewType(file.Key) === 'image'"
              class="my-2 h-20 w-full rounded-lg bg-black/40 overflow-hidden flex items-center justify-center border border-white/5"
            >
              <img
                :src="`/${encodeURIComponent(decodeURIComponent(file.Key || ''))}`"
                :alt="decodeObjectKey(file.Key || '')"
                class="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </div>
            <div v-else class="my-3"></div>

            <!-- Filename & meta -->
            <div class="min-w-0">
              <p class="truncate text-xs font-semibold text-zinc-200 group-hover:text-white" :title="decodeObjectKey(file.Key || '')">
                {{ decodeObjectKey(file.Key || '') }}
              </p>
              <div class="flex items-center justify-between font-mono text-[10px] text-zinc-500 mt-1">
                <span>{{ formatBytes(file.Size ?? 0) }}</span>
                <span>{{ formatDate(file.LastModified) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Load More Button -->
        <div v-if="isTruncated" class="p-4 flex justify-center">
          <button class="btn-secondary px-6" :disabled="loading" @click="emit('loadMore')">
            <div v-if="loading" class="i-mdi-loading animate-spin text-xs"></div>
            <span>加载更多历史文件</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Floating Batch Selection Action Dock -->
    <Transition name="fade-in">
      <div
        v-if="selectedKeys.size > 0"
        class="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-xl bg-zinc-900/95 border border-white/16 shadow-2xl backdrop-blur-xl animate-fade-in"
      >
        <span class="text-xs font-medium text-zinc-200">
          已选 <span class="font-mono text-edge-orange font-bold">{{ selectedKeys.size }}</span> 项
        </span>
        <div class="h-3 w-[1px] bg-white/15"></div>
        <button class="btn-ghost text-xs" @click="emit('selectAll')">
          {{ isAllSelected ? '取消全选' : '全选当前' }}
        </button>
        <button class="btn-secondary h-7 px-2.5 text-xs" @click="emit('batchCopy')">
          <div class="i-mdi-content-copy text-xs"></div>
          <span>复制直链</span>
        </button>
        <button class="btn-danger h-7 px-2.5 text-xs" @click="emit('batchDelete')">
          <div class="i-mdi-delete-outline text-xs"></div>
          <span>批量删除</span>
        </button>
      </div>
    </Transition>
  </div>
</template>
