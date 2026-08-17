<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { minimalSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  lineNumbers,
} from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { markdown as langMarkdown } from '@codemirror/lang-markdown'
import { json as langJson } from '@codemirror/lang-json'
import { html as langHtml } from '@codemirror/lang-html'
import { css as langCss } from '@codemirror/lang-css'
import { python as langPython } from '@codemirror/lang-python'
import { marked } from 'marked'

import {
  copyToClipboard,
  decodeObjectKey,
  fileIcon,
  formatBytes,
  formatDate,
  getPreviewType,
} from '@/utils/utils'
import { patchFile, putFile, renameFile, signShareLink } from '@/api'
import { toast } from '@/utils/toast'
import type { FileItem, PreviewType, Visibility } from '@/types'

const props = defineProps<{
  file: FileItem | null
}>()

const emit = defineEmits<{
  close: []
  refresh: []
  delete: [key: string]
}>()

// Active inspector tab
const activeTab = ref<'content' | 'share' | 'meta'>('content')

// Text & Editor state
const textContent = ref('')
const textModified = ref(false)
const textLoading = ref(false)
const textSaving = ref(false)
const selectedLang = ref('auto')
const markdownView = ref<'edit' | 'preview'>('edit')

const editorEl = useTemplateRef<HTMLDivElement>('editorEl')
let editor: EditorView | undefined

// Image zoom/rotate state
const zoomLevel = ref(1)
const rotation = ref(0)

// Share signed URL state
const shareExpire = ref(86400)
const signedUrl = ref('')
const signing = ref(false)

// Rename state
const isRenaming = ref(false)
const renameInput = ref('')
const renameLoading = ref(false)

const fileName = computed(() => decodeObjectKey(props.file?.Key || ''))
const previewType = computed<PreviewType>(() => getPreviewType(props.file?.Key))
const isTextOrCode = computed(
  () => previewType.value === 'text' || previewType.value === 'markdown',
)
const fileUrl = computed(() =>
  props.file?.Key ? `${location.origin}/${props.file.Key}` : '',
)

const currentVisibility = computed<Visibility>(() => {
  return (props.file?.customMetadata?.['x-store-visibility'] as Visibility) || 'private'
})

const renderedMarkdown = computed(() => {
  if (!textContent.value) return '<p class="text-zinc-500 text-xs">（内容为空）</p>'
  try {
    return marked.parse(textContent.value, { gfm: true, breaks: true })
  } catch {
    return textContent.value
  }
})

// Resolve language extension
function getLangExtension(lang: string, name: string) {
  let target = lang
  if (target === 'auto') {
    const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
    target = ext
  }
  switch (target) {
    case 'js':
    case 'javascript':
    case 'ts':
    case 'typescript':
      return javascript({ typescript: true })
    case 'md':
    case 'markdown':
      return langMarkdown()
    case 'json':
      return langJson()
    case 'html':
      return langHtml()
    case 'css':
      return langCss()
    case 'py':
    case 'python':
      return langPython()
    default:
      return []
  }
}

const createDoc = (text: string) => {
  const langExt = getLangExtension(selectedLang.value, fileName.value)
  return EditorState.create({
    doc: text,
    extensions: [
      minimalSetup,
      lineNumbers(),
      highlightSpecialChars(),
      drawSelection(),
      dropCursor(),
      langExt,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          textContent.value = u.state.doc.toString()
          textModified.value = true
        }
      }),
      EditorView.theme(
        {
          '&': { height: '100%', fontSize: '13px', backgroundColor: 'transparent' },
          '.cm-scroller': { fontFamily: "'JetBrains Mono', 'SF Mono', monospace", overflow: 'auto' },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            color: '#52525b',
          },
          '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.04)', color: '#d4d4d8' },
          '.cm-content': { caretColor: '#fbbf24', padding: '8px 0' },
          '&.cm-focused .cm-cursor': { borderLeftColor: '#fbbf24' },
          '&.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(251, 191, 36, 0.25)' },
        },
        { dark: true },
      ),
    ],
  })
}

// Load content when file changes
watch(
  () => props.file,
  async (f) => {
    textContent.value = ''
    textModified.value = false
    zoomLevel.value = 1
    rotation.value = 0
    signedUrl.value = ''
    isRenaming.value = false
    activeTab.value = 'content'

    if (!f) return

    if (isTextOrCode.value) {
      textLoading.value = true
      try {
        const res = await fetch(`/${f.Key}`)
        if (!res.ok) throw new Error(res.statusText)
        const raw = await res.text()
        textContent.value = raw
        if (editor) editor.setState(createDoc(raw))
      } catch {
        toast('加载文本内容失败', 'error')
      } finally {
        textLoading.value = false
      }
    }
  },
  { immediate: true },
)

