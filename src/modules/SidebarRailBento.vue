<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ResourceCategory } from '@/types'
import { endSession } from '@/api'
import { usePrefsStore, useWorkspaceStore } from '@/store/workspace'
import { categoryLabel, formatFileSize } from '@/utils/format'
import { notify } from '@/composables/useNotice'

const emit = defineEmits<{
  pickComplete: []
}>()

const route = useRoute()
const router = useRouter()
const store = useWorkspaceStore()
const prefs = usePrefsStore()

const fileInputRef = ref<HTMLInputElement | null>(null)
const dropHover = ref(false)

const isClipRoute = computed(() => route.path === '/clip')

const navCategories: Array<{ key: ResourceCategory; icon: string }> = [
  { key: 'all', icon: 'i-mdi-view-grid-outline' },
  { key: 'clip', icon: 'i-mdi-text-box-edit-outline' },
  { key: 'image', icon: 'i-mdi-image-outline' },
  { key: 'media', icon: 'i-mdi-movie-open-outline' },
  { key: 'document', icon: 'i-mdi-book-open-page-variant-outline' },
  { key: 'code', icon: 'i-mdi-code-braces' },
  { key: 'archive', icon: 'i-mdi-archive-outline' },
  { key: 'other', icon: 'i-mdi-cube-outline' }
]

const totalCountDisplay = computed(() => {
  if (store.metrics) {
    return `${store.metrics.totalCount}${store.metrics.isTruncated ? '+' : ''}`
  }
  return String(store.objects.length)
})

const totalSizeDisplay = computed(() => {
  if (store.metrics) {
    return formatFileSize(store.metrics.totalSize)
  }
  const sum = store.objects.reduce((acc, item) => acc + (item.Size || 0), 0)
  return formatFileSize(sum)
})

// 单色明度阶梯容量占比条
const monochromeSegments = computed(() => {
  const tc = store.metrics?.typeCount
  const total = store.metrics?.totalCount || 0
  if (!tc || total <= 0) {
    return [{ label: '空闲', pct: 100, cls: 'bg-white/[0.06]' }]
  }
  const imgPct = Math.round((tc.image / total) * 100)
  const mediaPct = Math.round(((tc.video + tc.audio) / total) * 100)
  const docCodePct = Math.round(((tc.code + tc.document) / total) * 100)
  const restPct = Math.max(0, 100 - imgPct - mediaPct - docCodePct)

  return [
    { label: '图像', pct: imgPct, cls: 'bg-accent' },
    { label: '流媒', pct: mediaPct, cls: 'bg-accent/60' },
    { label: '文档与代码', pct: docCodePct, cls: 'bg-accent/30' },
    { label: '其他', pct: restPct, cls: 'bg-white/[0.14]' }
  ].filter((seg) => seg.pct > 0)
})

function switchMode(mode: 'file' | 'clip') {
  if (mode === 'clip') {
    store.activeCategory = 'clip'
    if (!store.activeObject) {
      store.openClipCreator()
    }
    void router.push('/clip')
  } else {
    if (store.activeCategory === 'clip') {
      store.activeCategory = 'all'
    }
    store.creatingClip = false
    void router.push('/file')
  }
  emit('pickComplete')
}

function selectCategory(cat: ResourceCategory) {
  store.activeCategory = cat
  store.clearSelection()
  if (cat !== 'clip' && route.path === '/clip') {
    void router.push('/file')
  }
  emit('pickComplete')
}

function triggerFileDialog() {
  fileInputRef.value?.click()
}

function onFilePicked(ev: Event) {
  const input = ev.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    store.enqueueUploads(input.files)
    input.value = ''
    emit('pickComplete')
  }
}

function onZoneDrop(ev: DragEvent) {
  dropHover.value = false
  if (ev.dataTransfer?.files?.length) {
    store.enqueueUploads(ev.dataTransfer.files)
    emit('pickComplete')
  }
}

function handleSignOut() {
  endSession()
  notify('已安全退出当前会话', 'normal')
  void router.replace('/login')
}
</script>

