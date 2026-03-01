import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
    proxy: {
      // 用户服务 → 9003
      '/api/user': {
        target: 'http://localhost:9003',
        changeOrigin: true,
      },
      // 帖子 + 目录服务 → 9005
      '/api/post': {
        target: 'http://localhost:9005',
        changeOrigin: true,
      },
      '/api/catalogue': {
        target: 'http://localhost:9005',
        changeOrigin: true,
      },
      // AI 服务 → 9001
      '/api/ai': {
        target: 'http://localhost:9001',
        changeOrigin: true,
      },
    },
  },
})
