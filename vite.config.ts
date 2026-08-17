import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  plugins: [vue(), UnoCSS()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    cssMinify: 'esbuild',
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('@codemirror') || id.includes('codemirror')) {
            return 'codemirror-bundle'
          }
          if (id.includes('marked')) {
            return 'marked-bundle'
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  },
})
