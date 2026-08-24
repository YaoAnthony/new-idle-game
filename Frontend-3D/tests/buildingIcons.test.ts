import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

import { itemDefinitions } from "core";

import {
  blueprintIconUrl,
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
 *
 * ## 为什么这份用例读磁盘
 *
 * `.claude/rules/test-standards.md` 写着"单元测试不得依赖外部状态（文件
 * 系统…）"，这一条是**刻意的例外**，理由和 `netBoundary.test.ts`（既有的、
 * 同样读磁盘的那份架构守卫）一样：`public/` 不是"外部状态"，它和 src 一样
 * 进版本库，读它跟读源码一样确定、一样快。
 *
 * 而且这里**没有磁盘就测不了任何东西**：要钉的正是"这个字符串指向的文件
 * 真的存在"，把 fs 换成桩之后剩下的只是"字符串等于字符串"。
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

/**
 * 图纸借用成品的图（用户 2026-08-23："木墙图纸和金库的图纸 ICON，你直接拿
 * LV1 的图片就好了，不需要重新画"）。
 *
 * 这不只是省一次画：图纸和成品**本来就该长一样**——玩家在背包里看见的那张
 * 脸，就是他摆下去会立起来的东西。
 */
test("图纸的图标就是那栋楼初始等级的图", () => {
  const jarBlueprint = itemDefinitions.find(
    (item) => item.blueprint?.buildingId === "gold_jar",
  );
  expect(jarBlueprint, "金币罐得有图纸物品，否则它在铺子里上不了架").toBeTruthy();
  expect(blueprintIconUrl(jarBlueprint!.id)).toBe(
    findBuilding("gold_jar")!.levels[0].icon,
  );

  const wallBlueprint = itemDefinitions.find(
    (item) => item.blueprint?.buildingId === "wood_wall",
  );
  expect(blueprintIconUrl(wallBlueprint!.id)).toBe(
    findBuilding("wood_wall")!.levels[0].icon,
  );
});

test("不是图纸的物品不借图——番茄不该拿到某栋楼的脸", () => {
  expect(blueprintIconUrl("tomato")).toBeUndefined();
  expect(blueprintIconUrl("no_such_item")).toBeUndefined();
});

/**
 * **上架出售**的图纸都得借得到图。
 *
 * 收窄过一次（期 4）：原来查的是"每一件图纸"，三位居民的房子图纸落地后
 * 当场红——那三张是**邻居送的赠品，永远不上货架**，而它们那三栋楼还是
 * 占位壳（没有 icon，等参考图）。
 *
 * 为什么收窄而不是硬凑一张图：这条守卫的真意是"图纸不该顶着一张**别的**
 * 脸"，不是"每张图纸都必须有脸"。没图时 `slots.tsx` 会退化成画名字
 * （`broken` 分支），那是诚实的降级，不是空洞。而铺子里的卡片得有脸——
 * 玩家在货架上是**看图买东西**的，那一栏不能只有字。
 *
 * 判据用"有没有人卖它"：`buildCards` 那条上架规则是"注册表里存在
 * blueprint 指向它的物品"，所以反过来问"这栋楼在不在铺子的清单里"。
 * 这和上面那条 `buildingIcon` 的豁免（房子、小镇店铺不上架所以不查）
 * 是同一条线。
 */
test("上架出售的图纸都借得到图，没有一张是空的", () => {
  // 邻居送的赠品图纸：不上货架，对应的楼还是占位壳（期 4，等参考图）
  const GIFTED = new Set([
    "blueprint_slime_house",
    "blueprint_fox_house",
    "blueprint_spirit_house",
  ]);
  const naked = itemDefinitions
    .filter((item) => item.blueprint)
    .filter((item) => !GIFTED.has(item.id))
    .filter((item) => !blueprintIconUrl(item.id))
    .map((item) => item.id);
  expect(naked).toEqual([]);
});
