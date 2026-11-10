<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkspaceStore } from '@/store/workspace'
import { decodeKey, formatFileSize, formatRate } from '@/utils/format'

const store = useWorkspaceStore()
const collapsed = ref(false)

const hasFinished = computed(() =>
  store.transfers.some((t) => t.state === 'done' || t.state === 'failed' || t.state === 'aborted')
)

function stateText(state: string, msg?: string): string {
  if (state === 'queued') return '排队等候'
  if (state === 'done') return '传输完成'
  if (state === 'aborted') return msg || '已取消'
  if (state === 'failed') return msg || '传输失败'
  return '正在上传'
}
</script>

<template>
  <div
    v-if="store.transfers.length > 0"
    class="fixed right-3.5 bottom-3.5 z-40 w-[330px] max-w-[calc(100vw-28px)] bento-box shadow-2xl border-white/[0.1]"
  >
    <!-- 顶栏 -->
    <div
      class="flex items-center justify-between px-3 h-9 bg-bento-raised border-b border-white/[0.06]"
    >
      <div class="flex items-center gap-2 text-xs font-medium text-ink-primary">
        <span
          class="w-1.5 h-1.5 rounded-full"
          :class="store.activeTransferCount > 0 ? 'bg-accent animate-pulse' : 'bg-ink-muted'"
        />
        <span>
          传输队列
          <template v-if="store.activeTransferCount > 0">
            （进行中 {{ store.activeTransferCount }} / {{ store.transfers.length }}）
          </template>
          <template v-else>（共 {{ store.transfers.length }} 项已结束）</template>
        </span>
      </div>

      <div class="flex items-center gap-1">
        <button
          v-if="hasFinished"
          type="button"
          class="btn-quiet h-6 px-1.5 text-[11px]"
          title="清理已结束记录"
          @click="store.pruneFinishedTransfers()"
        >
          清空已完结
        </button>
        <button
          type="button"
          class="btn-icon w-6 h-6"
          :title="collapsed ? '展开队列' : '收起队列'"
          @click="collapsed = !collapsed"
        >
          <span :class="collapsed ? 'i-mdi-chevron-up' : 'i-mdi-chevron-down'" class="text-sm" />
        </button>
      </div>
    </div>

    <!-- 列表体 -->
    <div v-show="!collapsed" class="max-h-[240px] overflow-y-auto divide-y divide-white/[0.04]">
      <div
        v-for="task in store.transfers"
        :key="task.id"
        class="px-3 py-2.5 space-y-1.5 bg-bento-cell"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-ink-primary truncate font-medium" :title="decodeKey(task.key)">
            {{ decodeKey(task.key) }}
          </span>
          <button
            v-if="task.state === 'running' || task.state === 'queued'"
            type="button"
            class="btn-icon w-5 h-5 shrink-0 text-ink-muted hover:text-danger"
            title="中止此任务"
            @click="store.cancelTransfer(task.id)"
          >
            <span class="i-mdi-close text-xs" />
          </button>
          <span
            v-else
            class="text-[11px] shrink-0"
            :class="
              task.state === 'done'
                ? 'text-accent'
                : task.state === 'failed'
                  ? 'text-danger'
                  : 'text-ink-muted'
            "
          >
            {{ stateText(task.state, task.message) }}
          </span>
        </div>

        <div class="h-1 w-full rounded-tag bg-bento-raised overflow-hidden">
          <div
            class="h-full transition-all duration-150"
            :class="
              task.state === 'failed'
                ? 'bg-danger'
                : task.state === 'aborted'
                  ? 'bg-ink-muted'
                  : 'bg-accent'
            "
            :style="{ width: `${task.percent}%` }"
          />
        </div>

        <div class="flex items-center justify-between text-[11px] text-ink-muted font-mono">
          <span>{{ formatFileSize(task.loaded) }} / {{ formatFileSize(task.size) }}</span>
          <span v-if="task.state === 'running'">
            {{ formatRate(task.rateBytes) }} · {{ task.percent }}%
          </span>
          <span v-else>{{ task.percent }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>
