<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { formatBytes } from '@/utils/utils'
import { toast } from '@/utils/toast'
import type { FileCategory, StatsResult } from '@/types'

const props = defineProps<{
  activeCategory: FileCategory
  searchQuery: string
  viewMode: 'list' | 'grid'
  stats: StatsResult | null
  totalFilesCount: number
}>()

const emit = defineEmits<{
  'update:activeCategory': [cat: FileCategory]
  'update:searchQuery': [q: string]
  'update:viewMode': [mode: 'list' | 'grid']
  'triggerUpload': []
  'openNewClip': []
  'refresh': []
}>()

const router = useRouter()

const filterTabs: { label: string; value: FileCategory; icon: string }[] = [
  { label: '全部', value: 'all', icon: 'i-mdi-view-grid-outline' },
  { label: '文件', value: 'other', icon: 'i-mdi-folder-outline' },
  { label: '剪贴板/代码', value: 'code', icon: 'i-mdi-code-braces' },
  { label: '图片', value: 'image', icon: 'i-mdi-image-outline' },
]

const statsSummary = computed(() => {
  if (props.stats) {
    return `${props.stats.totalCount} 项 · ${formatBytes(props.stats.totalSize)}`
  }
  return `${props.totalFilesCount} 项`
})

const onLogout = async () => {
  document.cookie = '__auth=; Path=/; Max-Age=0'
  document.cookie = '__session=; Path=/; Max-Age=0'
  toast('已退出登录', 'info')
  await router.push('/login')
}
</script>

<template>
  <header class="h-14 border-b border-white/8 bg-studio-surface/90 backdrop-blur-md px-4 flex items-center justify-between gap-3 shrink-0 select-none z-20">
    <!-- Left: Brand + Stats -->
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-lg bg-edge-orange/15 border border-edge-orange/30 flex items-center justify-center text-edge-orange font-bold text-sm">
          <div class="i-mdi-cloud-outline text-base"></div>
        </div>
        <div class="flex flex-col">
          <span class="font-bold text-xs tracking-tight text-white flex items-center gap-1.5">
            文件云工作台
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-subtle"></span>
          </span>
          <span class="font-mono text-[10px] text-zinc-500">{{ statsSummary }}</span>
        </div>
      </div>

      <!-- Segment Tabs -->
      <nav class="hidden md:flex items-center rounded-lg bg-black/30 border border-white/6 p-0.5 ml-3">
        <button
          v-for="tab in filterTabs"
          :key="tab.value"
          type="button"
          class="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
          :class="activeCategory === tab.value ? 'bg-white/10 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'"
          @click="emit('update:activeCategory', tab.value)"
        >
          <div :class="tab.icon" class="text-xs"></div>
          <span>{{ tab.label }}</span>
        </button>
      </nav>
    </div>

    <!-- Center: Search input -->
    <div class="flex-1 max-w-xs relative hidden sm:block">
      <div class="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-zinc-500">
        <div class="i-mdi-magnify text-xs"></div>
      </div>
      <input
        :value="searchQuery"
        type="text"
        class="input-clean pl-7 pr-7 text-xs font-sans h-8"
        placeholder="搜索名称 / 扩展名 (Ctrl+F)…"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="searchQuery"
        class="absolute inset-y-0 right-2 flex items-center text-zinc-400 hover:text-white"
        @click="emit('update:searchQuery', '')"
      >
        <div class="i-mdi-close text-xs"></div>
      </button>
    </div>

    <!-- Right: Actions & Tools -->
    <div class="flex items-center gap-2">
      <!-- Grid / List Switcher -->
      <div class="flex items-center rounded-lg bg-black/30 border border-white/6 p-0.5">
        <button
          type="button"
          class="p-1 rounded-md text-xs transition-colors"
          :class="viewMode === 'list' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'"
          title="列表视图"
          @click="emit('update:viewMode', 'list')"
        >
          <div class="i-mdi-format-list-bulleted text-sm"></div>
        </button>
        <button
          type="button"
          class="p-1 rounded-md text-xs transition-colors"
          :class="viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'"
          title="网格视图"
          @click="emit('update:viewMode', 'grid')"
        >
          <div class="i-mdi-view-grid-outline text-sm"></div>
        </button>
      </div>

      <!-- Refresh -->
      <button class="btn-ghost p-1.5" title="刷新" @click="emit('refresh')">
        <div class="i-mdi-refresh text-sm"></div>
      </button>

      <!-- New Clip Button -->
      <button class="btn-secondary h-8 px-2.5" title="新建代码/文本剪贴板" @click="emit('openNewClip')">
        <div class="i-mdi-plus text-xs"></div>
        <span>新建剪贴板</span>
      </button>

      <!-- Upload Button -->
      <button class="btn-primary h-8 px-3" title="上传文件" @click="emit('triggerUpload')">
        <div class="i-mdi-upload text-xs"></div>
        <span>上传文件</span>
      </button>

      <!-- Logout -->
      <button class="btn-ghost p-1.5 text-zinc-500 hover:text-rose-400" title="退出登录" @click="onLogout">
        <div class="i-mdi-logout text-sm"></div>
      </button>
    </div>
  </header>
</template>
