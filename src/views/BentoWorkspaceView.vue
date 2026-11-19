<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'
import { useRoute } from 'vue-router'
import { usePrefsStore, useWorkspaceStore } from '@/store/workspace'
import SidebarRailBento from '@/modules/SidebarRailBento.vue'
import ExplorerBento from '@/modules/ExplorerBento.vue'
import TransferDockBento from '@/modules/TransferDockBento.vue'

const InspectorLoading = defineComponent({
  setup: () => () =>
    h(
      'div',
      {
        class: 'bento-box h-full min-h-0 flex items-center justify-center text-xs text-ink-muted',
        role: 'status'
      },
      '正在加载检视面板…'
    )
})

const InspectorLoadError = defineComponent({
  setup: () => () =>
    h(
      'div',
      {
        class: 'bento-box h-full min-h-0 flex items-center justify-center text-xs text-danger',
        role: 'alert'
      },
      '检视面板加载失败，请刷新页面重试。'
    )
})

const InspectorBento = defineAsyncComponent({
  loader: () => import('@/modules/InspectorBento.vue'),
  loadingComponent: InspectorLoading,
  errorComponent: InspectorLoadError,
  delay: 120
})

type MobileTab = 'nav' | 'explorer' | 'inspector'

const route = useRoute()
const store = useWorkspaceStore()
const prefs = usePrefsStore()

const explorerRef = ref<InstanceType<typeof ExplorerBento> | null>(null)
const sidebarRef = ref<InstanceType<typeof SidebarRailBento> | null>(null)
const mobilePane = ref<MobileTab>('explorer')
const isDesktopViewport = ref(
  typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches
)
const inspecting = computed(() => Boolean(store.activeObject || store.creatingClip))
const inspectorLoaded = ref(false)
const globalDragDepth = ref(0)
let viewportMediaQuery: MediaQueryList | null = null

watch(
  mobilePane,
  (pane) => {
    if (pane === 'inspector') inspectorLoaded.value = true
  },
  { immediate: true }
)

function onViewportChange(ev: MediaQueryListEvent) {
  isDesktopViewport.value = ev.matches
}

function syncRoutePosture(path: string) {
  if (path === '/clip') {
    store.activeCategory = 'clip'
    if (!store.activeKey) {
      store.openClipCreator()
      mobilePane.value = 'inspector'
    }
  } else {
    if (store.creatingClip && !store.activeKey) {
      store.creatingClip = false
    }
    if (store.activeCategory === 'clip' && path === '/file') {
      store.activeCategory = 'all'
    }
  }
}

watch(
  () => route.path,
  (nextPath) => {
    syncRoutePosture(nextPath)
  },
  { immediate: true }
)

function triggerWorkspaceUpload() {
  sidebarRef.value?.triggerFileDialog()
}

async function focusWorkspaceSearch() {
  mobilePane.value = 'explorer'
  await nextTick()
  explorerRef.value?.focusSearch()
}

function startClip() {
  store.openClipCreator()
  mobilePane.value = 'inspector'
}

function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable || el.closest('.cm-editor')) return true
  return false
}

function handleGlobalKeydown(ev: KeyboardEvent) {
  if (ev.key === '/' && !isEditableElement(ev.target) && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    ev.preventDefault()
    void focusWorkspaceSearch()
    return
  }

  if (ev.altKey && (ev.key === 'n' || ev.key === 'N')) {
    ev.preventDefault()
    startClip()
    return
  }

  if (ev.key === 'Escape' && !isEditableElement(ev.target)) {
    if (store.selectedKeys.length > 0) {
      store.clearSelection()
    } else if (store.activeKey || store.creatingClip) {
      store.activeKey = null
      store.creatingClip = false
      mobilePane.value = 'explorer'
    }
  }
}

function handleGlobalPaste(ev: ClipboardEvent) {
  if (isEditableElement(ev.target)) return
  const items = ev.clipboardData?.items
  if (!items) return

  const pastedFiles: File[] = []
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ].join('')

  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const rawFile = item.getAsFile()
      if (!rawFile) continue
      if (!rawFile.name || rawFile.name === 'image.png') {
        const ext = rawFile.type.split('/')[1] || 'png'
        pastedFiles.push(new File([rawFile], `剪贴板图像-${stamp}.${ext}`, { type: rawFile.type }))
      } else {
        pastedFiles.push(rawFile)
      }
    }
  }

  if (pastedFiles.length > 0) {
    ev.preventDefault()
    store.enqueueUploads(pastedFiles)
  }
}

