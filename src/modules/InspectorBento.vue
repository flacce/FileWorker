<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { VisibilityMode } from '@/types'
import { issueSignedUrl, probeObjectMetadata, readObjectText, writeTextObject } from '@/api'
import { usePrefsStore, useWorkspaceStore } from '@/store/workspace'
import {
  buildObjectPath,
  buildPublicUrl,
  classifyResource,
  decodeKey,
  formatFileSize,
  formatRelativeTime,
  generateShortKey,
  iconForObject,
  isTextClipObject,
  resolveRenderKind,
  resolveVisibility,
  writeClipboard
} from '@/utils/format'
import { notify } from '@/composables/useNotice'
import TextCodeSurface from './TextCodeSurface.vue'

const emit = defineEmits<{
  closePanel: []
}>()

const store = useWorkspaceStore()
const prefs = usePrefsStore()

// ── 云剪贴板创作舱状态 ─────────────────────────────
const clipKeyInput = ref('')
const clipPlaceholderKey = ref(generateShortKey(4))
const clipBody = ref('')
const clipVisibility = ref<VisibilityMode>(prefs.defaultVisibility)
const clipSaving = ref(false)
const clipWrap = ref(true)

// ── 对象检视与编辑状态 ─────────────────────────────
const textLoading = ref(false)
const textOversized = ref(false)
const originText = ref('')
const draftText = ref('')
const savingEdit = ref(false)
const editorWrap = ref(true)
const mdViewMode = ref<'read' | 'edit'>('read')
const renderedHtml = ref('')
const imageFitContain = ref(true)

const renaming = ref(false)
const renameDraft = ref('')
const renameBusy = ref(false)

const sharePanelOpen = ref(false)
const signingBusy = ref(false)
const confirmDelete = ref(false)
const visibilityBusy = ref(false)

let textAbortCtrl: AbortController | null = null

const currentObj = computed(() => store.activeObject)
const currentKind = computed(() =>
  currentObj.value ? resolveRenderKind(currentObj.value) : 'binary'
)
const isTextModified = computed(
  () =>
    (currentKind.value === 'text' || currentKind.value === 'markdown') &&
    !textLoading.value &&
    !textOversized.value &&
    draftText.value !== originText.value
)

const previewClipUrl = computed(() => {
  const k = clipKeyInput.value.trim().replace(/^\/+/, '') || clipPlaceholderKey.value
  return buildPublicUrl(k)
})

const shareDurations = [
  { label: '1 小时', seconds: 3600 },
  { label: '24 小时', seconds: 86400 },
  { label: '7 天', seconds: 604800 },
  { label: '30 天', seconds: 2592000 }
]

function cancelPendingRead() {
  if (textAbortCtrl) {
    textAbortCtrl.abort()
    textAbortCtrl = null
  }
}

async function compileMarkdown(source: string) {
  try {
    const { marked } = await import('marked')
    const out = await marked.parse(source)
    renderedHtml.value = out
  } catch {
    renderedHtml.value = '<p>文档排版渲染失败，请切换至源码视图查看。</p>'
  }
}

async function fetchInspectorText(force = false) {
  const obj = currentObj.value
  if (!obj) return
  cancelPendingRead()

  if (!force && obj.Size > 2 * 1024 * 1024) {
    textOversized.value = true
    originText.value = ''
    draftText.value = ''
    return
  }

  textOversized.value = false
  textLoading.value = true
  const ctrl = new AbortController()
  textAbortCtrl = ctrl

  try {
    const raw = await readObjectText(obj.Key, ctrl.signal)
    if (ctrl.signal.aborted) return
    originText.value = raw
    draftText.value = raw
    if (currentKind.value === 'markdown') {
      await compileMarkdown(raw)
    }
  } catch (err: unknown) {
    if ((err as Error)?.name !== 'AbortError') {
      notify('拉取文本内容失败', 'warn')
    }
  } finally {
    if (textAbortCtrl === ctrl) {
      textLoading.value = false
    }
  }
}

watch(
  () => store.creatingClip,
  (creating) => {
    if (creating) {
      clipPlaceholderKey.value = generateShortKey(4)
      clipVisibility.value = prefs.defaultVisibility
    }
  }
)

