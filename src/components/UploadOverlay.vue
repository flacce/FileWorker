<script setup lang="ts">
import { computed } from 'vue'
import { formatSpeed } from '@/utils/utils'
import type { UploadTask } from '@/types'

const props = defineProps<{
  dragActive: boolean
  tasks: UploadTask[]
}>()

const emit = defineEmits<{
  cancel: [id: string]
  clear: []
}>()

const activeTasks = computed(() =>
  props.tasks.filter((t) => t.status === 'uploading' || t.status === 'pending'),
)

const hasTasks = computed(() => props.tasks.length > 0)
</script>

<template>
  <!-- Global Drag-over Drop Overlay -->
  <Transition name="fade-in">
    <div
      v-if="dragActive"
      class="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-black/60 backdrop-blur-sm p-8 select-none"
    >
      <div class="w-full h-full border-2 border-dashed border-edge-orange/80 rounded-3xl flex flex-col items-center justify-center bg-edge-orange/5 gap-3 animate-pulse-subtle">
        <div class="w-16 h-16 rounded-2xl bg-edge-orange/20 border border-edge-orange/40 flex items-center justify-center text-edge-orange">
          <div class="i-mdi-cloud-upload-outline text-3xl"></div>
        </div>
        <p class="text-base font-bold text-white">释放文件以立即上传至 Cloudflare R2</p>
        <p class="text-xs text-zinc-400">支持任意文件类型与多文件并发传输</p>
      </div>
    </div>
  </Transition>

  <!-- Upload Tasks Floating Manager Dock -->
  <Transition name="fade-in">
    <div
      v-if="hasTasks"
      class="fixed bottom-4 right-4 z-40 w-72 rounded-xl bg-studio-surface border border-white/12 shadow-2xl overflow-hidden backdrop-blur-xl animate-fade-in select-none"
    >
      <!-- Header -->
      <div class="h-9 px-3 border-b border-white/8 bg-black/30 flex items-center justify-between text-xs">
        <div class="flex items-center gap-1.5 font-medium text-zinc-200">
          <div
            v-if="activeTasks.length"
            class="i-mdi-loading animate-spin text-edge-orange text-xs"
          ></div>
          <div v-else class="i-mdi-check text-emerald-400 text-xs"></div>
          <span>{{ activeTasks.length ? '正在上传…' : '全部上传完成' }}</span>
        </div>
        <button class="btn-ghost p-0.5 text-zinc-400 hover:text-white" title="清除记录" @click="emit('clear')">
          <div class="i-mdi-close text-xs"></div>
        </button>
      </div>

      <!-- Task List -->
      <div class="max-h-48 overflow-y-auto divide-y divide-white/6 p-1.5">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="p-1.5 flex flex-col gap-1 text-[11px]"
        >
          <div class="flex items-center justify-between text-zinc-300">
            <span class="truncate max-w-[150px] font-medium" :title="task.name">
              {{ task.name }}
            </span>
            <div class="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
              <span v-if="task.status === 'uploading'">{{ formatSpeed(task.speed) }}</span>
              <span v-else-if="task.status === 'success'" class="text-emerald-400">完成</span>
              <span v-else-if="task.status === 'error'" class="text-rose-400">失败</span>
              <span v-else-if="task.status === 'cancelled'" class="text-zinc-500">已取消</span>
              <button
                v-if="task.status === 'uploading'"
                class="text-zinc-500 hover:text-rose-400 ml-1"
                @click="emit('cancel', task.id)"
              >
                <div class="i-mdi-close-circle-outline text-xs"></div>
              </button>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="h-1 w-full bg-white/10 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-200"
              :class="
                task.status === 'error'
                  ? 'bg-rose-500'
                  : task.status === 'success'
                    ? 'bg-emerald-500'
                    : 'bg-edge-orange'
              "
              :style="{ width: `${task.progress}%` }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
