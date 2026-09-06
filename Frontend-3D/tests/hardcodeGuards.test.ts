import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

/**
 * 居民系统 15 · 硬编码守卫。四条 grep 变成用例，红了就是 bug：
 * 1. 基类不认识身份（residentAgent 里没有 CreatureRole.Worker / Merchant / Resident）；
 * 2. 技能和子类不直接改位置 / 寻路（那是身体的事）；
 * 3. gameplay 代码里没有居民 id 分支（三位的 id 只许出现在数据和用例里）；
 * 4. 随机只在动画级抖动（技能里只许经 skills/jitter.ts，Systems/residents 里一处都不许——内容抽签走 hashSeed）。
 * 注释行不算：守的是逻辑，不是文档。
 */
const GAME = join(__dirname, "../src/Game");

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function offenders(paths: string[], pattern: RegExp, allow: (relPath: string) => boolean = () => false): string[] {
  const hits: string[] = [];
  for (const path of paths) {
    const rel = relative(GAME, path).replace(/\\/g, "/");
    if (allow(rel)) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      if (pattern.test(line)) hits.push(`${rel}:${index + 1}: ${trimmed.slice(0, 100)}`);
    });
  }
  return hits;
}

test("守卫1_基类不认识身份", () => {
  expect(offenders([join(GAME, "State/residentAgent.ts")], /CreatureRole\.(Worker|Merchant|Resident)\b/)).toEqual([]);
});

test("守卫2_技能和子类不直接改位置或寻路", () => {
  const paths = [...files(join(GAME, "State/skills")), ...files(join(GAME, "State/residents"))];
  expect(offenders(paths, /startPathTo|this\.x = |this\.z = /)).toEqual([]);
});

test("守卫3_gameplay代码里没有居民id分支", () => {
  // 唯一允许的是子类注册表（definitionId → 子类）：那是数据到代码的接口，不是分支
  expect(offenders(files(GAME), /slime_neighbor|fox_neighbor|spirit_neighbor/, (rel) => rel === "State/residents/index.ts")).toEqual([]);
});

test("守卫4_随机只在动画级抖动", () => {
  const paths = [...files(join(GAME, "State/skills")), ...files(join(GAME, "Systems/residents"))];
  expect(offenders(paths, /Math\.random/, (rel) => rel === "State/skills/jitter.ts")).toEqual([]);
});