watch(
  () => currentObj.value?.Key,
  (nextKey) => {
    cancelPendingRead()
    renaming.value = false
    sharePanelOpen.value = false
    confirmDelete.value = false
    imageFitContain.value = true
    mdViewMode.value = 'read'
    renderedHtml.value = ''
    originText.value = ''
    draftText.value = ''
    textOversized.value = false

    if (!nextKey || !currentObj.value) return
    const targetObj = currentObj.value
    const headCtrl = new AbortController()
    void probeObjectMetadata(nextKey, headCtrl.signal).then((meta) => {
      if (meta && currentObj.value?.Key === targetObj.Key) {
        targetObj.customMetadata = {
          ...(targetObj.customMetadata ?? {}),
          ...meta
        }
      }
    })
    const kind = resolveRenderKind(targetObj)
    if (kind === 'text' || kind === 'markdown') {
      void fetchInspectorText(false)
    }
  },
  { immediate: true }
)

watch(mdViewMode, (mode) => {
  if (mode === 'read' && currentKind.value === 'markdown') {
    void compileMarkdown(draftText.value)
  }
})

function rollShortKey() {
  const code = generateShortKey(4)
  clipPlaceholderKey.value = code
  clipKeyInput.value = code
}

async function publishClip() {
  if (clipSaving.value) return
  if (!clipBody.value.trim()) {
    notify('请先输入或粘贴剪贴板文本内容', 'warn')
    return
  }

  const finalKey =
    (store.currentPrefix ? store.currentPrefix : '') +
    (clipKeyInput.value.trim().replace(/^\/+/, '') || clipPlaceholderKey.value)

  clipSaving.value = true
  try {
    await writeTextObject(finalKey, clipBody.value, clipVisibility.value, 'text')
    let linkToCopy = buildPublicUrl(finalKey)
    if (clipVisibility.value === 'private') {
      const signed = await issueSignedUrl(finalKey, 86400)
      linkToCopy = signed.signedUrl
    }
    const copied = await writeClipboard(linkToCopy)
    notify(copied ? '云剪贴板已保存并复制访问直链' : '云剪贴板已保存至云端', 'ok')

    clipKeyInput.value = ''
    clipBody.value = ''
    await store.bootstrap()
    const saved = store.objects.find((i) => decodeKey(i.Key) === decodeKey(finalKey))
    if (saved) {
      if (store.activeCategory !== 'all' && classifyResource(saved) !== store.activeCategory) {
        store.activeCategory = 'all'
      }
      store.inspectObject(saved.Key)
    } else {
      store.creatingClip = false
    }
  } finally {
    clipSaving.value = false
  }
}

async function saveModifiedText() {
  const obj = currentObj.value
  if (!obj || savingEdit.value || !isTextModified.value) return

  savingEdit.value = true
  try {
    const vis = resolveVisibility(obj)
    const storeKind = isTextClipObject(obj) ? 'text' : 'file'
    await writeTextObject(obj.Key, draftText.value, vis, storeKind)
    originText.value = draftText.value
    if (currentKind.value === 'markdown' && mdViewMode.value === 'read') {
      await compileMarkdown(draftText.value)
    }
    notify('云端文本内容已同步保存', 'ok')
    await store.refreshList()
  } finally {
    savingEdit.value = false
  }
}

async function copyFullText() {
  const ok = await writeClipboard(draftText.value)
  if (ok) notify('已复制全文内容到剪贴板', 'ok')
}

function beginRename() {
  if (!currentObj.value) return
  renameDraft.value = decodeKey(currentObj.value.Key)
  renaming.value = true
}

async function commitRename() {
  const obj = currentObj.value
  if (!obj || renameBusy.value) return
  const target = renameDraft.value.trim()
  if (!target || target === decodeKey(obj.Key)) {
    renaming.value = false
    return
  }
  renameBusy.value = true
  try {
    await store.renameSingleObject(obj.Key, target)
    renaming.value = false
  } finally {
    renameBusy.value = false
  }
}

async function handleToggleObjVisibility() {
  const obj = currentObj.value
  if (!obj || visibilityBusy.value) return
  visibilityBusy.value = true
  try {
    await store.toggleObjectVisibility(obj)
  } finally {
    visibilityBusy.value = false
  }
}

async function copyDirectUrl() {
  if (!currentObj.value) return
  const ok = await writeClipboard(buildPublicUrl(currentObj.value.Key))
  if (ok) notify('已复制对象直链', 'ok')
}

