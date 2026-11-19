<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { clearExplicitLogout, hasExplicitLogout, probeSession, submitPasscode } from '@/api'
import { notify } from '@/composables/useNotice'

const router = useRouter()
const route = useRoute()

const passcode = ref('')
const reveal = ref(false)
const submitting = ref(false)
const checkingOpenMode = ref(true)
const errorHint = ref('')
const invalidPasscode = ref(false)

function clearError() {
  errorHint.value = ''
  invalidPasscode.value = false
}

function isExplicitLogout(): boolean {
  return route.query.logout === '1' || hasExplicitLogout()
}

function resolveTargetRoute(): string {
  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect.startsWith('/') && redirect !== '/login') {
    return redirect
  }
  return '/'
}

async function tryAutoUnlock() {
  if (isExplicitLogout()) {
    checkingOpenMode.value = false
    return
  }
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
  if (submitting.value || checkingOpenMode.value) return
  clearError()
  if (!passcode.value.trim() && !isExplicitLogout()) {
    invalidPasscode.value = true
    errorHint.value = '请输入访问口令。'
    return
  }

  submitting.value = true
  try {
    const res = await submitPasscode(passcode.value)
    if (res.ok) {
      clearExplicitLogout()
      notify('欢迎回来，喵！', 'ok')
      await router.replace(resolveTargetRoute())
    } else if (res.status === 400) {
      errorHint.value = '请输入访问口令。'
    } else if (res.status === 401) {
      invalidPasscode.value = true
      errorHint.value = '口令不正确，请重新输入。'
    } else {
      errorHint.value = '暂时连不上，请稍后再试。'
    }
  } catch {
    errorHint.value = '暂时连不上，请稍后再试。'
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  void tryAutoUnlock()
})
</script>

<template>
  <main class="auth-page">
    <section class="auth-panel" aria-labelledby="auth-title">
      <header class="brand">
        <svg class="brand-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path
            d="M9 19 12 7l10 8h4l10-8 3 12v15a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4z"
            fill="currentColor"
            fill-opacity=".18"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <path
            d="M17 25h5l2 2h7v7H17z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
          <circle cx="18" cy="20" r="1" fill="currentColor" />
          <circle cx="30" cy="20" r="1" fill="currentColor" />
        </svg>
        <h1 id="auth-title">喵喵文件匣</h1>
      </header>

      <form class="auth-form" @submit.prevent="handleUnlock">
        <label for="passcode">访问口令</label>
        <div class="input-wrap">
          <input
            id="passcode"
            v-model="passcode"
            :type="reveal ? 'text' : 'password'"
            autocomplete="current-password"
            :aria-invalid="invalidPasscode"
            :aria-describedby="errorHint ? 'auth-error' : undefined"
            :readonly="submitting || checkingOpenMode"
            @input="clearError"
          />
          <button
            type="button"
            class="visibility-button"
            :title="reveal ? '隐藏口令' : '显示口令'"
            :aria-label="reveal ? '隐藏口令' : '显示口令'"
            @click="reveal = !reveal"
          >
            <span
              :class="reveal ? 'i-mdi-eye-off-outline' : 'i-mdi-eye-outline'"
              aria-hidden="true"
            />
          </button>
        </div>
        <p v-if="errorHint" id="auth-error" class="error-message" role="alert">
          {{ errorHint }}
        </p>
        <button type="submit" class="submit-button" :disabled="submitting || checkingOpenMode">
          <span aria-live="polite">{{
            checkingOpenMode ? '正在检查会话…' : submitting ? '正在验证口令…' : '解锁'
          }}</span>
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
  padding: 24px;
  color: var(--ink-primary);
  background: var(--bento-canvas);
}

.auth-panel {
  box-sizing: border-box;
  min-width: 0;
  width: min(100%, 400px);
  flex: none;
  margin: auto;
  padding: clamp(20px, 5vw, 32px);
  border: 1px solid var(--bento-line);
  border-radius: 8px;
  background: var(--bento-cell);
}

.brand-mark {
  width: 32px;
  height: 32px;
  flex: none;
  color: var(--accent);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
h1 {
  margin: 0;
  font-size: 21px;
  line-height: 1.25;
  font-weight: 650;
}
.auth-form {
  margin-top: 22px;
}
.auth-form label {
  display: block;
  margin-bottom: 8px;
  color: var(--ink-secondary);
  font-size: 12px;
}
.input-wrap {
  position: relative;
}
.input-wrap input {
  box-sizing: border-box;
  width: 100%;
  height: 46px;
  padding: 0 52px 0 13px;
  border: 1px solid var(--ink-muted);
  border-radius: 5px;
  outline: none;
  background: var(--bento-raised);
  color: var(--ink-primary);
  font: inherit;
  font-size: 16px;
}

.input-wrap input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.visibility-button {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--ink-secondary);
  cursor: pointer;
}
.visibility-button:hover {
  color: var(--accent);
}
.visibility-button:focus-visible,
.submit-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.error-message {
  margin: 8px 0 0;
  color: var(--ink-primary);
  font-size: 14px;
}
.submit-button {
  width: 100%;
  height: 44px;
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 0;
  border-radius: 5px;
  background: var(--accent);
  color: var(--bento-cell);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.submit-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 85%, white);
}
.submit-button:disabled {
  cursor: wait;
  opacity: 0.72;
}

@media (max-width: 420px) {
  .auth-page {
    padding: 16px;
  }
}
</style>
