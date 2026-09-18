/**
 * 界面图标的唯一出口（2026-09-13 从 `public/icons/` 搬进来）。
 *
 * ---- 为什么走 import 不放 public ----
 *
 * `public/` 里的文件原样拷进产物、不带 hash、写错路径只会静默 404。
 * 走 import 之后打包器接管：文件名带 hash（可以放心长缓存）、小图自动内联，
 * 缺图也能被测试**查表**发现，不用读磁盘。
 *
 * ---- 为什么是一张表不是到处 import ----
 *
 * 大部分图是**按 id 取**的——物品 id、建筑 id + 等级、地貌名——路径在运行时
 * 才拼得出来，而 Vite 只认静态 import。`import.meta.glob` 在构建期把整个
 * 目录扫成一张「键 → URL」表，运行时查表。eager 只是把 URL 字符串打进 JS，
 * 图本身仍然是用到才下载。
 *
 * 只有一处、写死的图（比如日记本按钮）直接 `import x from "./items/journal.png"`
 * 更好：少一层查表，缺图时构建当场报错。
 *
 * ---- 键的形状 ----
 *
 * 键 = 相对本目录的路径去掉 `.png`，数据里只写键、不写 URL：
 *
 * | 键 | 谁在用 |
 * |---|---|
 * | `items/<itemId>` | 背包、商店、成就。**文件名必须等于物品 id** |
 * | `tools/<itemId>` | 农具（用户按类别分的第二个目录，2026-09-17）。取物品图标时 `items/` 找不到再找这里，文件名同样必须等于物品 id |
 * | `buildings/<buildingId>/<levelId>` | 建筑卡片、升级面板（见 `Buildings/index.ts` 的 `buildingIcon`） |
 * | `terrain/<地貌>` | 地块卡片（`Maps/base/territory.ts`） |
 * | `currency/gold` | 金币。它不是物品，所以不在 items 下 |
 *
 * Core 里的数据（成就图标）也写这种键——Core 不该知道打包器的存在，
 * 键是逻辑名，哪天换 CDN 只动这一个文件。
 */

const modules = import.meta.glob<string>("./**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

const ICONS: ReadonlyMap<string, string> = new Map(
  Object.entries(modules).map(([path, url]) => [
    path.replace(/^\.\//, "").replace(/\.png$/, ""),
    url,
  ]),
);

/** 按键取图。没有这张图就返回 undefined，由调用方退化（画名字 / 画 emoji） */
export function iconUrl(key: string | undefined): string | undefined {
  return key ? ICONS.get(key) : undefined;
}

/** 物品图标：`items/<itemId>`，找不到再找 `tools/<itemId>`（农具那一格） */
export function itemIconUrl(itemId: string): string | undefined {
  return ICONS.get(`items/${itemId}`) ?? ICONS.get(`tools/${itemId}`);
}

/** 目录里现有的全部键。给测试查缺图 / 孤儿图用 */
export function iconKeys(): string[] {
  return [...ICONS.keys()];
}