const saveText = async () => {
  if (!props.file?.Key) return
  textSaving.value = true
  try {
    await putFile(
      decodeObjectKey(props.file.Key),
      textContent.value,
      currentVisibility.value,
      'text',
    )
    textModified.value = false
    toast('已保存修改', 'success')
    emit('refresh')
  } catch {
    toast('保存失败', 'error')
  } finally {
    textSaving.value = false
  }
}

const toggleVisibility = async () => {
  if (!props.file?.Key) return
  const nextVis: Visibility = currentVisibility.value === 'public' ? 'private' : 'public'
  try {
    await patchFile(decodeObjectKey(props.file.Key), nextVis)
    toast(`已切换为${nextVis === 'public' ? '公开' : '私有'}`, 'success')
    emit('refresh')
  } catch {
    toast('切换可见性失败', 'error')
  }
}

const generateSignature = async () => {
  if (!props.file?.Key) return
  signing.value = true
  try {
    const res = await signShareLink(props.file.Key, shareExpire.value)
    signedUrl.value = `${location.origin}${res.signedUrl}`
  } catch {
    toast('生成签名链接失败', 'error')
  } finally {
    signing.value = false
  }
}

const onRename = async () => {
  if (!props.file?.Key || !renameInput.value.trim()) return
  const oldKey = props.file.Key
  const newName = renameInput.value.trim()
  if (decodeObjectKey(oldKey) === newName) {
    isRenaming.value = false
    return
  }

  renameLoading.value = true
  try {
    await renameFile(oldKey, newName)
    toast('重命名成功', 'success')
    isRenaming.value = false
    emit('refresh')
  } catch {
    toast('重命名失败', 'error')
  } finally {
    renameLoading.value = false
  }
}

const copyDirectLink = async () => {
  if (!fileUrl.value) return
  const ok = await copyToClipboard(fileUrl.value)
  toast(ok ? '直链已复制' : '复制失败', ok ? 'success' : 'error')
}

const copyMarkdownSnippet = async () => {
  const url = fileUrl.value
  const name = fileName.value
  const isImg = previewType.value === 'image'
  const text = isImg ? `![${name}](${url})` : `[${name}](${url})`
  const ok = await copyToClipboard(text)
  toast(ok ? 'Markdown 语法已复制' : '复制失败', ok ? 'success' : 'error')
}

const onKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (isTextOrCode.value) void saveText()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (editorEl.value) {
    editor = new EditorView({
      state: createDoc(textContent.value),
      parent: editorEl.value,
    })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  editor?.destroy()
})

watch(selectedLang, () => {
  if (editor) editor.setState(createDoc(textContent.value))
})
</script>

