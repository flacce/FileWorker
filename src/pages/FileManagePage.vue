<script setup lang="ts">
import { onBeforeMount, ref, type Ref } from 'vue';
import { formatBytes } from '@/utils/utils';
import { DeleteFile, ListFiles } from '@/api';
import type { _Object } from '@aws-sdk/client-s3';

// 上传的文件列表
const uploadedFiles: Ref<_Object[]> = ref([]);

// 解码文件名
function decodeKey(key: string) {
    return decodeURIComponent(key)
}

// 刷新文件列表
const refreshFiles = async () => {
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
    await DeleteFile(key);
    await refreshFiles();
};
</script>

<template>
    <div class="flex flex-col items-center mt-5">
        <h1 class="text-lg">文件管理</h1>
        <div class="px-4 py-4 max-w-screen-md w-4/5">
            <div v-for="file in uploadedFiles" :key="file.Key"
                class="w-full flex flex-row items-center mt-4 rounded border-1 border-gray-300 px-2 py-1">
                <div class="w-10 h-10 i-mdi-file-document-outline"></div>
                <div class="flex flex-col title">
                    <a class="text-lg font-semibold" :title="decodeKey(file.Key!)" :href="`/${file.Key}`" target="_blank">{{ decodeKey(file.Key!) }}</a>
                    <div class="text-sm text-gray">{{ formatBytes(file.Size ?? 0) }}</div>
                </div>
                <div class="ml-auto w-6 h-6 i-mdi-trash-can-outline cursor-pointer"
                    @click="onDeleteFileClick(file.Key)"></div>
            </div>
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
.title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
