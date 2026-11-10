<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { probeSession, submitPasscode } from '@/api'
import { notify } from '@/composables/useNotice'

const router = useRouter()
const route = useRoute()

const passcode = ref('')
const reveal = ref(false)
const submitting = ref(false)
const checkingOpenMode = ref(true)
const errorHint = ref('')

function resolveTargetRoute(): string {
  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect.startsWith('/') && redirect !== '/login') {
    return redirect
  }
  return '/'
}

async function tryAutoUnlock() {
  checkingOpenMode.value = true
  try {
    const valid = await probeSession()
    if (valid) {
      document.cookie = '__auth=1; Path=/; SameSite=Lax; Max-Age=31536000'
      await router.replace(resolveTargetRoute())
    }
  } finally {
    checkingOpenMode.value = false
  }
}

async function handleUnlock() {
  errorHint.value = ''
  if (!passcode.value.trim()) {
    errorHint.value = '请输入访问口令后再试'
    return
  }

  submitting.value = true
  try {
    const res = await submitPasscode(passcode.value)
    if (res.ok) {
      notify('门禁验证通过，欢迎回到工作台', 'ok')
      await router.replace(resolveTargetRoute())
    } else {
      errorHint.value = res.error || '访问口令不匹配，请核对后重试'
    }
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  void tryAutoUnlock()
})
</script>

<template>
  <div class="w-full h-full flex items-center justify-center p-4 bg-bento-canvas">
    <div class="w-full max-w-[620px] grid grid-cols-1 md:grid-cols-12 gap-2.5">
      <!-- 主验证便当盒 -->
      <section class="bento-box md:col-span-7 p-6 justify-between min-h-[300px]">
        <div>
          <div class="flex items-center gap-2.5 mb-5">
            <div
              class="w-6 h-6 grid grid-cols-2 gap-0.5 p-0.5 rounded-tag bg-bento-raised border border-white/[0.08]"
            >
              <span class="rounded-[1.5px] bg-accent" />
              <span class="rounded-[1.5px] bg-white/25" />
              <span class="rounded-[1.5px] bg-white/20" />
              <span class="rounded-[1.5px] bg-white/10" />
            </div>
            <span class="text-sm font-semibold tracking-tight text-ink-primary">云端文件匣</span>
            <span class="tag-neutral ml-auto">受控门禁</span>
          </div>

          <h1 class="text-lg font-semibold text-ink-primary tracking-tight m-0">
            身份验证与工作台解锁
          </h1>
          <p class="text-xs text-ink-secondary mt-1.5 leading-relaxed">
            当前存储实例已启用访问保护，验证口令后即可管理云端对象、签发限时直链与同步云剪贴板。
          </p>
        </div>

        <form class="mt-6 space-y-3" @submit.prevent="handleUnlock">
          <div>
            <label class="block text-[11px] text-ink-secondary mb-1.5">访问口令</label>
            <div class="relative flex items-center">
              <input
                v-model="passcode"
                :type="reveal ? 'text' : 'password'"
                autofocus
                autocomplete="current-password"
                placeholder="在此键入预设门禁口令…"
                class="ctrl-input h-9 pr-9 text-xs"
                @input="errorHint = ''"
              />
              <button
                type="button"
                class="btn-icon absolute right-1 w-7 h-7"
                :title="reveal ? '隐藏口令' : '显示口令'"
                @click="reveal = !reveal"
              >
                <span
                  :class="reveal ? 'i-mdi-eye-off-outline' : 'i-mdi-eye-outline'"
                  class="text-sm"
                />
              </button>
            </div>
            <p v-if="errorHint" class="text-[11px] text-danger mt-1.5 m-0">
              {{ errorHint }}
            </p>
          </div>

          <button
            type="submit"
            class="btn-accent w-full h-9 font-medium"
            :disabled="submitting || checkingOpenMode"
          >
            <span
              v-if="submitting || checkingOpenMode"
              class="i-mdi-loading animate-spin text-sm"
            />
            <span>{{
              checkingOpenMode
                ? '正在检测节点状态…'
                : submitting
                  ? '正在核验口令…'
                  : '解锁进入工作台'
            }}</span>
          </button>
        </form>
      </section>

      <!-- 右翼上下双便当盒 -->
      <div class="md:col-span-5 flex flex-col gap-2.5">
        <section class="bento-box p-5 flex-1 justify-between">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-ink-primary">核心架构特性</span>
            <span class="i-mdi-cube-scan text-ink-muted text-base" />
          </div>
          <ul class="list-none p-0 m-0 space-y-2.5 text-xs text-ink-secondary mt-3">
            <li class="flex items-center gap-2">
              <span class="w-1 h-1 rounded-full bg-accent shrink-0" />
              <span>预签名直传与流式分片回退</span>
            </li>
            <li class="flex items-center gap-2">
              <span class="w-1 h-1 rounded-full bg-ink-muted shrink-0" />
              <span>公开直链与私密限时签名分发</span>
            </li>
            <li class="flex items-center gap-2">
              <span class="w-1 h-1 rounded-full bg-ink-muted shrink-0" />
              <span>在线文本代码编辑与云剪贴板</span>
            </li>
          </ul>
        </section>

        <section class="bento-box p-4 dot-matrix-bg justify-between min-h-[96px]">
          <div class="flex items-center justify-between text-[11px] text-ink-secondary">
            <span>边缘存储网关</span>
            <span class="inline-flex items-center gap-1.5 text-accent">
              <span class="w-1.5 h-1.5 rounded-full bg-accent" />
              <span>在线就绪</span>
            </span>
          </div>
          <div class="text-[11px] text-ink-muted leading-normal mt-2">
            会话凭据采用安全签名校验，关闭页面后依然保持长效授权。
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
