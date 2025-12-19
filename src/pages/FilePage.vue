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
    fileUploadArea.value.classList.add('is-dragging');
  } else {
    fileUploadArea.value.classList.remove('is-dragging');
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
  <div class="flex flex-col items-center justify-center pt-6">
    <div class="w-full max-w-4xl space-y-6">
      
      <!-- 上传区域 -->
      <div class="glass-card p-6">
        <div class="flex flex-col sm:flex-row items-center justify-between mb-4">
          <h2 class="text-xl font-bold flex items-center gap-2">
            <div class="i-mdi-cloud-upload text-blue-500"></div>
            上传文件
          </h2>
          <div class="flex items-center gap-2 mt-2 sm:mt-0">
             <span class="text-sm text-gray-500">默认权限:</span>
             <select 
               class="px-3 py-1.5 bg-white/50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
               v-model="fileStore.visibility"
             >
               <option value="private">🔒 私有</option>
               <option value="public">🌍 公开</option>
             </select>
          </div>
        </div>

        <div 
          class="upload-zone relative group cursor-pointer border-2 border-dashed border-gray-300 rounded-xl p-12 transition-all duration-300 hover:border-blue-400 hover:bg-blue-50/50"
          @click="requestUploadFile" 
          ref="fileUploadArea"
        >
          <input ref="fileUploadInput" type="file" class="hidden" multiple />
          <div class="flex flex-col items-center justify-center text-gray-400 group-hover:text-blue-500 transition-colors">
            <div class="i-mdi-cloud-upload-outline text-6xl mb-4 transform group-hover:scale-110 transition-transform duration-300"></div>
            <p class="text-lg font-medium">点击或拖拽文件到此处上传</p>
            <p class="text-xs mt-2 text-gray-400">支持批量上传</p>
          </div>
        </div>
      </div>

      <!-- 文件列表 -->
      <div v-if="uploadedFiles.length > 0" class="space-y-3">
        <h3 class="text-lg font-semibold px-2">上传队列</h3>
        <transition-group name="list" tag="div" class="space-y-3">
          <a 
            v-for="file in uploadedFiles" 
            :key="file.name" 
            class="glass-item block group"
            :href="`/${file.name}`" 
            target="_blank"
          >
            <div class="flex items-center p-4">
              <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                <div class="i-mdi-file-document-outline text-blue-600 text-xl"></div>
              </div>
              
              <div class="flex-grow min-w-0">
                <div class="flex items-center gap-2">
                   <div class="font-semibold text-gray-700 truncate group-hover:text-blue-600 transition-colors">{{ file.name }}</div>
                   <div v-if="file.visibility === 'private'" class="i-mdi-lock text-xs text-gray-400" title="私有"></div>
                </div>
                <div class="text-xs text-gray-400 mt-0.5">{{ formatBytes(file.size) }}</div>
              </div>

              <div class="ml-4 flex-shrink-0">
                 <div v-if="file.done" class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                   <div class="i-mdi-check text-xl"></div>
                 </div>
                 <div v-else class="uploading-spinner w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              </div>
            </div>
          </a>
        </transition-group>
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
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.glass-item {
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 1rem;
  transition: all 0.2s;
}

.glass-item:hover {
  background: rgba(255, 255, 255, 0.8);
  transform: translateX(4px);
  border-color: rgba(59, 130, 246, 0.3);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
}

.is-dragging {
  border-color: #3b82f6 !important;
  background-color: rgba(239, 246, 255, 0.8) !important;
  transform: scale(1.02);
}

/* 列表动画 */
.list-enter-active,
.list-leave-active {
  transition: all 0.4s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
