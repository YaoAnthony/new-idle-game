/**
 * 拍观察台页面（preview-ui.html）在动画各个时刻的样子。
 *
 * 和 shoot-ui.mjs 的分工：那个拍**真游戏**，这个拍**还没接进游戏的样品**。
 * 做形式选型时不该先把方案接进去——选完要拆。
 *
 * 按毫秒切片而不是等动画结束：整段是 idle→entry→spin→expand，
 * 只拍终态的话，"印章转半圈"那一段永远看不到，而那正是要评的部分。
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.env.SHOT_DIR || join(process.cwd(), "shots");
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=swiftshader"] });
const page = await browser.newPage({
  viewport: { width: 667, height: 375 },
  deviceScaleFactor: 2,
  /*
   * **必须显式关掉**：headless Chromium 默认报告
   * `prefers-reduced-motion: reduce`，于是所有尊重无障碍设置的动画都被
   * 跳过——拍出来永远是终态，"印章转半圈"那段一帧也看不到，
   * 而那正是要评的部分。第一次拍就栽在这儿。
   */
  reducedMotion: "no-preference",
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => m.type() === "error" && console.log("[console]", m.text()));

await page.goto("http://localhost:5174/preview-ui.html", { waitUntil: "networkidle" });

// 时间原点 = 我们主动调用打开的那一刻（相位：entry 130ms → spin 330ms → expand）
await page.evaluate(() => window.__openModal?.());
const marks = [
  [70, "1-entry"],
  [260, "2-spin"],
  [520, "3-expand-start"],
  [760, "4-expand-mid"],
  [1600, "5-settled"],
];
let last = 0;
for (const [at, name] of marks) {
  await page.waitForTimeout(at - last);
  last = at;
  await page.screenshot({ path: join(OUT, `modal-${name}.png`) });
  console.log("shot modal-" + name);
}
await browser.close();
