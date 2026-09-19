import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Windows 精简包：**去掉音乐，留下音效**。
 *
 * 完整包 800 MB ~ 1.5 GB，其中 public/music 一家就占 530 MB（原声带）。
 * 音效（public/audio，53 MB）是另一回事——脚步、开关门、雨声都靠它，
 * 没了游戏就哑了，所以精简的只是曲库。
 *
 * 三件事得一起做，少一件就是坏的：
 * 1. `NO_MUSIC=1` 让曲库注册表生成成空的——注册表是**编译进产物**的，
 *    只删文件不删注册表，留声机里照样列着曲名、点下去每首 404；
 * 2. 删掉 dist/music——vite 会把整个 public 原样拷进 dist，不删等于白忙；
 * 3. 打完把注册表**还原**——它是提交进仓库的文件，不能让一次打包把它留空。
 *    还原不用备份：重跑一遍生成脚本，它本来就是从 public/music 推出来的。
 *
 * 第 3 步放在 finally 里：中途失败也要还原，否则下一次正常构建会莫名其妙没音乐。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: frontendRoot,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} 退出码 ${result.status}`);
}

try {
  run("npm", ["run", "build"], { NO_MUSIC: "1" });

  const musicDir = path.join(frontendRoot, "dist", "music");
  fs.rmSync(musicDir, { recursive: true, force: true });

  run("npx", [
    "electron-builder",
    "--win",
    "zip",
    "--x64",
    // 另起一个文件名，别把完整包那个 zip 覆盖掉
    "-c.artifactName=${productName}-${version}-win-nomusic.${ext}",
  ]);
} finally {
  run("node", ["scripts/generate-music-registry.mjs"]);
}
