import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const coreRoot = fileURLToPath(new URL('../Core/src', import.meta.url))

/**
 * 测试跑的是 `src/Game`（状态与系统）、`src/Data`（存档）和 `src/i18n`
 * 这三层——它们**不 import three.js**（分层纪律就是这么定的，见
 * Game/EventBus.ts 的文件头），所以能脱离渲染跑。
 *
 * 环境用 jsdom 而不是 node：这几层里有几处会摸 `window.matchMedia`、
 * `localStorage`、`document.visibilityState`。给它们各自打桩比整体换环境
 * 更啰嗦，而且哪天有人新引一个浏览器 API，node 环境下会炸在一个和
 * 被测行为毫无关系的地方。
 *
 * `core` 别名和 vite.config.ts 保持一致——**指向源码不是 dist**，
 * 于是改 Core 之后不用先 build 再跑测试。
 */
export default defineConfig({
  resolve: {
    alias: [{ find: /^core$/, replacement: `${coreRoot}/index.ts` }],
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // 状态层大量使用模块级单例，同文件内串行、跨文件各自独立的进程
    // 才不会互相污染（vitest 默认就是一文件一环境，这里写明是为了防改）
    isolate: true,
    restoreMocks: true,
  },
})
