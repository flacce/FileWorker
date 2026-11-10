<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { usePrefsStore, useWorkspaceStore } from '@/store/workspace'
import SidebarRailBento from '@/modules/SidebarRailBento.vue'
import ExplorerBento from '@/modules/ExplorerBento.vue'
import InspectorBento from '@/modules/InspectorBento.vue'
import TransferDockBento from '@/modules/TransferDockBento.vue'

type MobileTab = 'nav' | 'explorer' | 'inspector'

const route = useRoute()
const store = useWorkspaceStore()
const prefs = usePrefsStore()

const explorerRef = ref<InstanceType<typeof ExplorerBento> | null>(null)
const mobilePane = ref<MobileTab>('explorer')
const globalDragDepth = ref(0)

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
    mobilePane.value = 'explorer'
    explorerRef.value?.focusSearch()
    return
  }

  if (ev.altKey && (ev.key === 'n' || ev.key === 'N')) {
    ev.preventDefault()
    store.openClipCreator()
    mobilePane.value = 'inspector'
    return
  }

  if (ev.key === 'Escape' && !isEditableElement(ev.target)) {
    if (store.selectedKeys.length > 0) {
      store.clearSelection()
    } else if (store.activeKey || store.creatingClip) {
      store.activeKey = null
      store.creatingClip = false
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
  void store.bootstrap()
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('paste', handleGlobalPaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('paste', handleGlobalPaste)
})
</script>

<template>
  <div
    class="relative w-full h-full p-2.5 flex flex-col gap-2.5 bg-bento-canvas overflow-hidden"
    @dragenter.prevent="onWindowDragEnter"
    @dragover.prevent
    @dragleave.prevent="onWindowDragLeave"
    @drop.prevent="onWindowDrop"
  >
    <!-- 桌面三栏便当盒网格 / 移动自适应单栏 -->
    <main
      class="flex-1 min-h-0 grid gap-2.5 transition-all duration-200"
      :class="
        prefs.expandedInspector
          ? 'grid-cols-1 lg:grid-cols-[236px_minmax(280px,0.78fr)_minmax(460px,1.22fr)]'
          : 'grid-cols-1 lg:grid-cols-[236px_minmax(0,1fr)_410px]'
      "
    >
      <!-- 左翼导航与容量投递便当列 -->
      <div class="h-full min-h-0 lg:block" :class="mobilePane === 'nav' ? 'block' : 'hidden'">
        <SidebarRailBento @pick-complete="mobilePane = 'explorer'" />
      </div>

      <!-- 中枢资源主列表便当盒 -->
      <div class="h-full min-h-0 lg:block" :class="mobilePane === 'explorer' ? 'block' : 'hidden'">
        <ExplorerBento ref="explorerRef" @open-inspector="mobilePane = 'inspector'" />
      </div>

      <!-- 右翼检视与剪贴板创作便当盒 -->
      <div class="h-full min-h-0 lg:block" :class="mobilePane === 'inspector' ? 'block' : 'hidden'">
        <InspectorBento @close-panel="mobilePane = 'explorer'" />
      </div>
    </main>

    <!-- 移动端底部便当切换栏（小于 lg 显示） -->
    <nav class="lg:hidden bento-box h-11 shrink-0 grid grid-cols-3 p-1 gap-1">
      <button
        type="button"
        class="rounded-ctrl text-xs flex items-center justify-center gap-1.5 border-none cursor-pointer transition-colors"
        :class="
          mobilePane === 'nav'
            ? 'bg-bento-active text-accent font-medium'
            : 'bg-transparent text-ink-secondary'
        "
        @click="mobilePane = 'nav'"
      >
        <span class="i-mdi-tune-vertical text-sm" />
        <span>分类与投递</span>
      </button>

      <button
        type="button"
        class="rounded-ctrl text-xs flex items-center justify-center gap-1.5 border-none cursor-pointer transition-colors"
        :class="
          mobilePane === 'explorer'
            ? 'bg-bento-active text-accent font-medium'
            : 'bg-transparent text-ink-secondary'
        "
        @click="mobilePane = 'explorer'"
      >
        <span class="i-mdi-view-list-outline text-sm" />
        <span>资源列表</span>
      </button>

      <button
        type="button"
        class="rounded-ctrl text-xs flex items-center justify-center gap-1.5 border-none cursor-pointer transition-colors"
        :class="
          mobilePane === 'inspector'
            ? 'bg-bento-active text-accent font-medium'
            : 'bg-transparent text-ink-secondary'
        "
        @click="mobilePane = 'inspector'"
      >
        <span class="i-mdi-dock-right text-sm" />
        <span>{{ store.creatingClip ? '新建片段' : '检视编辑' }}</span>
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
      <p class="text-sm font-semibold text-ink-primary m-0">松开鼠标立即上传文件</p>
      <p class="text-xs text-ink-secondary mt-1 m-0">
        当前默认访问权限：{{ prefs.defaultVisibility === 'public' ? '公开直链' : '私密受控' }}
      </p>
    </div>
  </div>
</template>
