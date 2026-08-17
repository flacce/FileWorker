<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login } from '@/api'
import { toast } from '@/utils/toast'

const password = ref('')
const loading = ref(false)
const showPassword = ref(false)
const isError = ref(false)
const router = useRouter()
const route = useRoute()

const onLogin = async () => {
  if (!password.value.trim()) {
    toast('请输入访问密码', 'error')
    triggerShake()
    return
  }

  loading.value = true
  try {
    const ok = await login(password.value)
    if (!ok) {
      toast('访问密码错误', 'error')
      triggerShake()
      return
    }

    toast('验证通过', 'success')
    const redirect =
      typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect || '/')
  } finally {
    loading.value = false
  }
}

const triggerShake = () => {
  isError.value = true
  setTimeout(() => {
    isError.value = false
  }, 500)
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') void onLogin()
}
</script>

<template>
  <div class="h-screen w-screen flex items-center justify-center bg-studio-bg select-none p-4 relative overflow-hidden">
    <!-- Subtle Background Glow -->
    <div class="absolute w-96 h-96 rounded-full bg-edge-orange/5 blur-3xl pointer-events-none"></div>

    <!-- Login Card -->
    <div
      class="w-full max-w-sm rounded-2xl bg-studio-surface border border-white/10 p-6 sm:p-8 shadow-2xl relative z-10 animate-fade-in"
      :class="{ 'shake-anim': isError }"
    >
      <!-- Brand & Icon -->
      <div class="flex flex-col items-center text-center mb-6">
        <div class="w-12 h-12 rounded-xl bg-edge-orange/15 border border-edge-orange/30 flex items-center justify-center text-edge-orange mb-3 shadow-inner">
          <div class="i-mdi-cloud-lock-outline text-2xl"></div>
        </div>
        <h1 class="text-base font-bold text-white tracking-tight">文件云工作台</h1>
        <p class="text-xs text-zinc-500 mt-1">输入访问密码以进入存储与剪贴板控制台</p>
      </div>

      <!-- Input Form -->
      <div class="space-y-3">
        <div class="relative">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            class="input-clean pr-8 py-2 text-xs font-mono tracking-wider h-9"
            placeholder="输入访问密码…"
            autofocus
            :disabled="loading"
            @keydown="onKeydown"
          />
          <button
            type="button"
            class="absolute inset-y-0 right-2 flex items-center text-zinc-500 hover:text-white"
            tabindex="-1"
            @click="showPassword = !showPassword"
          >
            <div :class="showPassword ? 'i-mdi-eye-off-outline' : 'i-mdi-eye-outline'" class="text-sm"></div>
          </button>
        </div>

        <button
          class="btn-primary w-full h-9 text-xs font-semibold"
          :disabled="loading"
          @click="onLogin"
        >
          <div v-if="loading" class="i-mdi-loading animate-spin text-xs"></div>
          <span>{{ loading ? '正在验证…' : '进入工作台' }}</span>
        </button>
      </div>

      <div class="mt-6 text-center">
        <span class="font-mono text-[10px] text-zinc-600">基于 Cloudflare 边缘计算与 R2 存储</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shake-anim {
  animation: shake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}
</style>
