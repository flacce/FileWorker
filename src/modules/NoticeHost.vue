<script setup lang="ts">
import { useNoticeStore } from '@/composables/useNotice'

const { queue, dismissNotice } = useNoticeStore()
</script>

<template>
  <div
    class="fixed top-3.5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1.5 pointer-events-none"
  >
    <TransitionGroup name="notice-slide">
      <div
        v-for="item in queue"
        :key="item.id"
        class="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-ctrl bg-[#12151a]/95 border text-xs shadow-lg cursor-pointer"
        :class="[
          item.tone === 'ok'
            ? 'border-accent-line text-ink-primary'
            : item.tone === 'warn'
              ? 'border-danger-line text-danger'
              : 'border-white/[0.09] text-ink-primary'
        ]"
        @click="dismissNotice(item.id)"
      >
        <span
          class="w-1.5 h-1.5 rounded-full shrink-0"
          :class="[
            item.tone === 'ok'
              ? 'bg-accent'
              : item.tone === 'warn'
                ? 'bg-danger'
                : 'bg-ink-secondary'
          ]"
        />
        <span>{{ item.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notice-slide-enter-active,
.notice-slide-leave-active {
  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}
.notice-slide-enter-from,
.notice-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
