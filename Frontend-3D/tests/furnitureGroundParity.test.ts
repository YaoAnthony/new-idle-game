import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID } from "core";

import { groundHeightAt } from "../src/Game/State/world/walkable";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 家具"落在多高"全屋只许有一个答案：脚下的承托面（`groundHeightAt`）。
 *
 * ## 这条用例是踩出来的（2026-09-07，用户报"石台上虚影没过家具"）
 *
 * 布置虚影的 y 写的是 `anchorOf(room).elevation`——房间**地板**的标高。
 * 平地上两者恰好相等，所以一直没人发现；主屋左上角那块 0.45 高的石台
 * 一摆就露馅：虚影整整沉进石头里半条腿，松手落地却是好的。
 * "预览和结果不一致"比两个都错更糟——玩家会以为这格不能放。
 *
 * 同一份账当时在三处各写各的：虚影（PlacementController.refresh）、
 * 真身（FurnitureView.spawn）、报位置（furnitureWorldCenter，气泡和音景
 * 问它）。只有真身是对的。
 *
 * 渲染那三处要 three + 真渲染器，headless 起不来（和
 * buildingHintParity 同一个处境），所以这里钉两件能钉的：
 * 1. 承托面本身认不认石台——`groundHeightAt` 在台上台下必须给出不同的高度；
 * 2. 那三处**源码里**没有第二个高度来源。第 2 条是 grep 守卫，弱，
 *    但它守的正是这次的病因：有人另起一份算法。
 *
 * 接线由实机验收：布置模式下把椅子指到石台上，虚影四条腿站在台面上
 * （2026-09-07 离屏渲图确认过，之前是只露出一个椅背）。
 */

const GAME3D = join(__dirname, "../src/Game3D");

/** 主屋左上角那块膝盖高的石台（cottageL1Interior 的 hearth-dais） */
const DAIS_ELEVATION = 0.45;

/** 石台上一点 / 石台外的屋内地板一点。世界坐标，见 layout.ts 的锚点 */
const ON_DAIS = { x: -3, z: 14.5 };
const OFF_DAIS = { x: -3, z: 11.5 };

function sourceOf(relPath: string): string[] {
  return readFileSync(join(GAME3D, relPath), "utf8")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      // 注释行不算：守的是逻辑，不是文档（这份文件头就提了 anchorOf 好几次）
      return !(
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*")
      );
    });
}

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
});

test("groundParity_承托面认得出石台_台上台下不是同一个高度", () => {
  const onDais = groundHeightAt(ON_DAIS.x, ON_DAIS.z);
  const offDais = groundHeightAt(OFF_DAIS.x, OFF_DAIS.z);

  // 台面比屋内地板正好高一个 elevation。这两个数是下面那条守卫的意义所在：
  // 差值为 0 的话，"用哪个高度来源"就永远测不出对错
  expect(onDais - offDais).toBeCloseTo(DAIS_ELEVATION, 5);
});

test("groundParity_虚影真身报位置三处都只问承托面_没有第二个高度来源", () => {
  const suspects = [
    "Interaction/PlacementController.ts",
    "World/FurnitureView.ts",
  ];

  for (const relPath of suspects) {
    const lines = sourceOf(relPath);

    // 病因原样：拿房间地板标高当家具的落地高度
    const offenders = lines
      .map((line, index) => ({ line: line.trim(), index }))
      .filter(({ line }) => /anchorOf\([^)]*\)\.elevation/.test(line))
      .map(({ line, index }) => `${relPath}:${index + 1}: ${line}`);
    expect(offenders).toEqual([]);

    // 反过来也要成立：这两处确实在问承托面，而不是把高度整个丢了
    expect(lines.some((line) => line.includes("groundHeightAt("))).toBe(true);
  }
});

test("groundParity_瞄准平面不写死零高_否则站上石台就指不准", () => {
  const lines = sourceOf("Interaction/PlacementController.ts");

  /*
   * 固定 y=0 的地面平面在抬高的地面上会让命中点顺着视线往远处漂
   * `elevation / tan(俯角)`（石台 0.45 在 32° 俯角下约 0.7 格）。
   * 虚影高度修好之后这个漂移就藏不住了——虚影会当场变成不跟手。
   * 判据是"平面高度来自 groundHeightAt"，不管它写成几次求解。
   */
  const solvesFromGround = lines.some((line) =>
    /floorPlane\.constant\s*=\s*-?\s*groundHeightAt\(/.test(line),
  );
  expect(solvesFromGround).toBe(true);
});
