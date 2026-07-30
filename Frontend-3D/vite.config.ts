import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const coreRoot = fileURLToPath(new URL('../Core/src', import.meta.url))
const projectRoot = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^core$/, replacement: `${coreRoot}/index.ts` }],
  },
  server: {
    fs: {
      // Core 在项目目录之外，需要显式放行
      allow: [projectRoot, coreRoot],
    },
  },
})
