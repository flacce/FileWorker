<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SortField, StorageObject } from '@/types'
import { issueSignedUrl } from '@/api'
import { usePrefsStore, useWorkspaceStore } from '@/store/workspace'
import {
  buildObjectPath,
  buildPublicUrl,
  categoryLabel,
  decodeKey,
  extractExt,
  formatFileSize,
  formatRelativeTime,
  iconForObject,
  leafName,
  resolveRenderKind,
  resolveVisibility,
  writeClipboard
} from '@/utils/format'
import { notify } from '@/composables/useNotice'

const emit = defineEmits<{
  openInspector: []
}>()

const store = useWorkspaceStore()
const prefs = usePrefsStore()

const searchInputEl = ref<HTMLInputElement | null>(null)
const filePickerEl = ref<HTMLInputElement | null>(null)
const pendingDeleteKey = ref<string | null>(null)
const pendingBatchConfirm = ref(false)
const batchBusy = ref(false)

let deleteResetTimer: number | undefined

const breadcrumbs = computed(() => {
  if (!store.currentPrefix) return []
  const parts = store.currentPrefix.replace(/\/$/, '').split('/')
  const crumbs: Array<{ name: string; prefix: string }> = []
  let acc = ''
  for (const seg of parts) {
    acc += `${seg}/`
    crumbs.push({ name: seg, prefix: acc })
  }
  return crumbs
})

const allVisibleSelected = computed(() => {
  if (!store.visibleObjects.length) return false
  return store.visibleObjects.every((item) => store.selectedKeys.includes(item.Key))
})

function focusSearch() {
  searchInputEl.value?.focus()
  searchInputEl.value?.select()
}

defineExpose({ focusSearch })

function cycleSort(field: SortField) {
  if (prefs.sortField === field) {
    prefs.sortDirection = prefs.sortDirection === 'desc' ? 'asc' : 'desc'
  } else {
    prefs.sortField = field
    prefs.sortDirection = field === 'name' ? 'asc' : 'desc'
  }
}

function handleRowClick(item: StorageObject) {
  store.inspectObject(item.Key)
  emit('openInspector')
}

function handleNewClip() {
  store.openClipCreator()
  emit('openInspector')
}

function onPickUpload(ev: Event) {
  const target = ev.target as HTMLInputElement
  if (target.files?.length) {
    store.enqueueUploads(target.files)
    target.value = ''
  }
}

async function copySmartLink(item: StorageObject) {
  const vis = resolveVisibility(item)
  if (vis === 'public') {
    const ok = await writeClipboard(buildPublicUrl(item.Key))
    if (ok) notify('已复制公开直链地址', 'ok')
    return
  }
  try {
    const signed = await issueSignedUrl(item.Key, 86400)
    const ok = await writeClipboard(signed.signedUrl)
    if (ok) {
      notify(
        signed.openMode ? '已复制对象访问直链' : '私密对象：已签发并复制 24 小时临时直链',
        'ok'
      )
    }
  } catch {
    // 错误已由请求层统一提示
  }
}

