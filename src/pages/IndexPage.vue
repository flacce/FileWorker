<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

// 跳转到剪贴板页面
const onClipAreaClick = () => {
  router.push("/clip");
};

// 跳转到文件上传页面
const onUploadClick = () => {
  router.push("/file");
};
</script>

<template>
  <div class="flex flex-col items-center">
    <div class="pannel file-pannel">
      <div class="text-2xl flex flex-row items-center">
        <router-link to="/filemanage" class="link-hint">文件</router-link>
      </div>
      <div class="upload-area" @click="onUploadClick"></div>
    </div>
    <div class="pannel clip-pannel">
      <div class="text-2xl flex flex-row items-center">
        <router-link to="/filemanage" class="link-hint">剪贴板</router-link>
      </div>
      <div class="clip-area" @click="onClipAreaClick"></div>
    </div>
  </div>
</template>

<style scoped>
.pannel {
  --uno: my-6 px-4 py-4 max-w-screen-md w-4/5 rounded shadow-md;
}

.file-pannel {
  background-color: #bee5eb;
}

.clip-pannel {
  background-color: #F27E93;
}

.tips-pannel {
  background-color: #d1e7dd;
}

.upload-area {
  --uno: border-dashed border-1 border-gray-400 h-30 mt-2 cursor-pointer;
  background: url(../assets/upload.svg) center center no-repeat;
  background-color: #f8f9fa;
}

.clip-area {
  display: block;
  width: 100%;
  --uno: border-dashed border-1 border-gray-400 h-30 mt-2 cursor-pointer;
  background: url(../assets/clipboard.svg) center center no-repeat;
  background-color: #f8f9fa;
}

.link-hint {
  text-decoration: underline;
  text-decoration-style: dashed;
  text-decoration-color: #a0aec0;
  text-underline-offset: 0.2em;
}

.link-hint:hover {
  text-decoration-color: black;
}

.locale-changer {
  border: grey 1px solid;
  border-radius: 6px;
  padding: 2px 4px;
}
</style>

<style>
html,
body,
#app {
  margin: 0;
  padding: 0;
  background-color: #f8f9fa;
}
</style>