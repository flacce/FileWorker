<script setup lang="ts">
import { ref } from 'vue';
import Cookies from 'js-cookie'
import { toast } from '@/utils/toast';
import { useRouter } from 'vue-router';

const router = useRouter();

const password = ref('');

// 处理登录按钮点击
const onSubmitBtnClick = () => {
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
</script>

<template>
    <div class="cursor-default flex flex-col items-center">
        <div id="board" class="rounded-lg flex flex-col bg-gray-100 border-2 border-gray-200 my-5 mx-2 p-4 justify-center items-center dark:bg-dark-100 dark:border-dark-300 dark:text-gray-400">
            <h1 class="text-lg">Paste And File</h1>
            <input class="my-5 px-2 py-1 w-64 border-2 rounded" type="password" v-model="password"
                placeholder="请输入密码">
            <button id="submit-button" class="btn rounded cursor-pointer outline-none bg-green-500 text-white text-lg py-1 px-4 transition w-64 hover:bg-green-600" @click="onSubmitBtnClick">登录</button>
        </div>
    </div>
</template>

<style scoped>
/* 样式已迁移至 Template Class */
</style>