<template>
  <aside
    v-if="file"
    class="w-96 md:w-[440px] xl:w-[480px] shrink-0 border-l border-white/8 bg-studio-surface flex flex-col min-h-0 z-10 transition-all select-none"
  >
    <!-- Inspector Header -->
    <div class="h-14 border-b border-white/8 px-4 flex items-center justify-between gap-2 shrink-0">
      <div class="min-w-0 flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg bg-black/40 border border-white/8 flex items-center justify-center text-zinc-400 shrink-0">
          <div :class="fileIcon(file.Key)" class="text-sm text-edge-orange"></div>
        </div>
        <div class="min-w-0">
          <!-- Inline rename mode or static name -->
          <div v-if="isRenaming" class="flex items-center gap-1">
            <input
              v-model="renameInput"
              class="input-clean text-xs py-0.5 px-2 h-6"
              autofocus
              @keyup.enter="onRename"
            />
            <button class="btn-primary h-6 px-2 text-[10px]" :disabled="renameLoading" @click="onRename">
              保存
            </button>
            <button class="btn-ghost h-6 px-1 text-[10px]" @click="isRenaming = false">
              取消
            </button>
          </div>
          <span
            v-else
            class="truncate text-xs font-semibold text-white block cursor-pointer hover:text-edge-orange transition-colors"
            :title="fileName"
            @click="isRenaming = true; renameInput = fileName"
          >
            {{ fileName }}
          </span>
          <span class="font-mono text-[10px] text-zinc-500 block">
            {{ formatBytes(file.Size ?? 0) }} · {{ formatDate(file.LastModified) }}
          </span>
        </div>
      </div>

      <!-- Header actions -->
      <div class="flex items-center gap-1">
        <button
          class="btn-ghost p-1.5"
          title="复制直链"
          @click="copyDirectLink"
        >
          <div class="i-mdi-link-variant text-sm"></div>
        </button>
        <a
          class="btn-ghost p-1.5"
          title="下载"
          :href="fileUrl"
          :download="fileName"
        >
          <div class="i-mdi-download text-sm"></div>
        </a>
        <button
          class="btn-ghost p-1.5 text-zinc-500 hover:text-white"
          title="关闭面板"
          @click="emit('close')"
        >
          <div class="i-mdi-close text-sm"></div>
        </button>
      </div>
    </div>

    <!-- Inspector Tabs -->
    <div class="flex items-center border-b border-white/8 px-4 bg-black/20 shrink-0">
      <button
        type="button"
        class="px-3 py-2 text-xs font-medium border-b-2 transition-colors"
        :class="
          activeTab === 'content'
            ? 'border-edge-orange text-white font-semibold'
            : 'border-transparent text-zinc-400 hover:text-zinc-200'
        "
        @click="activeTab = 'content'"
      >
        {{ isTextOrCode ? '实时编辑' : '预览' }}
      </button>
      <button
        type="button"
        class="px-3 py-2 text-xs font-medium border-b-2 transition-colors"
        :class="
          activeTab === 'share'
            ? 'border-edge-orange text-white font-semibold'
            : 'border-transparent text-zinc-400 hover:text-zinc-200'
        "
        @click="activeTab = 'share'"
      >
        分享与直链
      </button>
      <button
        type="button"
        class="px-3 py-2 text-xs font-medium border-b-2 transition-colors"
        :class="
          activeTab === 'meta'
            ? 'border-edge-orange text-white font-semibold'
            : 'border-transparent text-zinc-400 hover:text-zinc-200'
        "
        @click="activeTab = 'meta'"
      >
        元数据
      </button>

      <!-- Save Button on text modified -->
      <div v-if="isTextOrCode && activeTab === 'content'" class="ml-auto flex items-center gap-1.5">
        <span v-if="textModified" class="w-2 h-2 rounded-full bg-amber-400"></span>
        <button
          class="btn-primary h-6 px-2 text-[11px]"
          :disabled="textSaving || !textModified"
          @click="saveText"
        >
          <div v-if="textSaving" class="i-mdi-loading animate-spin text-xs"></div>
          <span>保存</span>
        </button>
      </div>
    </div>

    <!-- Tab 1: Content / Editor / Preview -->
    <div v-show="activeTab === 'content'" class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <!-- Text / Code / Markdown Editor -->
      <template v-if="isTextOrCode">
        <!-- Editor Sub-toolbar -->
        <div class="flex items-center justify-between px-3 py-1.5 border-b border-white/6 bg-black/10 text-xs shrink-0">
          <!-- Lang Selector -->
          <select v-model="selectedLang" class="input-clean w-auto py-0.5 px-2 text-[11px] h-6">
            <option value="auto" class="bg-studio-elevated">自动语法</option>
            <option value="md" class="bg-studio-elevated">Markdown</option>
            <option value="js" class="bg-studio-elevated">JavaScript / TS</option>
            <option value="py" class="bg-studio-elevated">Python</option>
            <option value="json" class="bg-studio-elevated">JSON</option>
            <option value="html" class="bg-studio-elevated">HTML</option>
            <option value="css" class="bg-studio-elevated">CSS</option>
            <option value="txt" class="bg-studio-elevated">纯文本</option>
          </select>

          <!-- Markdown preview switcher -->
          <div v-if="previewType === 'markdown'" class="flex rounded bg-black/40 border border-white/6 p-0.5">
            <button
              class="px-2 py-0.5 rounded text-[10px]"
              :class="markdownView === 'edit' ? 'bg-white/15 text-white' : 'text-zinc-500'"
              @click="markdownView = 'edit'"
            >
              编辑
            </button>
            <button
              class="px-2 py-0.5 rounded text-[10px]"
              :class="markdownView === 'preview' ? 'bg-white/15 text-white' : 'text-zinc-500'"
              @click="markdownView = 'preview'"
            >
              预览
            </button>
          </div>
        </div>

        <!-- Editor Container -->
        <div class="flex-1 min-h-0 overflow-hidden relative">
          <div v-if="textLoading" class="absolute inset-0 flex items-center justify-center bg-studio-surface/80 z-10">
            <div class="i-mdi-loading animate-spin text-edge-orange text-xl"></div>
          </div>
          <div
            v-show="markdownView === 'edit' || previewType !== 'markdown'"
            ref="editorEl"
            class="h-full overflow-hidden"
          ></div>
          <div
            v-show="markdownView === 'preview' && previewType === 'markdown'"
            class="h-full overflow-y-auto p-4 text-xs text-zinc-300 leading-relaxed markdown-render"
            v-html="renderedMarkdown"
          ></div>
        </div>
      </template>

      <!-- Image Preview -->
      <template v-else-if="previewType === 'image'">
        <div class="flex-1 flex flex-col items-center justify-center p-4 bg-black/40 overflow-hidden relative">
          <img
            :src="fileUrl"
            :alt="fileName"
            class="max-w-full max-h-full object-contain rounded-lg shadow-xl"
            :style="{
              transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }"
          />
        </div>
        <!-- Image Control footer -->
        <div class="p-2 border-t border-white/8 flex items-center justify-center gap-2 bg-black/20 shrink-0">
          <button class="btn-ghost p-1" title="缩小" @click="zoomLevel = Math.max(zoomLevel - 0.25, 0.5)">
            <div class="i-mdi-magnify-minus-outline text-sm"></div>
          </button>
          <span class="font-mono text-[11px] text-zinc-500 w-10 text-center">{{ Math.round(zoomLevel * 100) }}%</span>
          <button class="btn-ghost p-1" title="放大" @click="zoomLevel = Math.min(zoomLevel + 0.25, 3)">
            <div class="i-mdi-magnify-plus-outline text-sm"></div>
          </button>
          <button class="btn-ghost p-1" title="旋转" @click="rotation = (rotation + 90) % 360">
            <div class="i-mdi-rotate-right text-sm"></div>
          </button>
          <button class="btn-ghost p-1" title="重置" @click="zoomLevel = 1; rotation = 0">
            <div class="i-mdi-fit-to-screen-outline text-sm"></div>
          </button>
        </div>
      </template>

      <!-- Video / Audio Media Player -->
      <template v-else-if="previewType === 'video'">
        <div class="flex-1 flex items-center justify-center bg-black p-2">
          <video :src="fileUrl" controls autoplay class="max-w-full max-h-full rounded"></video>
        </div>
      </template>

      <template v-else-if="previewType === 'audio'">
        <div class="flex-1 flex flex-col items-center justify-center p-8 text-center bg-black/20">
          <div class="w-16 h-16 rounded-2xl bg-edge-orange/10 border border-edge-orange/20 flex items-center justify-center text-edge-orange mb-4">
            <div class="i-mdi-music-note text-3xl"></div>
          </div>
          <audio :src="fileUrl" controls autoplay class="w-full max-w-xs mt-2"></audio>
        </div>
      </template>

      <!-- PDF Preview -->
      <template v-else-if="previewType === 'pdf'">
        <iframe :src="fileUrl" class="w-full h-full border-none bg-white"></iframe>
      </template>

      <!-- Other files -->
      <template v-else>
        <div class="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
          <div class="w-16 h-16 rounded-2xl bg-studio-elevated border border-white/8 flex items-center justify-center text-zinc-400 mb-3">
            <div class="i-mdi-file-outline text-3xl"></div>
          </div>
          <p class="text-xs text-zinc-300 font-medium">该文件类型不支持在线内嵌预览</p>
          <a :href="fileUrl" :download="fileName" class="btn-primary mt-4 text-xs px-4 py-2">
            <div class="i-mdi-download text-xs mr-1"></div>
            下载到本地
          </a>
        </div>
      </template>
    </div>

    <!-- Tab 2: Share & Link Hub -->
    <div v-show="activeTab === 'share'" class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- Direct URL Card -->
      <div class="p-3 rounded-xl bg-studio-elevated border border-white/6 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-zinc-200">原始直接访问链接</span>
          <button class="btn-secondary h-6 px-2 text-[10px]" @click="copyDirectLink">
            复制
          </button>
        </div>
        <input readonly :value="fileUrl" class="input-clean font-mono text-[11px] select-all" />
      </div>

      <!-- Markdown / HTML Snippet -->
      <div class="p-3 rounded-xl bg-studio-elevated border border-white/6 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-zinc-200">Markdown 语法</span>
          <button class="btn-secondary h-6 px-2 text-[10px]" @click="copyMarkdownSnippet">
            复制
          </button>
        </div>
        <p class="font-mono text-[11px] text-zinc-400 break-all select-all bg-black/30 p-2 rounded border border-white/5">
          {{ previewType === 'image' ? `![${fileName}](${fileUrl})` : `[${fileName}](${fileUrl})` }}
        </p>
      </div>

      <!-- HMAC Signed Share Link Generator -->
      <div class="p-3 rounded-xl bg-studio-elevated border border-white/6 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-xs font-medium text-zinc-200 block">临时 HMAC 签名分享直链</span>
            <span class="text-[10px] text-zinc-500">私有文件也可以通过临时签名链接公开访问</span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <select v-model="shareExpire" class="input-clean flex-1 text-xs py-1">
            <option :value="3600">1 小时有效期</option>
            <option :value="86400">24 小时有效期</option>
            <option :value="604800">7 天有效期</option>
            <option :value="2592000">30 天有效期</option>
          </select>
          <button class="btn-primary h-8 px-3 shrink-0" :disabled="signing" @click="generateSignature">
            <div v-if="signing" class="i-mdi-loading animate-spin text-xs"></div>
            <span>生成链接</span>
          </button>
        </div>

        <div v-if="signedUrl" class="space-y-1.5 animate-fade-in">
          <input readonly :value="signedUrl" class="input-clean font-mono text-[10px] select-all" />
          <button class="btn-secondary w-full text-xs h-7" @click="copyToClipboard(signedUrl); toast('已复制签名直链', 'success')">
            复制签名直链
          </button>
        </div>
      </div>
    </div>

    <!-- Tab 3: Metadata & File Actions -->
    <div v-show="activeTab === 'meta'" class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- Properties Table -->
      <div class="rounded-xl border border-white/8 bg-studio-elevated divide-y divide-white/6 overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 text-xs">
          <span class="text-zinc-500">文件大小</span>
          <span class="font-mono text-zinc-200">{{ formatBytes(file.Size ?? 0) }} ({{ file.Size }} B)</span>
        </div>
        <div class="flex items-center justify-between px-3 py-2 text-xs">
          <span class="text-zinc-500">访问权限</span>
          <div class="flex items-center gap-2">
            <span :class="currentVisibility === 'public' ? 'badge-public' : 'badge-private'">
              {{ currentVisibility === 'public' ? '🌐 公开' : '🔒 私有' }}
            </span>
            <button class="btn-ghost text-[10px] px-1.5" @click="toggleVisibility">
              切换
            </button>
          </div>
        </div>
        <div class="flex items-center justify-between px-3 py-2 text-xs">
          <span class="text-zinc-500">修改时间</span>
          <span class="font-mono text-zinc-200">{{ formatDate(file.LastModified) }}</span>
        </div>
        <div class="flex items-center justify-between px-3 py-2 text-xs">
          <span class="text-zinc-500">ETag 校验</span>
          <span class="font-mono text-[10px] text-zinc-400 truncate max-w-[200px]" :title="file.ETag">{{ file.ETag || '-' }}</span>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="p-3 rounded-xl bg-rose-500/5 border border-rose-500/15 space-y-2">
        <span class="text-xs font-semibold text-rose-300">危险操作</span>
        <p class="text-[11px] text-zinc-500">删除后将从 Cloudflare R2 存储桶永久清除，不可恢复。</p>
        <button
          class="btn-danger w-full h-8 text-xs font-semibold"
          @click="file.Key && emit('delete', file.Key)"
        >
          <div class="i-mdi-delete-outline text-sm mr-1"></div>
          永久删除文件
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.markdown-render :deep(h1),
.markdown-render :deep(h2),
.markdown-render :deep(h3) {
  color: #f4f4f5;
  font-weight: 600;
  margin-top: 1em;
  margin-bottom: 0.4em;
}
.markdown-render :deep(code) {
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 4px;
  border-radius: 4px;
  font-family: monospace;
  color: #fbbf24;
}
.markdown-render :deep(pre) {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px;
  overflow-x: auto;
}
.markdown-render :deep(blockquote) {
  border-left: 2px solid #fbbf24;
  padding-left: 10px;
  color: #a1a1aa;
}
</style>
