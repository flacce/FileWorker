<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'

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

// Async lazy-load CodeEditor to keep initial bundle size lightweight
const CodeEditor = defineAsyncComponent(() => import('@/components/CodeEditor.vue'))

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
const renderedMarkdown = ref('')

const editorRef = useTemplateRef<{ getDoc: () => string }>('editorRef')

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
const previewType = computed<PreviewType>(() =>
  getPreviewType(props.file?.Key, props.file?.customMetadata),
)
const isTextOrCode = computed(
  () => previewType.value === 'text' || previewType.value === 'markdown',
)
const fileUrl = computed(() =>
  props.file?.Key
    ? `${location.origin}/${encodeURIComponent(decodeURIComponent(props.file.Key))}`
    : '',
)

const currentVisibility = computed<Visibility>(() => {
  return (props.file?.customMetadata?.['x-store-visibility'] as Visibility) || 'public'
})

// Dynamic lazy import of marked parser only when markdown preview is active
async function updateMarkdownRender(text: string) {
  if (!text) {
    renderedMarkdown.value = '<p class="text-zinc-500 text-xs">（内容为空）</p>'
    return
  }
  try {
    const { marked } = await import('marked')
    renderedMarkdown.value = await Promise.resolve(marked.parse(text, { gfm: true, breaks: true }))
  } catch {
    renderedMarkdown.value = text
  }
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
        const fetchUrl = `/${encodeURIComponent(decodeURIComponent(f.Key || ''))}`
        const res = await fetch(fetchUrl)
        if (!res.ok) throw new Error(res.statusText)
        const raw = await res.text()
        textContent.value = raw
        if (previewType.value === 'markdown' && markdownView.value === 'preview') {
          void updateMarkdownRender(raw)
        }
      } catch {
        toast('加载文本内容失败', 'error')
      } finally {
        textLoading.value = false
      }
    }
  },
  { immediate: true },
)

watch(markdownView, (val) => {
  if (val === 'preview') {
    void updateMarkdownRender(textContent.value)
  }
})

const onTextChange = (val: string) => {
  textContent.value = val
  textModified.value = true
}