function onWindowDragEnter(ev: DragEvent) {
  if (!ev.dataTransfer?.types.includes('Files')) return
  globalDragDepth.value++
}

function onWindowDragLeave(ev: DragEvent) {
  if (!ev.dataTransfer?.types.includes('Files')) return
  globalDragDepth.value = Math.max(0, globalDragDepth.value - 1)
}

function onWindowDrop(ev: DragEvent) {
  globalDragDepth.value = 0
  if (ev.dataTransfer?.files?.length) {
    store.enqueueUploads(ev.dataTransfer.files)
  }
}

onMounted(() => {
  viewportMediaQuery = window.matchMedia('(min-width: 1024px)')
  viewportMediaQuery.addEventListener('change', onViewportChange)
  void store.bootstrap()
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('paste', handleGlobalPaste)
})

onBeforeUnmount(() => {
  viewportMediaQuery?.removeEventListener('change', onViewportChange)
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('paste', handleGlobalPaste)
})
</script>

<template>
  <div
    class="workspace-shell relative w-full h-full flex flex-col overflow-hidden"
    @dragenter.prevent="onWindowDragEnter"
    @dragover.prevent
    @dragleave.prevent="onWindowDragLeave"
    @drop.prevent="onWindowDrop"
  >
    <header
      class="workspace-header relative shrink-0 flex items-center justify-between gap-2"
      :class="{ 'with-motion': prefs.ambientMotion }"
    >
      <div class="flex items-center gap-2 min-w-0">
        <svg class="brand-mark shrink-0" viewBox="0 0 48 48" aria-hidden="true">
          <path
            d="M9 19 12 7l10 8h4l10-8 3 12v15a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4z"
            fill="currentColor"
            opacity=".18"
          />
          <path
            d="M9 19 12 7l10 8h4l10-8 3 12v15a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4z"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <path
            d="M17 25h5l2 2h7v7H17z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
          <circle cx="18" cy="20" r="1" fill="currentColor" />
          <circle cx="30" cy="20" r="1" fill="currentColor" />
        </svg>
        <h1 class="m-0 text-base font-semibold text-ink-primary whitespace-nowrap">喵喵文件匣</h1>
      </div>
      <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          class="desk-search btn-icon lg:hidden"
          aria-label="搜索文件"
          title="搜索文件（/）"
          @click="focusWorkspaceSearch"
        >
          <span class="i-mdi-magnify text-base" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="desk-action btn-surface"
          aria-label="新建剪贴"
          title="新建剪贴"
          @click="startClip"
        >
          <span class="i-mdi-text-box-plus-outline text-base" aria-hidden="true" /><span
            class="hidden sm:inline"
            >新建剪贴</span
          >
        </button>
        <button
          type="button"
          class="desk-action btn-accent"
          aria-label="上传文件"
          title="上传文件"
          @click="triggerWorkspaceUpload"
        >
          <span class="i-mdi-tray-arrow-up text-base" aria-hidden="true" /><span
            class="hidden min-[360px]:inline"
            >上传文件</span
          >
        </button>
      </div>
    </header>
    <!-- 桌面三栏工作区 / 移动自适应单栏 -->
    <main
      class="workspace-columns flex-1 min-h-0 grid"
      :class="{ inspecting, wide: prefs.expandedInspector }"
    >
      <!-- 左翼导航与容量投递便当列 -->
      <div
        role="region"
        aria-label="分类与投递"
        class="h-full min-h-0 lg:block"
        :class="mobilePane === 'nav' ? 'block' : 'hidden'"
      >
        <SidebarRailBento ref="sidebarRef" @pick-complete="mobilePane = 'explorer'" />
      </div>

      <!-- 中枢资源主列表便当盒 -->
      <div
        role="region"
        aria-label="资源列表"
        class="h-full min-h-0 lg:block"
        :class="mobilePane === 'explorer' ? 'block' : 'hidden'"
      >
        <ExplorerBento ref="explorerRef" @open-inspector="mobilePane = 'inspector'" />
      </div>

      <!-- 右翼检视与剪贴板创作便当盒 -->
      <div
        role="region"
        :aria-label="store.creatingClip ? '新建片段' : '检视编辑'"
        class="inspector-pane h-full min-h-0 min-w-0"
        :class="mobilePane === 'inspector' ? 'block' : 'hidden'"
      >
        <InspectorBento
          v-if="(isDesktopViewport && inspecting) || inspectorLoaded"
          @close-panel="mobilePane = 'explorer'"
        />
      </div>
    </main>

    <!-- 移动端底部便当切换栏（小于 lg 显示） -->
    <nav
      role="group"
      aria-label="移动端工作区面板"
      class="mobile-nav lg:hidden shrink-0 grid grid-cols-3 p-1 gap-1"
    >
      <button
        type="button"
        :aria-pressed="mobilePane === 'nav'"
        class="rounded-ctrl text-xs flex items-center justify-center gap-1.5 border-none cursor-pointer transition-colors"
        :class="
          mobilePane === 'nav'
            ? 'bg-bento-active text-accent font-medium'
            : 'bg-transparent text-ink-secondary'
        "
        @click="mobilePane = 'nav'"
      >
        <span class="i-mdi-tune-vertical text-sm" />
        <span>分类</span>
      </button>

      <button
        type="button"
        :aria-pressed="mobilePane === 'explorer'"
        class="rounded-ctrl text-xs flex items-center justify-center gap-1.5 border-none cursor-pointer transition-colors"
        :class="
          mobilePane === 'explorer'
            ? 'bg-bento-active text-accent font-medium'
            : 'bg-transparent text-ink-secondary'
        "
        @click="mobilePane = 'explorer'"
      >
        <span class="i-mdi-view-list-outline text-sm" />
        <span>文件</span>
      </button>

      <button
        type="button"
        :aria-pressed="mobilePane === 'inspector'"
        class="rounded-ctrl text-xs flex items-center justify-center gap-1.5 border-none cursor-pointer transition-colors"
        :class="
          mobilePane === 'inspector'
            ? 'bg-bento-active text-accent font-medium'
            : 'bg-transparent text-ink-secondary'
        "
        @click="mobilePane = 'inspector'"
      >
        <span class="i-mdi-dock-right text-sm" />
        <span>{{ store.creatingClip ? '新建剪贴' : '预览' }}</span>
      </button>
    </nav>

    <!-- 右下角传输队列便当盒 -->
    <TransferDockBento />

    <!-- 全屏拖拽感应覆盖层 -->
    <div
      v-if="globalDragDepth > 0"
      class="fixed inset-2.5 z-50 rounded-bento bg-bento-canvas/88 border-2 border-dashed border-accent flex flex-col items-center justify-center pointer-events-none"
    >
      <div
        class="w-12 h-12 rounded-bento bg-accent-dim border border-accent-line flex items-center justify-center mb-3"
      >
        <span class="i-mdi-tray-arrow-up text-2xl text-accent" />
      </div>
      <p class="text-sm font-semibold text-ink-primary m-0">松手就上传</p>
      <p class="text-xs text-ink-secondary mt-1 m-0">
        {{ prefs.defaultVisibility === 'public' ? '拿到链接的人可访问' : '仅登录后可访问' }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.workspace-shell {
  background: var(--bento-canvas);
}
.workspace-header {
  min-height: 64px;
  padding: 8px 20px;
  background: var(--bento-cell);
  border-bottom: 1px solid var(--bento-line);
}
.brand-mark {
  width: 36px;
  height: 36px;
  color: var(--accent);
}
.desk-action {
  height: 36px;
  padding: 0 14px;
  font-size: 13px;
}
.workspace-columns {
  padding: 10px;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}
.mobile-nav {
  min-height: 54px;
  padding-bottom: max(4px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--bento-line);
  background: var(--bento-cell);
}
@media (min-width: 1024px) {
  .workspace-columns {
    --rail: clamp(196px, 16vw, 240px);
    grid-template-columns: var(--rail) minmax(0, 1fr);
  }
  .inspector-pane {
    display: none;
  }
  .inspecting {
    grid-template-columns: var(--rail) minmax(0, 1fr) clamp(328px, 29vw, 480px);
  }
  .inspecting.wide {
    grid-template-columns: var(--rail) minmax(0, 0.85fr) minmax(360px, 1.15fr);
  }
  .inspecting .inspector-pane {
    display: block;
  }
}
@media (max-width: 639px) {
  .workspace-header {
    min-height: 58px;
    padding: 6px 10px;
  }
  .desk-search,
  .desk-action {
    height: 44px;
    min-width: 44px;
    padding-inline: 10px;
  }
  .workspace-columns {
    padding: 6px;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .with-motion .brand-mark {
    animation: breathe 6s ease-in-out infinite alternate;
  }
  @keyframes breathe {
    to {
      opacity: 0.68;
    }
  }
}
</style>
