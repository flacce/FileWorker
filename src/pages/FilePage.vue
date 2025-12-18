<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef, type Ref } from 'vue';
import useFileStore from '@/store/file';
import { formatBytes } from '@/utils/utils';
import { PutFile } from '@/api';

const fileStore = useFileStore();

// 模板引用
const fileUploadInput = useTemplateRef<HTMLInputElement>("fileUploadInput");
const fileUploadArea = useTemplateRef<HTMLDivElement>("fileUploadArea");

const requestUploadFile = () => {
  fileUploadInput.value?.click();
}

interface UploadedFile {
  name: string;
  size: number;
  visibility: string;
  done: boolean;
}

const uploadedFiles: Ref<UploadedFile[]> = ref([]);

const uploadSingle = async (index: number, filename: string, file: File) => {
  await PutFile(filename, file, fileStore.visibility, "file");
  uploadedFiles.value[index - 1].done = true;
}

const onFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const { files } = target;
  if (!files) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const index = uploadedFiles.value.push({
      name: file.name,
      size: file.size,
      visibility: fileStore.visibility,
      done: false
    });
    try {
      uploadSingle(index, file.name, file);
    } catch (error) {
      console.error("文件上传失败:", error);
    }
  }
}

const onDragEvent = async (event: DragEvent) => {
  event.preventDefault();
  event.stopPropagation();

  if (!fileUploadArea.value) return;

  if (event.type === 'dragover') {
    fileUploadArea.value.style.border = '2px dashed #000';
  } else {
    fileUploadArea.value.style.border = '2px dashed #e5e7eb';
  }

  if (event.type === 'drop') {
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const index = uploadedFiles.value.push({
          name: file.name,
          size: file.size,
          visibility: fileStore.visibility,
          done: false
        });
        try {
          uploadSingle(index, file.name, file);
        } catch (error) {
          console.error("拖拽上传失败:", error);
        }
      }
    }
  }
}

onMounted(() => {
  // 绑定选择文件事件
  fileUploadInput.value?.addEventListener('change', onFileChange);

  // 绑定拖拽事件
  const area = fileUploadArea.value;
  if (area) {
    area.addEventListener('dragenter', onDragEvent);
    area.addEventListener('dragover', onDragEvent);
    area.addEventListener('dragleave', onDragEvent);
    area.addEventListener('drop', onDragEvent);
  }
});

onUnmounted(() => {
  fileUploadInput.value?.removeEventListener('change', onFileChange);

  const area = fileUploadArea.value;
  if (area) {
    area.removeEventListener('dragenter', onDragEvent);
    area.removeEventListener('dragover', onDragEvent);
    area.removeEventListener('dragleave', onDragEvent);
    area.removeEventListener('drop', onDragEvent);
  }
});

</script>

<template>
  <div class="flex flex-col items-center">
    <div class="file-area flex flex-col mt-4">
      <div class="files" @click="requestUploadFile" ref="fileUploadArea">
        <input ref="fileUploadInput" type="file" class="hidden" multiple />
      </div>
      <div class="footer p-2">
        <select class="public-select" v-model="fileStore.visibility">
          <option value="private">{{ $t('common.private') }}</option>
          <option value="public">{{ $t('common.public') }}</option>
        </select>
      </div>
    </div>
    <div class="px-4 py-4 max-w-screen-md w-4/5">
      <a v-for="file in uploadedFiles" :key="file.name" class="w-full flex flex-row items-center mt-4"
        :href="`/${file.name}`" target="_blank">
        <div class="w-10 h-10 i-mdi-file-document-outline"></div>
        <div class="flex flex-col">
          <div class="text-lg font-semibold">{{ file.name }}</div>
          <div class="text-sm text-gray">{{ formatBytes(file.size) }} {{ file.visibility }}</div>
        </div>
        <div class="ml-auto w-6 h-6" :class="file.done ? 'i-mdi-check' : 'uploading'"></div>
      </a>
    </div>
  </div>
</template>

<style>
html,
body,
#app {
  margin: 0;
  padding: 0;
  background-color: #f8f9fa;
}

.pannel {
  --uno: my-6 px-4 py-4 max-w-screen-md w-4/5 rounded shadow-md;
}

.tips-pannel {
  background-color: #d1e7dd;
}

.file-area {
  --uno: rounded max-w-screen-md w-4/5 border-1 border-gray-300;
  background-color: white;
}

.file-area .header {
  background-color: #f5f5f5;
}

.file-area .footer {
  --uno: flex flex-row;
  background-color: #f5f5f5;
}

.file-area .footer .public-select {
  --uno: border-1 rounded px-6 py-1.5 text-sm;
  border-color: #d1d1d1;
  outline-color: #0969da;
}

.file-area .footer .save-btn {
  --uno: rounded px-6 py-1.5 text-sm ml-auto text-white;
  background-color: #1f883d;
}

.file-area .footer .save-btn:hover {
  background-color: #1a7f37;
}

.file-area .header .filename-input {
  --uno: border-1 rounded px-3 py-2 text-sm w-60;
  border-color: #d1d1d1;
  outline-color: #0969da;
}

.files {
  --uno: h-50 border-dashed border-2 cursor-pointer;
  background: url(../assets/upload.svg) center center no-repeat;
  background-color: white;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.uploading {
  border: 5px solid #f3f3f3;
  border-top: 5px solid #555;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: inline-block;
  animation: spin 2s linear infinite;
}
</style>
