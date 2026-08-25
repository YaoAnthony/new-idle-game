// @ts-check
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 中文衬线子集（期 7 · 报纸）。
 *
 * **报纸"像不像"有一大半在中文衬线上。** 但整套思源宋体是 10 MB 以上，
 * 打进包里不合适；而系统衬线栈在 Windows 是宋体、macOS 是宋体 SC、
 * Linux 上可能什么都没有——观感差很远，打包之后用户机器上有什么不可控。
 *
 * 所以：**扫出游戏里真正会用到的字，只切那些**。
 *
 * ## 字体源文件不在仓库里
 *
 * 思源宋体是 OFL、可以随游戏分发，但**放不放、放哪个版本、要不要进
 * git（十几兆的二进制）是你的决定**，不是脚本该替你做的。所以这个脚本
 * 找不到源文件时**跳过并打一行说明**，构建照常继续——CSS 那边有系统
 * 衬线兜底，缺字体只是没那么像报纸，不是坏掉。
 *
 * 把 `SourceHanSerifSC-Regular.otf`（或 .ttf）放进 `assets/font/` 即可。
 *
 * ## 玩家自己打的字切不进来
 *
 * 报名、行动名（"写完 assignment2"）都是运行时输入的，`t.ts` 里没有。
 * 那几个字会退到系统衬线——所以 `index.css` 的 `font-family` 必须带
 * 兜底栈，否则一行里两种字看着像 bug。
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const source =
  [
    "assets/font/SourceHanSerifSC-Regular.otf",
    "assets/font/SourceHanSerifSC-Regular.ttf",
    "assets/font/NotoSerifSC-Regular.otf",
    "assets/font/NotoSerifSC-Regular.ttf",
  ]
    .map((rel) => resolve(root, rel))
    .find((path) => existsSync(path)) ?? null;

const outDir = resolve(root, "public/font");
const outFile = resolve(outDir, "serif-subset.woff2");

if (!source) {
  console.log(
    "[font] 没找到衬线源文件，跳过子集生成（报纸会退到系统衬线）。\n" +
      "       想要更像报纸：把思源宋体放到 Frontend-3D/assets/font/SourceHanSerifSC-Regular.otf",
  );
  process.exit(0);
}

/**
 * 扫 `t.ts` 里全部用到的字符。
 *
 * 连**键名**一起扫是有意的：调试指令会把 key 直接打出来（找不到文案时
 * `t()` 退化成回显 key），那些拉丁字母也得在子集里。
 */
const i18n = readFileSync(resolve(root, "src/i18n/t.ts"), "utf8");
const chars = new Set(i18n);
// 常用标点、数字、拉丁字母——玩家输入和数字排版都要
for (const c of "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  chars.add(c);
}
for (const c of "，。、；：？！“”‘’（）《》〈〉—…·【】「」　 .,:;!?()[]{}<>/\\|-_=+*&%#@~`'\"") {
  chars.add(c);
}

const unicodes = [...chars]
  .map((c) => c.codePointAt(0))
  .filter((cp) => cp !== undefined && cp > 31)
  .map((cp) => `U+${cp.toString(16).toUpperCase()}`)
  .join(",");

mkdirSync(outDir, { recursive: true });

try {
  execFileSync(
    "python",
    [
      "-m",
      "fontTools.subset",
      source,
      `--unicodes=${unicodes}`,
      "--flavor=woff2",
      `--output-file=${outFile}`,
      "--layout-features=",
      "--no-hinting",
      "--desubroutinize",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  console.log(`[font] 子集已生成：${outFile}（${chars.size} 个字符）`);
} catch (error) {
  /*
   * **切不出来不该让构建挂掉。** 缺 fontTools、源文件损坏、Python 不在
   * PATH——这些都是环境问题，而报纸有系统衬线兜底，退化的是观感不是功能。
   */
  console.warn(
    "[font] 子集生成失败，报纸会退到系统衬线。原因：",
    error instanceof Error ? error.message.split("\n")[0] : String(error),
  );
}
