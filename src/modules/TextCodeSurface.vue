<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { extractExt } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    modelValue: string
    filename?: string
    readonly?: boolean
    lineWrap?: boolean
    placeholderText?: string
  }>(),
  {
    filename: '',
    readonly: false,
    lineWrap: true,
    placeholderText: '在此输入或粘贴文本内容…'
  }
)

const emit = defineEmits<{
  'update:modelValue': [val: string]
  save: []
}>()

const hostEl = ref<HTMLDivElement | null>(null)
const ready = ref(false)

let editorInstance: EditorView | null = null
let syncingExternal = false
let mountToken = 0

async function resolveLanguageExtension(name: string): Promise<Extension | null> {
  const ext = extractExt(name)
  try {
    if (['js', 'mjs', 'cjs', 'ts', 'mts', 'jsx', 'tsx'].includes(ext)) {
      const mod = await import('@codemirror/lang-javascript')
      return mod.javascript({
        jsx: ext.endsWith('x'),
        typescript: ext.includes('ts')
      })
    }
    if (ext === 'json') {
      const mod = await import('@codemirror/lang-json')
      return mod.json()
    }
    if (ext === 'md' || ext === 'markdown') {
      const mod = await import('@codemirror/lang-markdown')
      return mod.markdown()
    }
    if (ext === 'html' || ext === 'htm' || ext === 'vue' || ext === 'xml' || ext === 'svg') {
      const mod = await import('@codemirror/lang-html')
      return mod.html()
    }
    if (ext === 'css' || ext === 'scss' || ext === 'less') {
      const mod = await import('@codemirror/lang-css')
      return mod.css()
    }
    if (ext === 'py') {
      const mod = await import('@codemirror/lang-python')
      return mod.python()
    }
  } catch {
    return null
  }
  return null
}

function destroyEditor() {
  if (editorInstance) {
    editorInstance.destroy()
    editorInstance = null
  }
  ready.value = false
}

async function mountEditor() {
  const token = ++mountToken
  destroyEditor()
  if (!hostEl.value) return

  const [{ basicSetup }, viewMod, stateMod, langExt] = await Promise.all([
    import('codemirror'),
    import('@codemirror/view'),
    import('@codemirror/state'),
    resolveLanguageExtension(props.filename)
  ])

  if (token !== mountToken || !hostEl.value) return

  const darkTheme = viewMod.EditorView.theme(
    {
      '&': {
        height: '100%',
        color: '#dde2e8',
        backgroundColor: 'transparent'
      },
      '.cm-scroller': {
        overflow: 'auto',
        lineHeight: '1.65',
        padding: '8px 0'
      },
      '.cm-content': {
        caretColor: '#2dd4bf',
        padding: '0 12px 24px 4px'
      },
      '.cm-line > span': {
        filter: 'brightness(1.75) saturate(0.65)'
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: '#2dd4bf',
        borderLeftWidth: '1.5px'
      },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        {
          backgroundColor: 'rgba(45, 212, 191, 0.2) !important'
        },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: '#464d59',
        borderRight: '1px solid rgba(255, 255, 255, 0.04)',
        paddingLeft: '4px'
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: '#949ba6'
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(255, 255, 255, 0.024)'
      },
      '.cm-placeholder': {
        color: '#525965',
        fontStyle: 'normal'
      },
      '.cm-panels': {
        backgroundColor: '#12151a',
        color: '#edeff2',
        borderColor: 'rgba(255, 255, 255, 0.07)'
      },
      '.cm-searchMatch': {
        backgroundColor: 'rgba(45, 212, 191, 0.22)'
      }
    },
    { dark: true }
  )

  const extensions: Extension[] = [
    basicSetup,
    darkTheme,
    viewMod.placeholder(props.placeholderText),
    viewMod.keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          emit('save')
          return true
        }
      }
    ]),
    viewMod.EditorView.updateListener.of((update) => {
      if (update.docChanged && !syncingExternal) {
        emit('update:modelValue', update.state.doc.toString())
      }
    })
  ]

  if (props.lineWrap) {
    extensions.push(viewMod.EditorView.lineWrapping)
  }
  if (props.readonly) {
    extensions.push(stateMod.EditorState.readOnly.of(true))
  }
  if (langExt) {
    extensions.push(langExt)
  }

  editorInstance = new viewMod.EditorView({
    state: stateMod.EditorState.create({
      doc: props.modelValue,
      extensions
    }),
    parent: hostEl.value
  })
  ready.value = true
}

watch(
  () => props.modelValue,
  (nextVal) => {
    if (!editorInstance) return
    const currentVal = editorInstance.state.doc.toString()
    if (nextVal === currentVal) return
    syncingExternal = true
    editorInstance.dispatch({
      changes: {
        from: 0,
        to: currentVal.length,
        insert: nextVal
      }
    })
    syncingExternal = false
  }
)

watch(
  () => [props.filename, props.readonly, props.lineWrap],
  () => {
    void mountEditor()
  }
)

onMounted(() => {
  void mountEditor()
})

onBeforeUnmount(() => {
  mountToken++
  destroyEditor()
})
</script>

<template>
  <div class="relative w-full h-full overflow-hidden select-text bg-[#090b0e]">
    <div
      v-if="!ready"
      class="absolute inset-0 flex items-center justify-center text-xs text-ink-muted"
    >
      正在装载编辑器内核…
    </div>
    <div ref="hostEl" class="w-full h-full" />
  </div>
</template>
