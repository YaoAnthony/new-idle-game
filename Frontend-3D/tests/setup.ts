import 'fake-indexeddb/auto'

/**
 * jsdom 缺的几样东西。都不是"为了让测试过"而伪造行为——是把浏览器里
 * **本来就有**的能力补齐，否则被测代码会在一个和它想验证的事毫无关系的
 * 地方炸掉。
 */

// jsdom 没有 IndexedDB，而存档仓库整个建在它上面（Data/IndexDB）。
// fake-indexeddb/auto 在上面那行装好全局实现，是真的 IDB 语义（含事务、
// 版本升级），不是一个 Map 假装的——这很重要，存档的备份/回退路径要靠
// 事务失败才走得到。

/**
 * jsdom 的 matchMedia 是空的。触摸模式判定（Game/State/touchMode）会问
 * `(pointer: coarse)`，默认给 false = 桌面。要测触摸分支的用例自己覆盖它。
 */
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