<template>
  <aside class="flex flex-col gap-2.5 h-full min-h-0">
    <!-- 便当盒一：品牌与双模式路由切换 -->
    <div class="bento-box p-3 shrink-0 gap-2.5">
      <div class="flex items-center justify-between px-0.5">
        <div class="flex items-center gap-2">
          <div
            class="w-5 h-5 grid grid-cols-2 gap-0.5 p-0.5 rounded-tag bg-bento-raised border border-white/[0.08]"
          >
            <span class="rounded-[1px] bg-accent" />
            <span class="rounded-[1px] bg-white/25" />
            <span class="rounded-[1px] bg-white/20" />
            <span class="rounded-[1px] bg-white/10" />
          </div>
          <span class="text-xs font-semibold tracking-tight text-ink-primary">云端文件匣</span>
        </div>

        <button
          type="button"
          class="btn-icon w-6 h-6"
          title="锁定并退出会话"
          @click="handleSignOut"
        >
          <span class="i-mdi-logout-variant text-xs" />
        </button>
      </div>

      <div
        class="grid grid-cols-2 gap-1 p-0.5 bg-bento-raised rounded-ctrl border border-white/[0.05]"
      >
        <button
          type="button"
          class="h-7 rounded-[4px] text-xs font-medium transition-colors cursor-pointer border-none"
          :class="
            !isClipRoute
              ? 'bg-bento-active text-ink-primary shadow-sm'
              : 'bg-transparent text-ink-secondary hover:text-ink-primary'
          "
          @click="switchMode('file')"
        >
          文件仓库
        </button>
        <button
          type="button"
          class="h-7 rounded-[4px] text-xs font-medium transition-colors cursor-pointer border-none"
          :class="
            isClipRoute
              ? 'bg-accent text-[#061210]'
              : 'bg-transparent text-ink-secondary hover:text-ink-primary'
          "
          @click="switchMode('clip')"
        >
          云剪贴板
        </button>
      </div>
    </div>

    <!-- 便当盒二：资源分类筛选 -->
    <div class="bento-box p-2.5 flex-1 min-h-0">
      <div class="flex items-center justify-between px-1.5 pb-1.5 text-[11px] text-ink-muted">
        <span>视图分类</span>
        <span>数量</span>
      </div>

      <nav class="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        <button
          v-for="entry in navCategories"
          :key="entry.key"
          type="button"
          class="w-full flex items-center justify-between px-2 h-8 rounded-ctrl text-xs transition-colors cursor-pointer border-none text-left relative"
          :class="
            store.activeCategory === entry.key
              ? 'bg-white/[0.055] text-ink-primary font-medium'
              : 'bg-transparent text-ink-secondary hover:bg-white/[0.03] hover:text-ink-primary'
          "
          @click="selectCategory(entry.key)"
        >
          <span
            v-if="store.activeCategory === entry.key"
            class="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-accent"
          />
          <span class="flex items-center gap-2 truncate">
            <span
              :class="[
                entry.icon,
                store.activeCategory === entry.key ? 'text-accent' : 'text-ink-muted'
              ]"
              class="text-sm shrink-0"
            />
            <span class="truncate">{{ categoryLabel(entry.key) }}</span>
          </span>
          <span
            class="text-[11px] font-mono px-1.5 py-0.2 rounded-tag"
            :class="
              store.activeCategory === entry.key ? 'bg-accent-dim text-accent' : 'text-ink-muted'
            "
          >
            {{ store.categoryCounts[entry.key] }}
          </span>
        </button>
      </nav>
    </div>

    <!-- 便当盒三：存储计量与快捷投递舱 -->
    <div class="bento-box p-3 shrink-0 gap-2.5">
      <div class="space-y-1.5">
        <div class="flex items-baseline justify-between">
          <span class="text-[11px] text-ink-secondary">存储概览</span>
          <span class="text-xs font-mono text-ink-primary">{{ totalSizeDisplay }}</span>
        </div>

        <div class="h-1.5 w-full rounded-tag bg-bento-raised overflow-hidden flex gap-[1px]">
          <div
            v-for="seg in monochromeSegments"
            :key="seg.label"
            :style="{ width: `${seg.pct}%` }"
            :class="seg.cls"
            :title="`${seg.label}：${seg.pct}%`"
            class="h-full transition-all duration-300"
          />
        </div>

        <div class="flex items-center justify-between text-[11px] text-ink-muted">
          <span>对象总数</span>
          <span class="font-mono text-ink-secondary">{{ totalCountDisplay }} 项</span>
        </div>
      </div>

      <div class="h-[1px] bg-white/[0.05]" />

      <!-- 默认可见性切换 -->
      <div class="flex items-center justify-between text-xs">
        <span class="text-ink-secondary text-[11px]">默认上传权限</span>
        <button
          type="button"
          class="tag-chip cursor-pointer transition-colors bg-transparent"
          :class="
            prefs.defaultVisibility === 'public'
              ? 'border-accent-line text-accent bg-accent-dim'
              : 'border-white/[0.1] text-ink-secondary bg-bento-raised'
          "
          @click="prefs.toggleVisibilityDefault()"
        >
          <span
            :class="prefs.defaultVisibility === 'public' ? 'i-mdi-earth' : 'i-mdi-lock-outline'"
            class="text-xs"
          />
          <span>{{ prefs.defaultVisibility === 'public' ? '公开直链' : '私密受控' }}</span>
        </button>
      </div>

      <!-- 点阵投递区 -->
      <div
        class="dot-matrix-bg rounded-ctrl border border-dashed p-3 text-center transition-colors cursor-pointer"
        :class="
          dropHover
            ? 'border-accent bg-accent-dim'
            : 'border-white/[0.1] hover:border-white/[0.2] bg-bento-raised/60'
        "
        @click="triggerFileDialog"
        @dragover.prevent="dropHover = true"
        @dragleave.prevent="dropHover = false"
        @drop.prevent="onZoneDrop"
      >
        <div class="flex items-center justify-center gap-1.5 text-xs text-ink-primary font-medium">
          <span class="i-mdi-tray-arrow-up text-accent text-sm" />
          <span>投递上传文件</span>
        </div>
        <p class="text-[11px] text-ink-muted mt-0.5 m-0">点击选取或拖入此处</p>
      </div>

      <input ref="fileInputRef" type="file" multiple class="hidden" @change="onFilePicked" />
    </div>
  </aside>
</template>
