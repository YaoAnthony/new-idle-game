import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = new URL('..', import.meta.url).pathname

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // if we need deploy to github pages, we need to set base to '/xxxx/'
  build: {
    rollupOptions: {
      output: {},
    },
  },
  server: {
    port: 7777,
    allowedHosts: ['a.h.g191919.com'],
    fs: {
      allow: [repoRoot],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7778',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/socket.io': {
        target: 'http://127.0.0.1:7778',
        changeOrigin: true,
        ws: true,
      },
      '/datasets': {
        target: 'http://127.0.0.1:7778',
        changeOrigin: true,
      },
    },
  },
})