function downloadDirect(item: StorageObject) {
  const link = document.createElement('a')
  link.href = buildObjectPath(item.Key)
  link.download = leafName(item.Key) || decodeKey(item.Key)
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

async function requestDeleteItem(key: string) {
  if (pendingDeleteKey.value !== key) {
    pendingDeleteKey.value = key
    window.clearTimeout(deleteResetTimer)
    deleteResetTimer = window.setTimeout(() => {
      pendingDeleteKey.value = null
    }, 3000)
    return
  }
  pendingDeleteKey.value = null
  await store.deleteObject(key)
}

async function handleBatchDelete() {
  if (!pendingBatchConfirm.value) {
    pendingBatchConfirm.value = true
    window.setTimeout(() => {
      pendingBatchConfirm.value = false
    }, 3200)
    return
  }
  pendingBatchConfirm.value = false
  batchBusy.value = true
  try {
    await store.deleteBatchSelected()
  } finally {
    batchBusy.value = false
  }
}

function displayTitle(item: StorageObject): string {
  if (store.searchQuery.trim() || store.activeCategory !== 'all') {
    return decodeKey(item.Key)
  }
  return leafName(item.Key, store.currentPrefix)
}

function kindBadgeText(item: StorageObject): string {
  const ext = extractExt(item.Key)
  if (!ext) return '剪贴板'
  const kind = resolveRenderKind(item)
  if (kind === 'image') return '图像'
  if (kind === 'video') return '视频'
  if (kind === 'audio') return '音频'
  if (kind === 'pdf') return '文档'
  if (kind === 'markdown') return '排版'
  if (kind === 'text') return '文本'
  return '二进制'
}

function resetRootView() {
  store.currentPrefix = ''
  store.activeCategory = 'all'
}
</script>

<template>
  <section class="bento-box h-full min-h-0">
    <!-- 顶部工具列 -->
    <header
      class="px-3 py-2.5 border-b border-white/[0.06] flex flex-wrap items-center gap-2 shrink-0"
    >
      <!-- 路径导航与当前视图指示 -->
      <div class="flex items-center gap-1 min-w-0 mr-auto overflow-x-auto">
        <button
          type="button"
          class="btn-quiet h-7 px-2 shrink-0"
          :class="
            !store.currentPrefix && store.activeCategory === 'all'
              ? 'text-ink-primary font-medium'
              : ''
          "
          @click="resetRootView"
        >
          <span class="i-mdi-folder-pound-outline text-accent text-sm" />
          <span>根目录</span>
        </button>

        <template v-if="store.activeCategory === 'all' && breadcrumbs.length > 0">
          <template v-for="crumb in breadcrumbs" :key="crumb.prefix">
            <span class="text-ink-faint text-xs">/</span>
            <button
              type="button"
              class="btn-quiet h-7 px-1.5 max-w-[130px] truncate"
              @click="store.enterFolder(crumb.prefix)"
            >
              {{ crumb.name }}
            </button>
          </template>
        </template>

        <template v-else-if="store.activeCategory !== 'all'">
          <span class="text-ink-faint text-xs">/</span>
          <span class="tag-accent">{{ categoryLabel(store.activeCategory) }}</span>
        </template>
      </div>

      <!-- 即时检索框 -->
      <div class="relative w-44 sm:w-56">
        <span
          class="i-mdi-magnify absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm pointer-events-none"
        />
        <input
          ref="searchInputEl"
          v-model="store.searchQuery"
          type="text"
          placeholder="检索名称或路径（/）"
          class="ctrl-input pl-8 pr-7 h-7.5"
        />
        <button
          v-if="store.searchQuery"
          type="button"
          class="btn-icon w-5 h-5 absolute right-1.5 top-1/2 -translate-y-1/2"
          title="清空检索词"
          @click="store.searchQuery = ''"
        >
          <span class="i-mdi-close text-xs" />
        </button>
      </div>

      <!-- 排序与布局控制组 -->
      <div class="flex items-center gap-1">
        <div
          class="hidden sm:flex items-center bg-bento-raised border border-white/[0.06] rounded-ctrl p-0.5"
        >
          <button
            v-for="col in [
              { key: 'time' as SortField, label: '时间' },
              { key: 'size' as SortField, label: '体积' },
              { key: 'name' as SortField, label: '名称' }
            ]"
            :key="col.key"
            type="button"
            class="h-6 px-2 rounded-[4px] text-[11px] inline-flex items-center gap-0.5 cursor-pointer border-none transition-colors"
            :class="
              prefs.sortField === col.key
                ? 'bg-bento-active text-ink-primary font-medium'
                : 'bg-transparent text-ink-secondary hover:text-ink-primary'
            "
            @click="cycleSort(col.key)"
          >
            <span>{{ col.label }}</span>
            <span
              v-if="prefs.sortField === col.key"
              :class="prefs.sortDirection === 'asc' ? 'i-mdi-arrow-up' : 'i-mdi-arrow-down'"
              class="text-[10px] text-accent"
            />
          </button>
        </div>

        <div
          class="flex items-center bg-bento-raised border border-white/[0.06] rounded-ctrl p-0.5"
        >
          <button
            type="button"
            class="w-6.5 h-6 rounded-[4px] inline-flex items-center justify-center cursor-pointer border-none transition-colors"
            :class="
              prefs.viewLayout === 'list'
                ? 'bg-bento-active text-accent'
                : 'bg-transparent text-ink-muted hover:text-ink-primary'
            "
            title="紧凑列表视图"
            @click="prefs.viewLayout = 'list'"
          >
            <span class="i-mdi-format-list-bulleted-square text-sm" />
          </button>
          <button
            type="button"
            class="w-6.5 h-6 rounded-[4px] inline-flex items-center justify-center cursor-pointer border-none transition-colors"
            :class="
              prefs.viewLayout === 'grid'
                ? 'bg-bento-active text-accent'
                : 'bg-transparent text-ink-muted hover:text-ink-primary'
            "
            title="网格画廊视图"
            @click="prefs.viewLayout = 'grid'"
          >
            <span class="i-mdi-grid-large text-xs" />
          </button>
        </div>

        <button
          type="button"
          class="btn-icon w-7.5 h-7.5 border border-white/[0.06] bg-bento-raised"
          title="同步刷新列表"
          :disabled="store.loading"
          @click="store.bootstrap()"
        >
          <span
            class="i-mdi-refresh text-sm"
            :class="store.loading ? 'animate-spin text-accent' : ''"
          />
        </button>

        <button
          type="button"
          class="btn-surface h-7.5 px-2.5"
          title="新建文本或代码片段"
          @click="handleNewClip"
        >
          <span class="i-mdi-plus text-accent text-sm" />
          <span class="hidden sm:inline">新建片段</span>
        </button>
      </div>
    </header>

    <!-- 多选批量动作条 -->
    <div
      v-if="store.selectedKeys.length > 0"
      class="px-3 py-1.5 bg-accent-dim border-b border-accent-line flex items-center justify-between gap-2 shrink-0"
    >
      <div class="flex items-center gap-2 text-xs text-ink-primary">
        <span class="w-1.5 h-1.5 rounded-full bg-accent" />
        <span>已勾选 {{ store.selectedKeys.length }} 项对象</span>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="btn-quiet h-6.5 text-[11px]"
          @click="store.toggleSelectAllVisible()"
        >
          {{ allVisibleSelected ? '取消全选' : '全选本页' }}
        </button>
        <button type="button" class="btn-quiet h-6.5 text-[11px]" @click="store.clearSelection()">
          清空勾选
        </button>
        <button
          type="button"
          class="btn-danger-quiet h-6.5 text-[11px]"
          :disabled="batchBusy"
          @click="handleBatchDelete"
        >
          <span class="i-mdi-trash-can-outline text-xs" />
          <span>{{
            batchBusy ? '正在移除…' : pendingBatchConfirm ? '再次点击确认批量删除' : '批量删除'
          }}</span>
        </button>
      </div>
    </div>

    <!-- 列表表头（仅列表模式显示） -->
    <div
      v-if="
        prefs.viewLayout === 'list' &&
        (store.visibleObjects.length > 0 || store.virtualFolders.length > 0)
      "
      class="px-3 h-7 border-b border-white/[0.04] bg-bento-raised/40 grid grid-cols-[24px_1fr_68px_84px_92px_96px] items-center gap-2 text-[11px] text-ink-muted shrink-0"
    >
      <button
        type="button"
        class="w-4 h-4 rounded-[3px] border flex items-center justify-center cursor-pointer bg-transparent p-0"
        :class="
          allVisibleSelected
            ? 'border-accent bg-accent text-[#061210]'
            : 'border-white/[0.16] hover:border-white/[0.3]'
        "
        title="全选或取消全选"
        @click="store.toggleSelectAllVisible()"
      >
        <span v-if="allVisibleSelected" class="i-mdi-check text-[11px]" />
      </button>
      <span>对象键名</span>
      <span class="hidden sm:inline">访问权限</span>
      <span class="text-right hidden md:inline">体积</span>
      <span class="text-right hidden sm:inline">更新时间</span>
      <span class="text-right">快捷操作</span>
    </div>

    <!-- 主内容滚动区 -->
    <div class="flex-1 min-h-0 overflow-y-auto">
      <!-- 初次加载态 -->
      <div
        v-if="store.loading && store.objects.length === 0"
        class="h-full flex flex-col items-center justify-center gap-2 text-xs text-ink-muted"
      >
        <span class="i-mdi-loading animate-spin text-lg text-accent" />
        <span>正在同步云端对象索引…</span>
      </div>

      <!-- 空状态 -->
      <div
        v-else-if="store.virtualFolders.length === 0 && store.visibleObjects.length === 0"
        class="h-full flex flex-col items-center justify-center p-6 text-center"
      >
        <div
          class="w-11 h-11 rounded-bento bg-bento-raised border border-white/[0.07] flex items-center justify-center mb-3"
        >
          <span class="i-mdi-cube-off-outline text-xl text-ink-muted" />
        </div>
        <p class="text-xs font-medium text-ink-primary m-0">
          {{ store.searchQuery ? '未匹配到符合检索条件的对象' : '当前视图暂无存储资源' }}
        </p>
        <p class="text-[11px] text-ink-muted mt-1 mb-4 max-w-[240px]">
          可将本地文件直接拖入窗口任意位置上传，或立即创建一段在线云剪贴板。
        </p>
        <div class="flex items-center gap-2">
          <button type="button" class="btn-accent h-7.5" @click="filePickerEl?.click()">
            <span class="i-mdi-tray-arrow-up text-sm" />
            <span>选取文件上传</span>
          </button>
          <button type="button" class="btn-surface h-7.5" @click="handleNewClip">
            <span class="i-mdi-text-box-plus-outline text-sm" />
            <span>新建云剪贴板</span>
          </button>
        </div>
        <input ref="filePickerEl" type="file" multiple class="hidden" @change="onPickUpload" />
      </div>

      <!-- 紧凑列表模式 -->
      <div v-else-if="prefs.viewLayout === 'list'" class="divide-y divide-white/[0.03]">
        <!-- 返回上一级 -->
        <div
          v-if="store.currentPrefix && !store.searchQuery && store.activeCategory === 'all'"
          class="px-3 h-9 flex items-center gap-2.5 text-xs text-ink-secondary hover:bg-white/[0.025] cursor-pointer transition-colors"
          @click="store.navigateUp()"
        >
          <span class="i-mdi-arrow-up-left text-sm text-ink-muted ml-1" />
          <span>返回上级目录</span>
        </div>

        <!-- 虚拟子目录行 -->
        <div
          v-for="folder in store.virtualFolders"
          :key="folder"
          class="px-3 h-9.5 grid grid-cols-[24px_1fr_auto] items-center gap-2 hover:bg-white/[0.03] cursor-pointer transition-colors"
          @click="store.enterFolder(folder)"
        >
          <span class="i-mdi-folder-outline text-accent/80 text-base ml-0.5" />
          <span class="text-xs text-ink-primary font-medium truncate">
            {{ folder.slice(store.currentPrefix.length).replace(/\/$/, '') }}
          </span>
          <span class="text-[11px] text-ink-muted flex items-center gap-1">
            <span>目录</span>
            <span class="i-mdi-chevron-right text-sm" />
          </span>
        </div>

        <!-- 对象列表行 -->
        <div
          v-for="item in store.visibleObjects"
          :key="item.Key"
          class="group relative px-3 h-10 grid grid-cols-[24px_1fr_auto] sm:grid-cols-[24px_1fr_68px_92px_96px] md:grid-cols-[24px_1fr_68px_84px_92px_96px] items-center gap-2 cursor-pointer transition-colors"
          :class="
            store.activeKey === item.Key
              ? 'bg-white/[0.055]'
              : store.selectedKeys.includes(item.Key)
                ? 'bg-accent/[0.05]'
                : 'hover:bg-white/[0.028]'
          "
          @click="handleRowClick(item)"
        >
          <!-- 当前检视态单色左饰线 -->
          <span
            v-if="store.activeKey === item.Key"
            class="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-accent rounded-r"
          />

          <!-- 多选框 -->
          <button
            type="button"
            class="w-4 h-4 rounded-[3px] border flex items-center justify-center cursor-pointer bg-transparent p-0 transition-colors"
            :class="
              store.selectedKeys.includes(item.Key)
                ? 'border-accent bg-accent text-[#061210]'
                : 'border-white/[0.14] opacity-60 group-hover:opacity-100 hover:border-white/[0.35]'
            "
            @click.stop="store.toggleSelection(item.Key)"
          >
            <span v-if="store.selectedKeys.includes(item.Key)" class="i-mdi-check text-[11px]" />
          </button>

          <!-- 图标与文件名称 -->
          <div class="flex items-center gap-2 min-w-0">
            <span
              :class="[
                iconForObject(item),
                store.activeKey === item.Key ? 'text-accent' : 'text-ink-secondary'
              ]"
              class="text-base shrink-0"
            />
            <span
              class="text-xs truncate"
              :class="
                store.activeKey === item.Key
                  ? 'text-ink-primary font-medium'
                  : 'text-ink-primary/90'
              "
              :title="decodeKey(item.Key)"
            >
              {{ displayTitle(item) }}
            </span>
          </div>

          <!-- 权限微章 -->
          <div class="hidden sm:flex items-center">
            <span v-if="resolveVisibility(item) === 'public'" class="tag-accent"> 公开 </span>
            <span v-else class="tag-neutral">私密</span>
          </div>

          <!-- 体积 -->
          <span class="hidden md:block text-right text-[11px] font-mono text-ink-secondary">
            {{ formatFileSize(item.Size) }}
          </span>

          <!-- 更新时间 -->
          <span class="hidden sm:block text-right text-[11px] text-ink-muted truncate">
            {{ formatRelativeTime(item.LastModified) }}
          </span>

          <!-- 快捷操作 -->
          <div class="flex items-center justify-end gap-0.5" @click.stop>
            <button
              type="button"
              class="btn-icon w-6.5 h-6.5"
              :title="
                resolveVisibility(item) === 'public' ? '复制公开直链' : '签发并复制 24 小时临时直链'
              "
              @click="copySmartLink(item)"
            >
              <span class="i-mdi-link-variant text-sm" />
            </button>
            <button
              type="button"
              class="btn-icon w-6.5 h-6.5"
              title="下载原文件"
              @click="downloadDirect(item)"
            >
              <span class="i-mdi-download-outline text-sm" />
            </button>
            <button
              type="button"
              class="h-6.5 rounded-ctrl px-1.5 inline-flex items-center justify-center cursor-pointer border-none transition-colors"
              :class="
                pendingDeleteKey === item.Key
                  ? 'bg-danger text-[#160404] text-[11px] font-medium'
                  : 'w-6.5 bg-transparent text-ink-muted hover:text-danger hover:bg-danger-dim'
              "
              :title="pendingDeleteKey === item.Key ? '再次点击确认删除' : '删除此对象'"
              @click="requestDeleteItem(item.Key)"
            >
              <span v-if="pendingDeleteKey === item.Key">确认</span>
              <span v-else class="i-mdi-trash-can-outline text-sm" />
            </button>
          </div>
        </div>
      </div>

      <!-- 网格画廊模式 -->
      <div v-else class="p-3 space-y-3">
        <!-- 子目录网格 -->
        <div
          v-if="store.virtualFolders.length > 0"
          class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2"
        >
          <button
            v-for="folder in store.virtualFolders"
            :key="folder"
            type="button"
            class="bento-subbox px-3 h-10 flex items-center gap-2 hover:border-white/[0.15] hover:bg-bento-hover cursor-pointer text-left transition-colors"
            @click="store.enterFolder(folder)"
          >
            <span class="i-mdi-folder-outline text-accent text-base shrink-0" />
            <span class="text-xs text-ink-primary font-medium truncate">
              {{ folder.slice(store.currentPrefix.length).replace(/\/$/, '') }}
            </span>
          </button>
        </div>

        <!-- 对象卡片网格 -->
        <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
          <div
            v-for="item in store.visibleObjects"
            :key="item.Key"
            class="group rounded-ctrl border overflow-hidden flex flex-col cursor-pointer transition-all bg-bento-raised/70"
            :class="
              store.activeKey === item.Key
                ? 'border-accent bg-bento-hover'
                : store.selectedKeys.includes(item.Key)
                  ? 'border-accent-line'
                  : 'border-white/[0.06] hover:border-white/[0.14]'
            "
            @click="handleRowClick(item)"
          >
            <!-- 缩略图舞台 -->
            <div
              class="relative h-28 checker-surface flex items-center justify-center overflow-hidden border-b border-white/[0.05]"
            >
              <img
                v-if="resolveRenderKind(item) === 'image'"
                :src="buildObjectPath(item.Key)"
                :alt="displayTitle(item)"
                loading="lazy"
                class="w-full h-full object-cover"
              />
              <div v-else class="flex flex-col items-center gap-1.5">
                <span :class="iconForObject(item)" class="text-2xl text-ink-secondary" />
                <span class="tag-neutral">{{ kindBadgeText(item) }}</span>
              </div>

              <!-- 左上勾选框 -->
              <button
                type="button"
                class="absolute top-2 left-2 w-4.5 h-4.5 rounded-[3px] border flex items-center justify-center cursor-pointer p-0 transition-opacity"
                :class="
                  store.selectedKeys.includes(item.Key)
                    ? 'border-accent bg-accent text-[#061210] opacity-100'
                    : 'border-white/25 bg-bento-canvas/80 text-transparent opacity-0 group-hover:opacity-100'
                "
                @click.stop="store.toggleSelection(item.Key)"
              >
                <span class="i-mdi-check text-xs" />
              </button>

              <!-- 右上复制快捷钮 -->
              <button
                type="button"
                class="absolute top-1.5 right-1.5 w-6 h-6 rounded-tag bg-bento-canvas/85 border border-white/[0.1] text-ink-secondary hover:text-accent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="复制访问链接"
                @click.stop="copySmartLink(item)"
              >
                <span class="i-mdi-link-variant text-xs" />
              </button>
            </div>

            <!-- 底部信息 -->
            <div class="p-2.5 space-y-1">
              <div
                class="text-xs text-ink-primary truncate font-medium"
                :title="decodeKey(item.Key)"
              >
                {{ displayTitle(item) }}
              </div>
              <div class="flex items-center justify-between text-[11px] text-ink-muted">
                <span class="font-mono">{{ formatFileSize(item.Size) }}</span>
                <span
                  :class="resolveVisibility(item) === 'public' ? 'text-accent' : 'text-ink-muted'"
                >
                  {{ resolveVisibility(item) === 'public' ? '公开' : '私密' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 分页续载 -->
      <div v-if="store.truncated" class="p-3 flex justify-center border-t border-white/[0.04]">
        <button
          type="button"
          class="btn-surface h-7.5 px-4"
          :disabled="store.loadingMore"
          @click="store.loadMoreObjects()"
        >
          <span v-if="store.loadingMore" class="i-mdi-loading animate-spin text-xs" />
          <span>{{ store.loadingMore ? '正在拉取后续对象…' : '加载后续存储对象' }}</span>
        </button>
      </div>
    </div>
  </section>
</template>
