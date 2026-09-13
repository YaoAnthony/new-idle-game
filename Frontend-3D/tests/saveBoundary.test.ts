import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * **读档边界**：`hydrateGameSave` 只能在 `src/Data/Save/` 里被调。
 *
 * 外面一律走 `Data/Save/runtime` 的三条入口（loadSaveIntoRuntime /
 * enterWorldSnapshot / exitWorldSnapshot）。理由是审计 2026-09-13 抓到的
 * 那条路：云冲突框选"用云端"直接 `hydrateGameSave(cloudSave)`，没过迁移，
 * 一份旧形状的档就这么灌进运行时、再被 `setBaseline` 当成基线写死。
 * 入口只有一个，迁移就没法绕过。
 *
 * 写法照 `tests/netBoundary.test.ts`：去注释再扫、路径归一化成 `/`。
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const files = walk(SRC).map((full) => ({
  path: relative(SRC, full).split(sep).join("/"),
  code: stripComments(readFileSync(full, "utf8")),
}));

const outsideSave = files.filter((f) => !f.path.startsWith("Data/Save/"));

test("test_save_boundary_scan_sees_a_sane_number_of_files", () => {
  expect(files.length).toBeGreaterThan(150);
  expect(outsideSave.length).toBeGreaterThan(100);
});

describe("src/Data/Save/ 之外不许直接灌存档", () => {
  test("test_save_boundary_hydrate_game_save_stays_inside_data_save", () => {
    const offenders = outsideSave
      .filter((f) => /\bhydrateGameSave\b/.test(f.code))
      .map((f) => f.path);
    expect(offenders, "hydrateGameSave 只能在 Data/Save 里调；外面走 runtime.ts 的入口").toEqual([]);
  });

  test("test_save_boundary_index_does_not_export_hydrate_game_save", () => {
    const index = files.find((f) => f.path === "Data/Save/index.ts");
    expect(index).toBeTruthy();
    expect(/\bhydrateGameSave\b/.test(index!.code)).toBe(false);
  });
});
