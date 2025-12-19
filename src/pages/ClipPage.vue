<script setup lang="ts">
import { minimalSetup } from "codemirror"
import { EditorState } from "@codemirror/state"
import { EditorView, lineNumbers, highlightSpecialChars, drawSelection, dropCursor } from "@codemirror/view"

import { onMounted, onBeforeUnmount, ref, useTemplateRef } from "vue";
import useClipStore from "@/store/clip";

import { PutFile } from "@/api";
import { getRandomFilename } from "@/utils/utils";

// 响应式变量
const code = ref("");
const modified = ref(false);
const editorElement = useTemplateRef<HTMLDivElement>("editorElement");
let editor: EditorView;

// 初始化 EditorState
const startState = EditorState.create({
  doc: "",
  extensions: [
    minimalSetup,
    lineNumbers(),
    highlightSpecialChars(),
    drawSelection(),
    // 文件拖动支持
    dropCursor(),
    EditorView.updateListener.of((update) => {
      code.value = update.state.doc.toString();
      if (update.docChanged) {
        modified.value = true;
      }
    }),
    EditorView.theme({
        "&": { height: "100%", fontSize: "14px" },
        ".cm-scroller": { fontFamily: "Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace" }
    })
  ]
})

// 文件名处理
const filename = ref(getRandomFilename());
const refreshRandomFileName = () => {
  filename.value = getRandomFilename();
}

const clipStore = useClipStore();

// 保存逻辑
const onSaveBtnClick = async () => {
  await PutFile(filename.value, code.value, clipStore.visibility, "text");
  modified.value = false;
}

// 快捷键处理 (Ctrl+S / Command+S)
const saveContentKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey && e.key === "s") || (e.metaKey && e.key === "s")) {
    e.preventDefault();
    onSaveBtnClick();
  }
}

// 粘贴文件处理
const onPasteFile = async (e: ClipboardEvent) => {
  if (!e.clipboardData?.files.length) {
    return;
  }
  const file = e.clipboardData.files[0];
  const text = await file.text();
  const cursor = editor.state.selection.main.head;
  editor.dispatch({
    changes: { from: cursor, insert: text },
  });
}

onMounted(() => {
  // 创建编辑器实例
  if (editorElement.value) {
    editor = new EditorView({
      state: startState,
      parent: editorElement.value,
    })
  }

  // 注册全局事件
  window.addEventListener("keydown", saveContentKeydown);
  document.addEventListener("paste", onPasteFile);
})

onBeforeUnmount(() => {
  // 销毁时移除事件
  window.removeEventListener("keydown", saveContentKeydown);
  document.removeEventListener("paste", onPasteFile);
})

</script>

<template>
  <div class="flex flex-col items-center justify-center pt-6">
    <div class="glass-card w-full max-w-4xl p-6 shadow-xl">
      
      <!-- 头部工具栏 -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
        <div class="flex items-center gap-2 w-full sm:w-auto">
           <div class="relative w-full sm:w-64">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <div class="i-mdi-file-document-edit-outline text-gray-400"></div>
              </div>
              <input 
                class="w-full pl-10 pr-3 py-2 bg-white/50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm" 
                type="text" 
                v-model="filename" 
                placeholder="输入文件名..." 
              />
           </div>
           <button 
             @click="refreshRandomFileName" 
             class="p-2 rounded-lg hover:bg-white/50 text-gray-600 transition-colors"
             title="随机文件名"
           >
             <div class="i-mdi-refresh w-5 h-5"></div>
           </button>
           <div v-if="modified" class="text-amber-500 text-xs flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">
             <div class="i-mdi-circle-medium"></div> 未保存
           </div>
           <div v-else class="text-green-500 text-xs flex items-center gap-1 bg-green-50 px-2 py-1 rounded-full border border-green-100">
             <div class="i-mdi-check-circle"></div> 已保存
           </div>
        </div>

        <div class="flex items-center gap-3 w-full sm:w-auto justify-end">
           <select 
             class="px-3 py-2 bg-white/50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
             v-model="clipStore.visibility"
           >
             <option value="private">🔒 私有</option>
             <option value="public">🌍 公开</option>
           </select>
           
           <button 
             class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg shadow-blue-500/30 transition-all active:scale-95"
             @click="onSaveBtnClick"
           >
             <div class="i-mdi-content-save-outline"></div>
             <span>保存</span>
           </button>
        </div>
      </div>

      <!-- 编辑器区域 -->
      <div class="editor-container rounded-xl overflow-hidden border border-gray-200/50 shadow-inner bg-white/80">
        <div ref="editorElement"></div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.glass-card {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 1.5rem;
}

.editor-container {
  min-height: 500px;
}

:deep(.cm-editor) {
  height: 500px;
  background-color: transparent;
}

:deep(.cm-gutters) {
  background-color: rgba(245, 245, 245, 0.5);
  border-right: 1px solid rgba(0,0,0,0.05);
  color: #9ca3af;
}

:deep(.cm-activeLineGutter) {
  background-color: rgba(0, 0, 0, 0.05);
}
</style>
