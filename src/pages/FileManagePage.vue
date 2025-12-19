<script setup lang="ts">
import { onBeforeMount, ref, type Ref } from 'vue';
import { formatBytes } from '@/utils/utils';
import { DeleteFile, ListFiles } from '@/api';
import type { _Object } from '@aws-sdk/client-s3';

// 上传的文件列表
const uploadedFiles: Ref<_Object[]> = ref([]);
const loading = ref(true);

// 解码文件名
function decodeKey(key: string) {
    return decodeURIComponent(key)
}

// 刷新文件列表
const refreshFiles = async () => {
    loading.value = true;
    try {
        const res = await ListFiles();
        if (res && 'Contents' in res && res.Contents) {
            uploadedFiles.value = res.Contents;
        } else {
            uploadedFiles.value = [];
        }
    } catch (error) {
        console.error("刷新文件列表失败:", error);
        uploadedFiles.value = [];
    } finally {
        loading.value = false;
    }
};

onBeforeMount(async () => {
    await refreshFiles();
});

// 删除文件
const onDeleteFileClick = async (key?: string) => {
    if (!key) {
        return;
    }
    if (!confirm(`确定要删除文件 "${key}" 吗？`)) {
        return;
    }
    
    // Optimistic UI update could be added here, but for safety we await
    try {
      await DeleteFile(key);
      await refreshFiles();
    } catch (e) {
      alert("删除失败");
    }
};
</script>

<template>
    <div class="flex flex-col items-center justify-center pt-6">
        <div class="w-full max-w-4xl space-y-6">
            
            <!-- 头部 -->
            <div class="glass-header flex items-center justify-between px-6 py-4 rounded-2xl">
                <h1 class="text-xl font-bold flex items-center gap-2">
                    <div class="i-mdi-folder-home-outline text-purple-600"></div>
                    文件管理
                </h1>
                <button 
                  @click="refreshFiles" 
                  class="p-2 rounded-lg hover:bg-white/50 text-gray-600 transition-colors"
                  :class="{'animate-spin': loading}"
                >
                    <div class="i-mdi-refresh w-5 h-5"></div>
                </button>
            </div>

            <!-- 文件列表 -->
            <div class="space-y-3">
                <div v-if="loading && uploadedFiles.length === 0" class="flex justify-center py-10">
                    <div class="w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                </div>

                <div v-else-if="uploadedFiles.length === 0" class="text-center py-10 text-gray-400">
                    <div class="i-mdi-folder-open-outline text-5xl mb-2 mx-auto opacity-50"></div>
                    <p>暂无文件</p>
                </div>

                <transition-group name="list" tag="div" class="space-y-3">
                    <div v-for="file in uploadedFiles" :key="file.Key"
                        class="glass-item group flex items-center p-4">
                        
                        <!-- Icon -->
                        <div class="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center mr-4 group-hover:scale-110 transition-transform flex-shrink-0">
                            <div class="i-mdi-file-document-outline text-purple-600 text-xl"></div>
                        </div>
                        
                        <!-- Info -->
                        <div class="flex-grow min-w-0 mr-4">
                            <a class="block text-lg font-semibold text-gray-700 truncate hover:text-purple-600 transition-colors title-link" 
                               :href="`/${file.Key}`" 
                               target="_blank"
                               :title="decodeKey(file.Key!)">
                               {{ decodeKey(file.Key!) }}
                            </a>
                            <div class="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                                <span>{{ formatBytes(file.Size ?? 0) }}</span>
                                <span class="w-1 h-1 rounded-full bg-gray-300"></span>
                                <span>{{ file.LastModified ? new Date(file.LastModified).toLocaleString() : '' }}</span>
                            </div>
                        </div>

                        <!-- Actions -->
                        <button 
                            class="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            @click="onDeleteFileClick(file.Key)"
                            title="删除文件"
                        >
                            <div class="i-mdi-trash-can-outline w-5 h-5"></div>
                        </button>
                    </div>
                </transition-group>
            </div>
        </div>
    </div>
</template>

<style scoped>
.glass-header {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.glass-item {
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 1rem;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.glass-item:hover {
  background: rgba(255, 255, 255, 0.8);
  transform: translateX(4px);
  border-color: rgba(147, 51, 234, 0.3); /* purple-500/30 */
  box-shadow: 0 4px 12px rgba(147, 51, 234, 0.1);
}

/* 列表动画 */
.list-move, /* 对移动中的元素应用的过渡 */
.list-enter-active,
.list-leave-active {
  transition: all 0.4s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* 确保离开的元素脱离文档流，以便其他元素移动 */
.list-leave-active {
  position: absolute;
  width: 100%;
}
</style>
