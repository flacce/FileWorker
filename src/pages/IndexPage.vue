<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();
</script>

<template>
  <div class="dashboard grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
    <!-- 文件上传卡片 -->
    <div class="glass-card hover-card cursor-pointer group" @click="router.push('/file')">
      <div class="p-6 flex flex-col items-center text-center">
        <div class="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
          <div class="i-mdi-cloud-upload text-3xl text-blue-600"></div>
        </div>
        <h2 class="text-xl font-bold mb-2">文件传输</h2>
        <p class="text-gray-500 text-sm">安全、快速地上传文件到云端存储。</p>
      </div>
    </div>

    <!-- 剪贴板卡片 -->
    <div class="glass-card hover-card cursor-pointer group" @click="router.push('/clip')">
      <div class="p-6 flex flex-col items-center text-center">
        <div class="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
          <div class="i-mdi-clipboard-text text-3xl text-pink-600"></div>
        </div>
        <h2 class="text-xl font-bold mb-2">在线剪贴板</h2>
        <p class="text-gray-500 text-sm">临时保存文本代码，跨设备同步。</p>
      </div>
    </div>
    
    <!-- 文件管理入口 -->
    <div class="glass-card hover-card cursor-pointer group md:col-span-2" @click="router.push('/filemanage')">
      <div class="p-6 flex flex-row items-center justify-between">
        <div class="flex items-center gap-4">
           <div class="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center group-hover:rotate-12 transition-transform">
            <div class="i-mdi-folder-search text-2xl text-purple-600"></div>
          </div>
          <div class="text-left">
            <h2 class="text-lg font-bold">文件管理</h2>
            <p class="text-gray-500 text-sm">查看、下载或删除已上传的所有文件。</p>
          </div>
        </div>
        <div class="i-mdi-arrow-right text-2xl text-gray-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all"></div>
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
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.hover-card:hover {
  transform: translateY(-5px);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  border-color: rgba(255, 255, 255, 0.8);
}
</style>