async function generateAndCopyShare(seconds: number, label: string) {
  if (!currentObj.value || signingBusy.value) return
  signingBusy.value = true
  try {
    const res = await issueSignedUrl(currentObj.value.Key, seconds)
    const ok = await writeClipboard(res.signedUrl)
    if (ok) {
      notify(
        res.openMode ? '当前处于免密开放模式，已复制直链' : `已签发并复制 ${label} 有效签名链接`,
        'ok'
      )
    }
    sharePanelOpen.value = false
  } finally {
    signingBusy.value = false
  }
}

async function handleDeleteCurrent() {
  if (!currentObj.value) return
  if (!confirmDelete.value) {
    confirmDelete.value = true
    window.setTimeout(() => {
      confirmDelete.value = false
    }, 3200)
    return
  }
  const key = currentObj.value.Key
  confirmDelete.value = false
  await store.deleteObject(key)
  emit('closePanel')
}

function closeInspector() {
  store.creatingClip = false
  store.activeKey = null
  emit('closePanel')
}

onBeforeUnmount(() => {
  cancelPendingRead()
})
</script>

<template>
  <aside class="bento-box h-full min-h-0">
    <!-- 姿态一：云剪贴板创作舱 -->
    <template v-if="store.creatingClip">
      <header
        class="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="i-mdi-text-box-plus-outline text-accent text-base shrink-0" />
          <span class="text-xs font-semibold text-ink-primary truncate">新建云剪贴板</span>
        </div>

        <div class="flex items-center gap-1">
          <button
            type="button"
            class="btn-icon w-7 h-7 hidden lg:inline-flex"
            :title="prefs.expandedInspector ? '恢复标准栏宽' : '展开宽幅编辑'"
            @click="prefs.expandedInspector = !prefs.expandedInspector"
          >
            <span
              :class="
                prefs.expandedInspector
                  ? 'i-mdi-arrow-collapse-horizontal'
                  : 'i-mdi-arrow-expand-horizontal'
              "
              class="text-sm"
            />
          </button>
          <button
            type="button"
            class="btn-icon w-7 h-7"
            title="关闭创作面板"
            @click="closeInspector"
          >
            <span class="i-mdi-close text-sm" />
          </button>
        </div>
      </header>

      <!-- 剪贴板键名与权限栏 -->
      <div class="p-3 border-b border-white/[0.05] space-y-2 bg-bento-raised/40 shrink-0">
        <div class="flex items-center gap-1.5">
          <div class="relative flex-1">
            <input
              v-model="clipKeyInput"
              type="text"
              :placeholder="`自定义键名或留空使用 ${clipPlaceholderKey}`"
              class="ctrl-input h-8 pr-8 font-mono text-xs"
            />
            <button
              type="button"
              class="btn-icon w-6 h-6 absolute right-1 top-1/2 -translate-y-1/2"
              title="随机更换短码"
              @click="rollShortKey"
            >
              <span class="i-mdi-dice-multiple-outline text-sm text-accent" />
            </button>
          </div>

          <button
            type="button"
            class="btn-surface h-8 px-2.5 shrink-0"
            @click="clipVisibility = clipVisibility === 'public' ? 'private' : 'public'"
          >
            <span
              :class="
                clipVisibility === 'public'
                  ? 'i-mdi-earth text-accent'
                  : 'i-mdi-lock-outline text-ink-secondary'
              "
              class="text-xs"
            />
            <span>{{ clipVisibility === 'public' ? '公开' : '私密' }}</span>
          </button>
        </div>

        <div class="flex items-center justify-between text-[11px] text-ink-muted gap-2">
          <span class="truncate font-mono" :title="previewClipUrl"
            >直链预览：{{ previewClipUrl }}</span
          >
          <button
            type="button"
            class="text-[11px] text-ink-secondary hover:text-ink-primary bg-transparent border-none cursor-pointer shrink-0 p-0"
            @click="clipWrap = !clipWrap"
          >
            {{ clipWrap ? '自动折行：开' : '自动折行：关' }}
          </button>
        </div>
      </div>

      <!-- 编辑器画布 -->
      <div class="flex-1 min-h-0">
        <TextCodeSurface
          v-model="clipBody"
          :filename="clipKeyInput || 'snippet.txt'"
          :line-wrap="clipWrap"
          placeholder-text="在此键入文本、配置、脚本或笔记内容，支持按保存组合键直接发布…"
          @save="publishClip"
        />
      </div>

      <!-- 底部发布栏 -->
      <footer
        class="p-3 border-t border-white/[0.06] flex items-center justify-between gap-2 bg-bento-raised/30 shrink-0"
      >
        <span class="text-[11px] text-ink-muted font-mono"> {{ clipBody.length }} 字符 </span>
        <div class="flex items-center gap-2">
          <button type="button" class="btn-quiet h-8" @click="clipBody = ''">清空内容</button>
          <button
            type="button"
            class="btn-accent h-8 px-3.5"
            :disabled="clipSaving"
            @click="publishClip"
          >
            <span v-if="clipSaving" class="i-mdi-loading animate-spin text-xs" />
            <span v-else class="i-mdi-cloud-upload-outline text-sm" />
            <span>{{ clipSaving ? '正在上云…' : '保存并复制直链' }}</span>
          </button>
        </div>
      </footer>
    </template>

    <!-- 姿态二：对象深度检视与在线编辑舱 -->
    <template v-else-if="currentObj">
      <header
        class="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0"
      >
        <div v-if="!renaming" class="flex items-center gap-2 min-w-0 flex-1">
          <span :class="iconForObject(currentObj)" class="text-accent text-base shrink-0" />
          <span
            class="text-xs font-semibold text-ink-primary truncate"
            :title="decodeKey(currentObj.Key)"
          >
            {{ decodeKey(currentObj.Key) }}
          </span>
          <button
            type="button"
            class="btn-icon w-6 h-6 shrink-0"
            title="重命名此对象"
            @click="beginRename"
          >
            <span class="i-mdi-pencil-outline text-xs" />
          </button>
        </div>

        <form
          v-else
          class="flex items-center gap-1.5 flex-1 min-w-0"
          @submit.prevent="commitRename"
        >
          <input
            v-model="renameDraft"
            type="text"
            autofocus
            class="ctrl-input h-7 text-xs font-mono flex-1"
            @keydown.esc.stop="renaming = false"
          />
          <button type="submit" class="btn-accent h-7 px-2.5" :disabled="renameBusy">保存</button>
          <button type="button" class="btn-quiet h-7 px-2" @click="renaming = false">取消</button>
        </form>

        <div v-if="!renaming" class="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            class="btn-icon w-7 h-7 hidden lg:inline-flex"
            :title="prefs.expandedInspector ? '收窄检视面板' : '展开宽幅检视'"
            @click="prefs.expandedInspector = !prefs.expandedInspector"
          >
            <span
              :class="
                prefs.expandedInspector
                  ? 'i-mdi-arrow-collapse-horizontal'
                  : 'i-mdi-arrow-expand-horizontal'
              "
              class="text-sm"
            />
          </button>
          <button type="button" class="btn-icon w-7 h-7" title="关闭检视" @click="closeInspector">
            <span class="i-mdi-close text-sm" />
          </button>
        </div>
      </header>

      <!-- 文本与排版文档专属副工具条 -->
      <div
        v-if="currentKind === 'text' || currentKind === 'markdown'"
        class="px-3 h-8 border-b border-white/[0.05] bg-bento-raised/40 flex items-center justify-between gap-2 shrink-0"
      >
        <div class="flex items-center gap-1">
          <template v-if="currentKind === 'markdown'">
            <button
              type="button"
              class="h-6 px-2 rounded-tag text-[11px] border-none cursor-pointer transition-colors"
              :class="
                mdViewMode === 'read'
                  ? 'bg-accent text-[#061210] font-medium'
                  : 'bg-transparent text-ink-secondary hover:text-ink-primary'
              "
              @click="mdViewMode = 'read'"
            >
              排版阅读
            </button>
            <button
              type="button"
              class="h-6 px-2 rounded-tag text-[11px] border-none cursor-pointer transition-colors"
              :class="
                mdViewMode === 'edit'
                  ? 'bg-accent text-[#061210] font-medium'
                  : 'bg-transparent text-ink-secondary hover:text-ink-primary'
              "
              @click="mdViewMode = 'edit'"
            >
              源码编辑
            </button>
          </template>
          <span v-else class="text-[11px] text-ink-muted font-mono">
            {{ draftText.length }} 字符
          </span>
        </div>

        <div class="flex items-center gap-1">
          <button
            v-if="currentKind === 'text' || mdViewMode === 'edit'"
            type="button"
            class="btn-quiet h-6 px-1.5 text-[11px]"
            @click="editorWrap = !editorWrap"
          >
            {{ editorWrap ? '折行' : '不折行' }}
          </button>
          <button type="button" class="btn-quiet h-6 px-1.5 text-[11px]" @click="copyFullText">
            复制全文
          </button>
          <button
            v-if="isTextModified"
            type="button"
            class="btn-accent h-6 px-2 text-[11px]"
            :disabled="savingEdit"
            @click="saveModifiedText"
          >
            {{ savingEdit ? '保存中…' : '保存改动' }}
          </button>
        </div>
      </div>

      <!-- 图像专属副工具条 -->
      <div
        v-else-if="currentKind === 'image'"
        class="px-3 h-8 border-b border-white/[0.05] bg-bento-raised/40 flex items-center justify-between text-[11px] shrink-0"
      >
        <span class="text-ink-muted">图像预览画布</span>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="btn-quiet h-6 px-2 text-[11px]"
            @click="imageFitContain = !imageFitContain"
          >
            {{ imageFitContain ? '切换原始尺寸' : '切换适应窗口' }}
          </button>
          <a
            :href="buildObjectPath(currentObj.Key)"
            target="_blank"
            rel="noopener"
            class="btn-quiet h-6 px-2 text-[11px] no-underline"
          >
            新窗口原图
          </a>
        </div>
      </div>

      <!-- 主预览舞台 -->
      <div class="flex-1 min-h-0 overflow-auto relative">
        <!-- 图像 -->
        <div
          v-if="currentKind === 'image'"
          class="w-full h-full checker-surface flex items-center justify-center p-3 overflow-auto"
        >
          <img
            :src="buildObjectPath(currentObj.Key)"
            :alt="decodeKey(currentObj.Key)"
            :class="imageFitContain ? 'max-w-full max-h-full object-contain' : 'max-w-none'"
            class="rounded-tag select-none"
          />
        </div>

        <!-- 视频 -->
        <div
          v-else-if="currentKind === 'video'"
          class="w-full h-full bg-[#050608] flex items-center justify-center p-2"
        >
          <video
            :key="currentObj.Key"
            :src="buildObjectPath(currentObj.Key)"
            controls
            preload="metadata"
            class="max-w-full max-h-full rounded-tag outline-none"
          />
        </div>

        <!-- 音频 -->
        <div
          v-else-if="currentKind === 'audio'"
          class="w-full h-full flex flex-col items-center justify-center p-6 gap-5 dot-matrix-bg"
        >
          <div
            class="w-14 h-14 rounded-bento bg-bento-raised border border-white/[0.08] flex items-center justify-center"
          >
            <span class="i-mdi-waveform text-2xl text-accent" />
          </div>
          <audio
            :key="currentObj.Key"
            :src="buildObjectPath(currentObj.Key)"
            controls
            preload="metadata"
            class="w-full max-w-[320px]"
          />
        </div>

        <!-- 版式文档 PDF -->
        <iframe
          v-else-if="currentKind === 'pdf'"
          :key="currentObj.Key"
          :src="buildObjectPath(currentObj.Key)"
          title="版式文档预览"
          class="w-full h-full border-none bg-[#090b0e]"
        />

        <!-- 文本 / 排版文档 -->
        <template v-else-if="currentKind === 'text' || currentKind === 'markdown'">
          <div
            v-if="textLoading"
            class="w-full h-full flex items-center justify-center gap-2 text-xs text-ink-muted"
          >
            <span class="i-mdi-loading animate-spin text-accent text-base" />
            <span>正在读取云端文本流…</span>
          </div>

          <div
            v-else-if="textOversized"
            class="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-3"
          >
            <p class="text-xs text-ink-secondary m-0">
              此文本体积较大（{{ formatFileSize(currentObj.Size) }}），为保障流畅度未自动载入。
            </p>
            <button type="button" class="btn-surface h-8" @click="fetchInspectorText(true)">
              强制载入在线编辑
            </button>
          </div>

          <div
            v-else-if="currentKind === 'markdown' && mdViewMode === 'read'"
            class="p-4 select-text prose-dark"
            v-html="renderedHtml"
          />

          <TextCodeSurface
            v-else
            v-model="draftText"
            :filename="currentObj.Key"
            :line-wrap="editorWrap"
            @save="saveModifiedText"
          />
        </template>

        <!-- 二进制归档或其他文件 -->
        <div
          v-else
          class="w-full h-full flex flex-col items-center justify-center p-6 text-center dot-matrix-bg"
        >
          <div
            class="w-12 h-12 rounded-bento bg-bento-raised border border-white/[0.08] flex items-center justify-center mb-3"
          >
            <span :class="iconForObject(currentObj)" class="text-2xl text-ink-secondary" />
          </div>
          <p class="text-xs font-medium text-ink-primary m-0">二进制存储对象</p>
          <p class="text-[11px] text-ink-muted mt-1 mb-4">
            该格式暂不支持浏览器内嵌渲染，可直接下载原文件或分发直链。
          </p>
          <a
            :href="buildObjectPath(currentObj.Key)"
            :download="decodeKey(currentObj.Key)"
            class="btn-accent h-8 px-4 no-underline"
          >
            <span class="i-mdi-download-outline text-sm" />
            <span>直接下载文件</span>
          </a>
        </div>
      </div>

      <!-- 底部元数据与分发控制盒 -->
      <footer class="p-3 border-t border-white/[0.06] bg-bento-raised/30 space-y-2.5 shrink-0">
        <!-- 限时分享抽屉条 -->
        <div v-if="sharePanelOpen" class="bento-subbox p-2.5 space-y-2 border-accent-line">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-ink-primary font-medium">签发免口令限时访问直链</span>
            <button
              type="button"
              class="text-ink-muted hover:text-ink-primary bg-transparent border-none cursor-pointer p-0 text-[11px]"
              @click="sharePanelOpen = false"
            >
              收起
            </button>
          </div>
          <div class="grid grid-cols-4 gap-1.5">
            <button
              v-for="opt in shareDurations"
              :key="opt.seconds"
              type="button"
              class="btn-surface h-7 px-1 text-[11px]"
              :disabled="signingBusy"
              @click="generateAndCopyShare(opt.seconds, opt.label)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- 四格紧凑属性矩阵 -->
        <div class="grid grid-cols-2 gap-1.5 text-[11px]">
          <div class="bento-subbox px-2.5 py-1.5 flex items-center justify-between">
            <span class="text-ink-muted">文件体积</span>
            <span class="font-mono text-ink-primary">{{ formatFileSize(currentObj.Size) }}</span>
          </div>
          <div class="bento-subbox px-2.5 py-1.5 flex items-center justify-between">
            <span class="text-ink-muted">最后更新</span>
            <span class="text-ink-primary truncate ml-1">{{
              formatRelativeTime(currentObj.LastModified)
            }}</span>
          </div>
          <div class="bento-subbox px-2.5 py-1.5 flex items-center justify-between">
            <span class="text-ink-muted">存储形态</span>
            <span class="text-ink-secondary">{{
              isTextClipObject(currentObj) ? '云剪贴板' : '标准对象'
            }}</span>
          </div>
          <button
            type="button"
            class="bento-subbox px-2.5 py-1.5 flex items-center justify-between cursor-pointer hover:border-white/[0.14] transition-colors text-left"
            :disabled="visibilityBusy"
            title="点击立即切换公开或私密访问权限"
            @click="handleToggleObjVisibility"
          >
            <span class="text-ink-muted">访问权限</span>
            <span
              class="inline-flex items-center gap-1 font-medium"
              :class="
                resolveVisibility(currentObj) === 'public' ? 'text-accent' : 'text-ink-primary'
              "
            >
              <span
                :class="
                  resolveVisibility(currentObj) === 'public' ? 'i-mdi-earth' : 'i-mdi-lock-outline'
                "
                class="text-xs"
              />
              <span>{{
                resolveVisibility(currentObj) === 'public' ? '公开直链' : '私密受控'
              }}</span>
            </span>
          </button>
        </div>

        <!-- 主分发操作列 -->
        <div class="flex items-center gap-1.5">
          <button type="button" class="btn-accent flex-1 h-8" @click="copyDirectUrl">
            <span class="i-mdi-content-copy text-xs" />
            <span>复制直链</span>
          </button>

          <button
            type="button"
            class="btn-surface h-8 px-2.5"
            :class="sharePanelOpen ? 'border-accent-line text-accent' : ''"
            @click="sharePanelOpen = !sharePanelOpen"
          >
            <span class="i-mdi-timer-lock-outline text-sm" />
            <span>限时分享</span>
          </button>

          <a
            :href="buildObjectPath(currentObj.Key)"
            :download="decodeKey(currentObj.Key)"
            class="btn-surface h-8 px-2.5 no-underline"
            title="下载原文件"
          >
            <span class="i-mdi-download-outline text-sm" />
          </a>

          <button type="button" class="btn-danger-quiet h-8 px-2.5" @click="handleDeleteCurrent">
            <span class="i-mdi-trash-can-outline text-sm" />
            <span v-if="confirmDelete">确认删除</span>
          </button>
        </div>
      </footer>
    </template>

    <!-- 姿态三：待机概览与快捷操作便当列 -->
    <template v-else>
      <header
        class="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between shrink-0"
      >
        <span class="text-xs font-semibold text-ink-primary">检视与快捷指令</span>
        <span class="tag-neutral">就绪</span>
      </header>

      <div class="p-3 flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5">
        <!-- 子便当一：快速云剪贴板 -->
        <button
          type="button"
          class="bento-subbox p-3.5 text-left hover:border-accent-line hover:bg-bento-hover transition-all cursor-pointer group"
          @click="store.openClipCreator()"
        >
          <div class="flex items-center justify-between mb-1.5">
            <span
              class="text-xs font-semibold text-ink-primary group-hover:text-accent transition-colors"
            >
              新建在线云剪贴板
            </span>
            <span class="i-mdi-arrow-top-right text-sm text-ink-muted group-hover:text-accent" />
          </div>
          <p class="text-[11px] text-ink-secondary m-0 leading-relaxed">
            即时创建短链文本、代码片段或排版笔记，支持在线二次编辑与一键分发。
          </p>
        </button>

        <!-- 子便当二：全局剪贴板图像投递说明 -->
        <div class="bento-subbox p-3.5 dot-matrix-bg space-y-1.5">
          <div class="flex items-center gap-2 text-xs font-medium text-ink-primary">
            <span class="i-mdi-clipboard-arrow-up-outline text-accent text-sm" />
            <span>截图与文件无感粘贴上传</span>
          </div>
          <p class="text-[11px] text-ink-secondary m-0 leading-relaxed">
            在工作台任意空白区域直接按下粘贴快捷键，系统将自动捕获剪贴板中的截图或文件并推入高速上传队列。
          </p>
        </div>

        <!-- 子便当三：工作台快捷控制矩阵 -->
        <div class="bento-subbox p-3.5 space-y-2.5 mt-auto">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-medium text-ink-secondary">工作台快捷操作</span>
            <span class="text-ink-muted">按 / 键快速检索</span>
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              class="btn-surface h-8 justify-start px-2.5 text-xs"
              @click="prefs.viewLayout = prefs.viewLayout === 'list' ? 'grid' : 'list'"
            >
              <span
                :class="
                  prefs.viewLayout === 'list'
                    ? 'i-mdi-grid-large'
                    : 'i-mdi-format-list-bulleted-square'
                "
                class="text-accent text-xs"
              />
              <span>{{ prefs.viewLayout === 'list' ? '切换画廊视图' : '切换列表视图' }}</span>
            </button>
            <button
              type="button"
              class="btn-surface h-8 justify-start px-2.5 text-xs"
              @click="prefs.toggleVisibilityDefault()"
            >
              <span
                :class="prefs.defaultVisibility === 'public' ? 'i-mdi-earth' : 'i-mdi-lock-outline'"
                class="text-accent text-xs"
              />
              <span>{{ prefs.defaultVisibility === 'public' ? '默认：公开' : '默认：私密' }}</span>
            </button>
            <button
              type="button"
              class="btn-surface h-8 justify-start px-2.5 text-xs"
              @click="store.bootstrap()"
            >
              <span class="i-mdi-refresh text-accent text-xs" />
              <span>同步云端索引</span>
            </button>
            <button
              type="button"
              class="btn-surface h-8 justify-start px-2.5 text-xs"
              @click="prefs.expandedInspector = !prefs.expandedInspector"
            >
              <span class="i-mdi-arrow-expand-horizontal text-accent text-xs" />
              <span>{{ prefs.expandedInspector ? '标准检视栏宽' : '宽幅检视栏宽' }}</span>
            </button>
          </div>
        </div>
      </div>
    </template>
  </aside>
</template>
