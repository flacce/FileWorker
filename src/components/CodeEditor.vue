<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, useTemplateRef } from 'vue'
import type { EditorView } from '@codemirror/view'

const props = defineProps<{
  modelValue: string
  lang: string
  fileName: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
}>()

const editorEl = useTemplateRef<HTMLDivElement>('editorEl')
let editor: EditorView | undefined
const isLoading = ref(true)

// Dynamically import CodeMirror libraries only when this component is mounted
async function initEditor() {
  isLoading.value = true
  try {
    const [
      { EditorView, lineNumbers, highlightSpecialChars, drawSelection, dropCursor },
      { EditorState },
      { minimalSetup },
    ] = await Promise.all([
      import('@codemirror/view'),
      import('@codemirror/state'),
      import('codemirror'),
    ])

    const getLangExtension = async (targetLang: string, name: string) => {
      let extTarget = targetLang
      if (extTarget === 'auto') {
        extTarget = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
      }
      switch (extTarget) {
        case 'js':
        case 'javascript':
        case 'ts':
        case 'typescript': {
          const { javascript } = await import('@codemirror/lang-javascript')
          return javascript({ typescript: true })
        }
        case 'md':
        case 'markdown': {
          const { markdown: langMarkdown } = await import('@codemirror/lang-markdown')
          return langMarkdown()
        }
        case 'json': {
          const { json: langJson } = await import('@codemirror/lang-json')
          return langJson()
        }
        case 'html': {
          const { html: langHtml } = await import('@codemirror/lang-html')
          return langHtml()
        }
        case 'css': {
          const { css: langCss } = await import('@codemirror/lang-css')
          return langCss()
        }
        case 'py': {
          const { python: langPython } = await import('@codemirror/lang-python')
          return langPython()
        }
        default:
          return []
      }
    }

    const langExt = await getLangExtension(props.lang, props.fileName)

    if (!editorEl.value) return

    if (editor) {
      editor.destroy()
      editor = undefined
    }

    const state = EditorState.create({
      doc: props.modelValue,
      extensions: [
        minimalSetup,
        lineNumbers(),
        highlightSpecialChars(),
        drawSelection(),
        dropCursor(),
        langExt,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            const val = u.state.doc.toString()
            emit('update:modelValue', val)
            emit('change', val)
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

    editor = new EditorView({
      state,
      parent: editorEl.value,
    })
  } finally {
    isLoading.value = false
  }
}

watch(
  () => [props.lang, props.fileName],
  () => {
    void initEditor()
  },
)

watch(
  () => props.modelValue,
  (newVal) => {
    if (editor && editor.state.doc.toString() !== newVal) {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: newVal },
      })
    }
  },
)

onMounted(() => {
  void initEditor()
})

onBeforeUnmount(() => {
  if (editor) {
    editor.destroy()
    editor = undefined
  }
})

defineExpose({
  getDoc: () => (editor ? editor.state.doc.toString() : props.modelValue),
})
</script>

<template>
  <div class="relative w-full h-full min-h-0 flex flex-col">
    <div
      v-if="isLoading"
      class="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/40 backdrop-blur-xs text-zinc-400 gap-2"
    >
      <div class="i-mdi-loading animate-spin text-sm text-edge-orange"></div>
      <span class="text-xs">加载编辑器环境...</span>
    </div>
    <div ref="editorEl" class="w-full h-full flex-1 overflow-hidden"></div>
  </div>
</template>
