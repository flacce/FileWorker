<script setup lang="ts">
import { RouterView } from 'vue-router'
import NoticeHost from '@/modules/NoticeHost.vue'
</script>

<template>
  <div
    class="h-screen w-screen overflow-hidden bg-bento-canvas text-ink-primary font-sans select-none"
  >
    <RouterView />
    <NoticeHost />
  </div>
</template>
