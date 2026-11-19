<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { VisibilityMode } from '@/types'
import { issueSignedUrl, readObjectText, writeTextObject } from '@/api'
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
const clipSavingAction = ref<'save' | 'copy'>('save')
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
let markdownRenderToken = 0

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return entities[char]!
  })
}

function isSafeMarkdownUrl(value: string, image = false): boolean {
  try {
    const protocol = new URL(value, window.location.origin).protocol
    return image
      ? protocol === 'http:' || protocol === 'https:'
      : protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

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
  const key = clipKeyInput.value.trim().replace(/^\/+/, '') || clipPlaceholderKey.value
  const k = `${store.currentPrefix}${key}`
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
  textLoading.value = false
}

async function compileMarkdown(source: string) {
  const token = ++markdownRenderToken
  try {
    const { Marked } = await import('marked')
    const out = await new Marked({
      renderer: {
        html({ text }) {
          return escapeHtml(text)
        },
        link({ href, title, tokens }) {
          if (!isSafeMarkdownUrl(href)) return this.parser.parseInline(tokens)
          const content = this.parser.parseInline(tokens)
          const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
          return `<a href="${escapeHtml(href)}"${titleAttr} rel="noopener noreferrer">${content}</a>`
        },
        image({ href, title, text }) {
          if (!isSafeMarkdownUrl(href, true)) return escapeHtml(text)
          const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
          return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${titleAttr}>`
        }
      }
    }).parse(source)
    if (token === markdownRenderToken) renderedHtml.value = out
  } catch {
    if (token === markdownRenderToken) {
      renderedHtml.value = '<p>文档排版渲染失败，请切换至源码视图查看。</p>'
    }
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
    const raw = await readObjectText(obj.Key, ctrl.signal, resolveVisibility(obj) === 'public')
    if (ctrl.signal.aborted) return
    originText.value = raw
    draftText.value = raw
    if (currentKind.value === 'markdown') {
      await compileMarkdown(raw)
    }
  } catch {
    // 请求层负责提示读取失败，主动取消时保持静默
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
    markdownRenderToken++
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

async function copyPreviewClipUrl() {
  if (clipVisibility.value === 'private') {
    notify('私密片段请先保存，保存后才能生成临时访问链接', 'normal')
    return
  }

  const url = previewClipUrl.value
  const notice = '已复制直链预览地址'
  try {
    const ok = await writeClipboard(url)
    if (ok) notify(notice, 'ok')
  } catch {
    // 请求层已负责提示错误
  }
}

async function publishClip(copyLink = true) {
  if (clipSaving.value) return
  if (!clipBody.value.trim()) {
    notify('请先输入或粘贴剪贴板文本内容', 'warn')
    return
  }

  const finalKey =
    (store.currentPrefix ? store.currentPrefix : '') +
    (clipKeyInput.value.trim().replace(/^\/+/, '') || clipPlaceholderKey.value)

  clipSaving.value = true
  clipSavingAction.value = copyLink ? 'copy' : 'save'
  try {
    await writeTextObject(finalKey, clipBody.value, clipVisibility.value, 'text')
    if (copyLink) {
      let linkToCopy = buildPublicUrl(finalKey)
      if (clipVisibility.value === 'private') {
        const signed = await issueSignedUrl(finalKey, 86400)
        linkToCopy = signed.signedUrl
      }
      const copied = await writeClipboard(linkToCopy)
      notify(copied ? '云剪贴板已保存并复制访问直链' : '云剪贴板已保存至云端', 'ok')
    } else {
      notify('云剪贴板已保存至云端', 'ok')
    }
    clipKeyInput.value = ''
    clipBody.value = ''
    await store.bootstrap(true)
    const saved = store.objects.find((i) => decodeKey(i.Key) === decodeKey(finalKey))
    if (saved) {
      if (store.activeCategory !== 'all' && classifyResource(saved) !== store.activeCategory) {
        store.activeCategory = 'all'
      }
      store.inspectObject(saved.Key)
    } else {
      store.creatingClip = false
    }
  } catch {
    // 具体失败原因由 api 层统一提示，此处仅避免未捕获的 Promise 拒绝
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
  markdownRenderToken++
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
            class="btn-icon w-7 h-7"
            title="保存剪贴板（Ctrl/⌘ + S）"
            aria-label="保存剪贴板"
            :disabled="clipSaving"
            @click="publishClip(false)"
          >
            <span
              v-if="clipSaving && clipSavingAction === 'save'"
              class="i-mdi-loading animate-spin text-sm"
              aria-hidden="true"
            />
            <span v-else class="i-mdi-content-save-outline text-sm" aria-hidden="true" />
          </button>
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
          <button
            type="button"
            class="truncate font-mono bg-transparent border-none cursor-pointer p-0 text-left text-ink-muted hover:text-accent transition-colors min-w-0"
            :title="
              clipVisibility === 'private'
                ? '私密片段请先保存，保存后可生成临时访问链接'
                : `点击复制直链：${previewClipUrl}`
            "
            @click="copyPreviewClipUrl"
          >
            {{ clipVisibility === 'private' ? '保存后访问' : '直链预览' }}：{{ previewClipUrl }}
          </button>
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
          @save="publishClip(false)"
        />
      </div>

      <!-- 底部发布栏 -->
      <footer
        class="p-3 border-t border-white/[0.06] flex items-center justify-between gap-2 bg-bento-raised/30 shrink-0"
      >
        <span class="text-[11px] text-ink-muted font-mono"> {{ clipBody.length }} 字符 </span>
        <div class="flex items-center gap-1.5 flex-wrap justify-end">
          <button type="button" class="btn-quiet h-8" @click="clipBody = ''">清空内容</button>
          <button
            type="button"
            class="btn-surface h-8 px-3"
            :disabled="clipSaving"
            title="仅保存到云端，不复制直链（Ctrl/⌘ + S）"
            @click="publishClip(false)"
          >
            <span
              v-if="clipSaving && clipSavingAction === 'save'"
              class="i-mdi-loading animate-spin text-xs"
            />
            <span v-else class="i-mdi-content-save-outline text-sm" />
            <span>{{ clipSaving && clipSavingAction === 'save' ? '保存中…' : '保存' }}</span>
          </button>
          <button
            type="button"
            class="btn-accent h-8 px-3.5"
            :disabled="clipSaving"
            @click="publishClip(true)"
          >
            <span
              v-if="clipSaving && clipSavingAction === 'copy'"
              class="i-mdi-loading animate-spin text-xs"
            />
            <span v-else class="i-mdi-cloud-upload-outline text-sm" />
            <span>{{
              clipSaving && clipSavingAction === 'copy' ? '正在上云…' : '保存并复制直链'
            }}</span>
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
            type="button"
            class="h-6 px-2 text-[11px]"
            :class="isTextModified ? 'btn-accent' : 'btn-quiet'"
            :disabled="savingEdit || textLoading || textOversized || !isTextModified"
            :title="
              textOversized
                ? '内容未载入，无法保存'
                : isTextModified
                  ? '保存当前改动到云端（Ctrl/⌘ + S）'
                  : '当前内容与云端一致，无需保存'
            "
            @click="saveModifiedText"
          >
            <span v-if="savingEdit" class="i-mdi-loading animate-spin text-xs" />
            <span v-else class="i-mdi-content-save-outline text-xs" />
            <span>{{ savingEdit ? '保存中…' : '保存' }}</span>
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

        <!-- 直链地址条：地址与复制入口保持高对比显示 -->
        <div class="bento-subbox p-2.5 space-y-1.5">
          <div class="flex items-center gap-1.5 text-[11px]">
            <span
              :class="
                resolveVisibility(currentObj) === 'public'
                  ? 'i-mdi-link-variant text-accent'
                  : 'i-mdi-lock-outline text-ink-secondary'
              "
              class="text-sm"
            />
            <span class="text-ink-primary font-medium">{{
              resolveVisibility(currentObj) === 'public' ? '公开直链' : '私密访问'
            }}</span>
            <span v-if="resolveVisibility(currentObj) === 'public'" class="tag-accent">可复制</span>
          </div>
          <template v-if="resolveVisibility(currentObj) === 'public'">
            <div class="flex items-stretch gap-2 min-w-0">
              <code
                class="flex-1 min-w-0 overflow-x-auto whitespace-nowrap select-text rounded-ctrl border border-white/[0.1] bg-[#090b0e] px-2.5 py-1.5 font-mono text-xs text-ink-primary"
                :title="buildPublicUrl(currentObj.Key)"
              >
                {{ buildPublicUrl(currentObj.Key) }}
              </code>
              <button
                type="button"
                class="btn-accent h-8 px-3 shrink-0 text-white"
                title="复制此直链到剪贴板"
                @click="copyDirectUrl"
              >
                <span class="i-mdi-content-copy text-sm" />
                <span>复制直链</span>
              </button>
            </div>
          </template>
          <span v-else class="text-[11px] text-ink-secondary">
            私密受控对象，请使用下方限时分享获取访问链接。
          </span>
        </div>

        <!-- 主分发操作列 -->
        <div class="flex items-center gap-1.5">
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

    <!-- 移动端允许在尚未选中文件时打开预览页 -->
    <template v-else>
      <div class="flex-1 flex flex-col items-center justify-center gap-3 p-5">
        <span class="i-mdi-file-eye-outline text-3xl text-ink-muted" aria-hidden="true" />
        <p class="m-0 text-sm font-medium">尚未选择文件</p>
        <button type="button" class="btn-surface min-h-11" @click="closeInspector">
          返回文件列表
        </button>
      </div>
    </template>
  </aside>
</template>
