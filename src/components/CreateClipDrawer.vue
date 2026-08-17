<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
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

import { getRandomFilename } from '@/utils/utils'
import { putFile } from '@/api'
import { toast } from '@/utils/toast'
import type { Visibility } from '@/types'

const props = defineProps<{
  open: boolean
  initialText?: string
}>()

const emit = defineEmits<{
  close: []
  saved: [filename: string]
}>()

const filename = ref(getRandomFilename())
const visibility = ref<Visibility>('private')
const selectedLang = ref('auto')
const saving = ref(false)
const code = ref('')

const editorEl = useTemplateRef<HTMLDivElement>('editorEl')
let editor: EditorView | undefined

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
  const langExt = getLangExtension(selectedLang.value, filename.value)
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
          code.value = u.state.doc.toString()
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
          '.cm-content': { caretColor: '#fbbf24', padding: '12px 0' },
          '&.cm-focused .cm-cursor': { borderLeftColor: '#fbbf24' },
          '&.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(251, 191, 36, 0.25)' },
        },
        { dark: true },
      ),
    ],
  })
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      filename.value = getRandomFilename()
      code.value = props.initialText || ''
      if (editor) {
        editor.setState(createDoc(code.value))
      }
    }
  },
)

const save = async () => {
  const name = filename.value.trim()
  if (!name) {
    toast('请填写文件名', 'error')
    return
  }
  saving.value = true
  try {
    await putFile(name, code.value, visibility.value, 'text')
    toast(`已保存剪贴板「${name}」`, 'success')
    emit('saved', name)
    emit('close')
  } catch {
    toast('保存失败', 'error')
  } finally {
    saving.value = false
  }
}

const onKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && props.open) {
    e.preventDefault()
    void save()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (editorEl.value) {
    editor = new EditorView({
      state: createDoc(code.value),
      parent: editorEl.value,
    })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  editor?.destroy()
})
</script>

<template>
  <Transition name="fade-in">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md select-none"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-2xl h-[520px] rounded-2xl border border-white/12 bg-studio-surface shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        <!-- Header -->
        <div class="h-12 border-b border-white/8 px-4 flex items-center justify-between gap-3 shrink-0">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-md bg-edge-orange/15 border border-edge-orange/30 flex items-center justify-center text-edge-orange">
              <div class="i-mdi-code-braces text-xs"></div>
            </div>
            <span class="text-xs font-semibold text-white">新建代码 / 文本剪贴板</span>
          </div>

          <button class="btn-ghost p-1 text-zinc-400 hover:text-white" @click="emit('close')">
            <div class="i-mdi-close text-base"></div>
          </button>
        </div>

        <!-- Controls Sub-bar -->
        <div class="flex items-center justify-between px-4 py-2 border-b border-white/6 bg-black/20 gap-2 shrink-0">
          <div class="flex items-center gap-2 flex-1 max-w-xs">
            <input
              v-model="filename"
              class="input-clean py-1 text-xs"
              placeholder="文件名 (例如 snippet.js)"
            />
            <button
              class="btn-ghost p-1.5"
              title="随机名称"
              @click="filename = getRandomFilename()"
            >
              <div class="i-mdi-refresh text-xs"></div>
            </button>
          </div>

          <div class="flex items-center gap-2">
            <select v-model="selectedLang" class="input-clean w-auto py-1 text-xs">
              <option value="auto" class="bg-studio-elevated">自动语法</option>
              <option value="md" class="bg-studio-elevated">Markdown</option>
              <option value="js" class="bg-studio-elevated">JavaScript / TS</option>
              <option value="py" class="bg-studio-elevated">Python</option>
              <option value="json" class="bg-studio-elevated">JSON</option>
              <option value="html" class="bg-studio-elevated">HTML</option>
              <option value="css" class="bg-studio-elevated">CSS</option>
              <option value="txt" class="bg-studio-elevated">纯文本</option>
            </select>

            <select v-model="visibility" class="input-clean w-auto py-1 text-xs">
              <option value="private" class="bg-studio-elevated">🔒 私有</option>
              <option value="public" class="bg-studio-elevated">🌐 公开</option>
            </select>
          </div>
        </div>

        <!-- CodeMirror Editor Area -->
        <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden bg-black/30"></div>

        <!-- Footer -->
        <div class="h-12 border-t border-white/8 px-4 flex items-center justify-between bg-studio-surface shrink-0">
          <span class="text-[11px] font-mono text-zinc-500">快捷键 Ctrl + S 快速保存</span>
          <div class="flex items-center gap-2">
            <button class="btn-ghost px-3 text-xs" @click="emit('close')">
              取消
            </button>
            <button class="btn-primary h-7 px-4 text-xs font-semibold" :disabled="saving" @click="save">
              <div v-if="saving" class="i-mdi-loading animate-spin text-xs"></div>
              <span>保存剪贴板</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
