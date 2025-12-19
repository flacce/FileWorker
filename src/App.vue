<script setup lang="ts">
</script>

<template>
  <div class="main-layout flex flex-col min-h-screen">
    <!-- 顶部导航栏 -->
    <header class="glass-header sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-2 cursor-pointer" @click="$router.push('/')">
        <div class="i-mdi-file-cloud text-2xl text-blue-500"></div>
        <h1 class="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
          PasteWork
        </h1>
      </div>
      
      <nav class="flex gap-4">
        <router-link to="/filemanage" class="nav-item">
          <div class="i-mdi-folder-open text-lg"></div>
          <span class="hidden sm:block">文件</span>
        </router-link>
        <router-link to="/clip" class="nav-item">
          <div class="i-mdi-clipboard-text text-lg"></div>
          <span class="hidden sm:block">剪贴板</span>
        </router-link>
      </nav>
    </header>

    <!-- 主题内容区 -->
    <main class="flex-grow container mx-auto px-4 py-8">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 页脚 -->
    <footer class="glass-footer py-4 text-center text-sm text-gray-500">
      <p>&copy; {{ new Date().getFullYear() }} PasteWork. All rights reserved.</p>
    </footer>
  </div>
</template>

<style>
/* 全局背景 */
body {
  margin: 0;
  background: linear-gradient(135deg, #e0eaee 0%, #f0f4f8 100%);
  color: #374151;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

.dark body {
  background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
  color: #f3f4f6;
}

/* Glassmorphism Classes */
.glass-header {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.glass-footer {
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(8px);
}

.nav-item {
  @apply flex items-center gap-1 px-3 py-2 rounded-lg transition-all duration-300 text-gray-600 hover:text-blue-600 hover:bg-blue-50;
}

.nav-item.router-link-active {
  @apply text-blue-600 bg-blue-50 font-medium;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
