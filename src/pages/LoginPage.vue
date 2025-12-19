<script setup lang="ts">
import { ref } from 'vue';
import Cookies from 'js-cookie'
import { toast } from '@/utils/toast';
import { useRouter } from 'vue-router';

const router = useRouter();

const password = ref('');

// 处理登录按钮点击
const onSubmitBtnClick = () => {
    if (!password.value) {
        toast("请输入密码", 'error');
        return;
    }
    // 设置密码 Cookie
    Cookies.set('PASSWORD', password.value);
    toast("密码设置成功", 'success');
    
    // 延迟跳转
    setTimeout(() => {
        if (window.history.state.back) {
            router.back();
        } else {
            router.replace({ path: '/' })
        }
    }, 1000);
}

// 回车登录
const onKeyup = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
        onSubmitBtnClick();
    }
}
</script>

<template>
    <div class="flex flex-col items-center justify-center min-h-[60vh]">
        <div class="glass-card w-full max-w-md p-8 shadow-2xl transform transition-all hover:scale-[1.01]">
            <div class="flex flex-col items-center mb-8">
                <div class="w-20 h-20 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg mb-4">
                    <div class="i-mdi-shield-lock-outline text-4xl text-white"></div>
                </div>
                <h1 class="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    访问验证
                </h1>
                <p class="text-gray-500 text-sm mt-2">此页面受密码保护，请输入访问密码</p>
            </div>

            <div class="space-y-6">
                <div class="relative">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <div class="i-mdi-lock-outline text-gray-400 text-lg"></div>
                    </div>
                    <input 
                        class="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-gray-700 placeholder-gray-400" 
                        type="password" 
                        v-model="password"
                        @keyup="onKeyup"
                        placeholder="请输入密码"
                        autofocus
                    >
                </div>

                <button 
                    class="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-2" 
                    @click="onSubmitBtnClick"
                >
                    <span>解锁访问</span>
                    <div class="i-mdi-arrow-right"></div>
                </button>
            </div>
            
            <div class="mt-8 text-center text-xs text-gray-400">
                <p>PasteWork &copy; {{ new Date().getFullYear() }} Safe Storage</p>
            </div>
        </div>
    </div>
</template>

<style scoped>
.glass-card {
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 1.5rem;
}
</style>