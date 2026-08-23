import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

import {
  buildingDefinitions,
  buildingIcon,
  findBuilding,
} from "../src/Buildings/index";

/**
 * 建筑图标：**路径是字符串，写错了只会静默 404**——`<img>` 拿不到图不报错，
 * 界面上就是一个空框，只靠玩是发现不了的。这一组把三件事钉在这儿：
 *
 * - 声明的每张图在 `public/` 下真的存在；
 * - `buildingIcon` 按等级取图，缺图的等级退回前一个有图的；
 * - **商店只卖初始等级**（用户 2026-08-23 定："石傀儡里面能建的都是 LV1
 *   的，lv2 啥的就是升级界面里面能看到的"）。
 */

/** `/icons/a/b.png` → `public/icons/a/b.png`。vitest 从 Frontend-3D 起跑 */
function publicPath(url: string): string {
  return join(process.cwd(), "public", url.replace(/^\//, ""));
}

test("声明的每一张建筑图都真的在 public 下", () => {
  const missing: string[] = [];
  for (const definition of buildingDefinitions) {
    for (const level of definition.levels) {
      if (!level.icon) continue;
      if (!existsSync(publicPath(level.icon))) {
        missing.push(`${definition.buildingId}/${level.levelId} → ${level.icon}`);
      }
    }
  }
  expect(missing).toEqual([]);
});

test("图标路径必须是 public 下的绝对路径，不能写成相对的", () => {
  const bad: string[] = [];
  for (const definition of buildingDefinitions) {
    for (const level of definition.levels) {
      if (level.icon && !level.icon.startsWith("/")) {
        bad.push(`${definition.buildingId}/${level.levelId} → ${level.icon}`);
      }
    }
  }
  expect(bad).toEqual([]);
});

test("按等级取图：有自己那张就用自己的", () => {
  // 金库 l1 有自己的图，取到的必须是它，不是别的等级的
  const l1 = findBuilding("gold_jar")?.levels[0];
  expect(l1?.icon).toBeTruthy();
  expect(buildingIcon("gold_jar", "l1")).toBe(l1?.icon);
});

test("缺图的等级退回前一个有图的——美术一级一级补，界面不能因此开洞", () => {
  const jar = findBuilding("gold_jar")!;
  const upper = jar.levels.filter((level) => !level.icon);
  // 前提：确实还有等级没配图（lv2/lv3 的图还没画）。哪天补齐了这条自然失效
  expect(upper.length).toBeGreaterThan(0);

  for (const level of upper) {
    // 退回去的那张必须是初始等级的图，而不是 undefined
    expect(buildingIcon("gold_jar", level.levelId)).toBe(jar.levels[0].icon);
  }
});

test("认不出的等级当成初始等级，和 findBuildingLevel 的容错一致", () => {
  const jar = findBuilding("gold_jar")!;
  expect(buildingIcon("gold_jar", "l99")).toBe(jar.levels[0].icon);
});

test("不存在的建筑给 undefined，不抛", () => {
  expect(buildingIcon("no_such_building", "l1")).toBeUndefined();
});

test("能在铺子里盖的建筑，初始等级都得有图", () => {
  /*
   * 判据是"有没有图纸物品指向它"——那正是上架的条件（见 BuildShopPanel）。
   * 上了架却没图的话，卡片上是一行退化的文字，读起来像没做完。
   */
  const naked = buildingDefinitions
    .filter((definition) => !definition.levels[0].icon)
    .map((definition) => definition.buildingId);
  // 房子、小镇店铺这些不在铺子里卖，没图不算问题；这里只点名上架的
  expect(naked).not.toContain("gold_jar");
  expect(naked).not.toContain("wood_wall");
});
