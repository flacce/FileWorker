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
          if (id.includes('@codemirror/lang-')) {
            const lang = id.split('@codemirror/lang-')[1].split('/')[0]
            return `cm-lang-${lang}`
          }
          if (id.includes('@codemirror') || id.includes('codemirror')) {
            return 'codemirror-core'
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
