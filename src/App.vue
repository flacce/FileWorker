<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="h-screen w-screen overflow-hidden bg-studio-bg text-zinc-100 font-sans">
    <RouterView v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </RouterView>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