const saveText = async () => {
  if (!props.file?.Key) return
  textSaving.value = true
  try {
    const textToSave = editorRef.value ? editorRef.value.getDoc() : textContent.value
    await putFile(
      decodeObjectKey(props.file.Key),
      textToSave,
      currentVisibility.value,
      'text',
    )
    textContent.value = textToSave
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
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Transition name="fade-in">
    <div
      v-if="file"
      class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md select-none"
      @click.self="emit('close')"
    >
      <div
        class="w-full max-w-4xl h-[85vh] max-h-[780px] rounded-2xl border border-white/12 bg-studio-surface shadow-2xl flex flex-col min-h-0 overflow-hidden animate-fade-in"
      >
        <!-- Inspector Header -->
        <div class="h-14 border-b border-white/8 px-4 sm:px-5 flex items-center justify-between gap-3 shrink-0 bg-black/20">
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
                class="h-full overflow-hidden"
              >
                <CodeEditor
                  ref="editorRef"
                  v-model="textContent"
                  :lang="selectedLang"
                  :file-name="fileName"
                  @change="onTextChange"
                />
              </div>
              <div
                v-show="markdownView === 'preview' && previewType === 'markdown'"
                class="h-full overflow-y-auto p-4 text-xs text-zinc-300 leading-relaxed markdown-render"
                v-html="renderedMarkdown"
              ></div>
            </div>
          </template>

          <!-- Image Preview -->
          <div
            v-else-if="previewType === 'image'"
            class="flex-1 flex flex-col items-center justify-center p-4 min-h-0 relative overflow-hidden bg-black/40"
          >
            <!-- Zoom / Rotate controls floating bar -->
            <div class="absolute top-3 right-3 flex items-center gap-1 z-10 bg-black/60 backdrop-blur-md rounded-lg p-1 border border-white/10">
              <button
                class="btn-ghost p-1 text-xs"
                title="缩小"
                @click="zoomLevel = Math.max(0.2, zoomLevel - 0.2)"
              >
                <div class="i-mdi-magnify-minus-outline"></div>
              </button>
              <span class="font-mono text-[10px] text-zinc-400 px-1">{{ Math.round(zoomLevel * 100) }}%</span>
              <button
                class="btn-ghost p-1 text-xs"
                title="放大"
                @click="zoomLevel = Math.min(3, zoomLevel + 0.2)"
              >
                <div class="i-mdi-magnify-plus-outline"></div>
              </button>
              <div class="w-[1px] h-3 bg-white/20 mx-1"></div>
              <button
                class="btn-ghost p-1 text-xs"
                title="向右旋转 90°"
                @click="rotation = (rotation + 90) % 360"
              >
                <div class="i-mdi-rotate-right"></div>
              </button>
              <button
                class="btn-ghost p-1 text-xs"
                title="重置"
                @click="zoomLevel = 1; rotation = 0"
              >
                <div class="i-mdi-refresh"></div>
              </button>
            </div>

            <!-- Image with transform -->
            <div class="flex items-center justify-center max-h-full max-w-full overflow-hidden transition-all duration-200">
              <img
                :src="fileUrl"
                :alt="fileName"
                class="max-h-[50vh] max-w-full object-contain rounded shadow-lg transition-transform duration-200 origin-center"
                :style="{
                  transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                }"
              />
            </div>
          </div>

          <!-- Audio Preview -->
          <div
            v-else-if="previewType === 'audio'"
            class="flex-1 flex flex-col items-center justify-center p-8 min-h-0 bg-black/30"
          >
            <div class="w-16 h-16 rounded-full bg-edge-orange/10 border border-edge-orange/20 flex items-center justify-center text-edge-orange mb-6">
              <div class="i-mdi-music text-3xl"></div>
            </div>
            <audio :src="fileUrl" controls class="w-full max-w-md accent-edge-orange"></audio>
          </div>

          <!-- Video Preview -->
          <div
            v-else-if="previewType === 'video'"
            class="flex-1 flex items-center justify-center p-4 min-h-0 bg-black"
          >
            <video :src="fileUrl" controls class="max-h-full max-w-full rounded shadow-lg"></video>
          </div>

          <!-- PDF Preview -->
          <div
            v-else-if="previewType === 'pdf'"
            class="flex-1 min-h-0 w-full bg-black/40"
          >
            <iframe :src="fileUrl" class="w-full h-full border-none"></iframe>
          </div>

          <!-- Binary / Unpreviewable File fallback -->
          <div
            v-else
            class="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500 min-h-0"
          >
            <div class="w-16 h-16 rounded-2xl bg-black/30 border border-white/6 flex items-center justify-center text-zinc-600 mb-3">
              <div :class="fileIcon(file.Key)" class="text-3xl text-zinc-500"></div>
            </div>
            <p class="text-sm font-medium text-zinc-300">不支持直接预览该格式</p>
            <p class="text-xs text-zinc-500 mt-1 max-w-xs">
              该类型为二进制或未知格式，你可以直接下载到本地或通过直链访问。
            </p>
            <a
              :href="fileUrl"
              :download="fileName"
              class="btn-primary mt-4 px-4 h-8 text-xs inline-flex items-center gap-1.5"
            >
              <div class="i-mdi-download"></div>
              <span>下载文件</span>
            </a>
          </div>
        </div>

        <!-- Tab 2: Share & Links -->
        <div v-show="activeTab === 'share'" class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <!-- Permanent Direct Link -->
          <div class="p-3.5 rounded-xl border border-white/8 bg-black/20 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-zinc-300">永久直接访问直链</span>
              <span
                class="badge"
                :class="currentVisibility === 'public' ? 'badge-public' : 'badge-private'"
              >
                {{ currentVisibility === 'public' ? '当前公开' : '当前私有' }}
              </span>
            </div>
            <p class="text-[11px] text-zinc-500 leading-normal">
              如果是公开文件，任何拿到此链接的人均可直接读取下载；若为私有，则需登录凭证。
            </p>
            <div class="flex items-center gap-2">
              <input
                type="text"
                readonly
                :value="fileUrl"
                class="input-clean text-xs font-mono py-1.5 flex-1 select-all"
              />
              <button class="btn-secondary px-3 h-8 text-xs shrink-0" @click="copyDirectLink">
                复制直链
              </button>
            </div>
          </div>

          <!-- Markdown embed snippet -->
          <div class="p-3.5 rounded-xl border border-white/8 bg-black/20 space-y-2">
            <span class="text-xs font-semibold text-zinc-300">Markdown 嵌入代码</span>
            <div class="flex items-center gap-2">
              <input
                type="text"
                readonly
                :value="previewType === 'image' ? `![${fileName}](${fileUrl})` : `[${fileName}](${fileUrl})`"
                class="input-clean text-xs font-mono py-1.5 flex-1 select-all"
              />
              <button class="btn-secondary px-3 h-8 text-xs shrink-0" @click="copyMarkdownSnippet">
                复制代码
              </button>
            </div>
          </div>

          <!-- Temporary Signed Link Generator (HMAC-SHA256) -->
          <div class="p-3.5 rounded-xl border border-white/8 bg-black/20 space-y-3">
            <span class="text-xs font-semibold text-zinc-300">临时安全直链（私有文件分享）</span>
            <p class="text-[11px] text-zinc-500 leading-normal">
              为私有文件生成具备 HMAC 签名与有效期的临时直链，到期后自动失效，适合临时向外部发送文件。
            </p>
            <div class="flex items-center gap-2">
              <label class="text-xs text-zinc-400 shrink-0">有效期：</label>
              <select v-model.number="shareExpire" class="input-clean w-32 py-1 px-2 text-xs">
                <option :value="3600">1 小时</option>
                <option :value="21600">6 小时</option>
                <option :value="86400">1 天 (24h)</option>
                <option :value="604800">7 天</option>
              </select>
              <button
                class="btn-primary h-8 px-3 text-xs"
                :disabled="signing"
                @click="generateSignature"
              >
                <div v-if="signing" class="i-mdi-loading animate-spin text-xs"></div>
                <span>生成签名链接</span>
              </button>
            </div>

            <!-- Output signed link -->
            <div v-if="signedUrl" class="flex items-center gap-2 pt-1">
              <input
                type="text"
                readonly
                :value="signedUrl"
                class="input-clean text-xs font-mono py-1.5 flex-1 text-edge-orange select-all"
              />
              <button
                class="btn-secondary px-3 h-8 text-xs shrink-0"
                @click="copyToClipboard(signedUrl).then((ok) => toast(ok ? '签名直链已复制' : '复制失败', ok ? 'success' : 'error'))"
              >
                复制
              </button>
            </div>
          </div>
        </div>

        <!-- Tab 3: Metadata -->
        <div v-show="activeTab === 'meta'" class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div class="rounded-xl border border-white/8 bg-black/20 divide-y divide-white/6 text-xs">
            <div class="flex items-center justify-between p-3">
              <span class="text-zinc-400">完整键名 (Object Key)</span>
              <span class="font-mono text-zinc-200 break-all select-all">{{ file.Key }}</span>
            </div>
            <div class="flex items-center justify-between p-3">
              <span class="text-zinc-400">文件大小</span>
              <span class="font-mono text-zinc-200">{{ formatBytes(file.Size ?? 0) }} ({{ file.Size }} bytes)</span>
            </div>
            <div class="flex items-center justify-between p-3">
              <span class="text-zinc-400">最后更新时间</span>
              <span class="font-mono text-zinc-200">{{ file.LastModified ? new Date(file.LastModified).toLocaleString() : '-' }}</span>
            </div>
            <div class="flex items-center justify-between p-3">
              <span class="text-zinc-400">ETag / 校验和</span>
              <span class="font-mono text-zinc-400 text-[11px] break-all">{{ file.ETag || '-' }}</span>
            </div>
            <div class="flex items-center justify-between p-3">
              <span class="text-zinc-400">当前可见性</span>
              <div class="flex items-center gap-2">
                <span
                  class="badge"
                  :class="currentVisibility === 'public' ? 'badge-public' : 'badge-private'"
                >
                  {{ currentVisibility === 'public' ? '公开' : '私有' }}
                </span>
                <button class="btn-secondary h-6 px-2 text-[10px]" @click="toggleVisibility">
                  切换为{{ currentVisibility === 'public' ? '私有' : '公开' }}
                </button>
              </div>
            </div>
            <div v-if="file.customMetadata?.['x-store-type']" class="flex items-center justify-between p-3">
              <span class="text-zinc-400">存储分类 (Store Type)</span>
              <span class="font-mono text-zinc-300 text-[11px]">{{ file.customMetadata['x-store-type'] }}</span>
            </div>
          </div>
        </div>

        <!-- Inspector Footer -->
        <div class="h-12 border-t border-white/8 px-4 flex items-center justify-between bg-black/30 shrink-0">
          <div class="flex items-center gap-2">
            <button
              class="btn-danger h-7 px-2.5 text-xs inline-flex items-center gap-1.5"
              @click="file.Key && emit('delete', file.Key)"
            >
              <div class="i-mdi-delete-outline text-xs"></div>
              <span>删除文件</span>
            </button>
          </div>
          <button class="btn-secondary h-7 px-3 text-xs" @click="emit('close')">
            关闭
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
