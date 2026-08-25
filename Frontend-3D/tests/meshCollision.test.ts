import { expect, test } from "vitest";

import { findBuildingLevel } from "../src/Buildings/index";
import { buildMeshCollider } from "../src/Game/State/world/meshCollision";

/**
 * 模型即碰撞（期 A 的可行性钉死）。
 *
 * 拿餐厅当试件不是随便挑的：它是全库**手写碰撞最罩不住**的一栋——
 * 拱形门洞（矩形规则写不出）、脚印外一圈道具（露天桌、MENU 黑板，
 * 今天零碰撞任人穿模）、0.42 高的石台明（该能站上去）。
 * 这四条断言每一条都对应一个今天真实存在的坑。
 *
 * 全程 **headless**：不开渲染器，模型是 box/blob/cylinder 拼的纯
 * BufferGeometry，three-mesh-bvh 只做几何运算。这条腿断了的话
 * 后面所有期都没法在 vitest 里验收，所以它是第一条要证的。
 */

function dinerCollider() {
  // Arrange：餐厅模型原样立在原点（不摆进世界，纯几何试验台）
  const level = findBuildingLevel("diner", "l1");
  expect(level, "餐厅得存在，不然下面全是空气").toBeTruthy();
  return buildMeshCollider(level!.build());
}

/** 站在地面（台明外）的身高带：脚 + 迈得上去的高度 → 头顶 */
const GROUND_BAND = { min: 0.55, max: 1.9 };
/** 站在台明上（0.42）的身高带 */
const PLINTH_BAND = { min: 0.42 + 0.55, max: 0.42 + 1.9 };

test("meshCollision_墙挡人_最普通的一条先立住", () => {
  const collider = dinerCollider();

  // Act：北墙正中，半径 0.32（玩家体型）
  const blocked = collider.capsuleBlocked(0, -3.5, 0.32, GROUND_BAND.min, GROUND_BAND.max);

  // Assert
  expect(blocked).toBe(true);
  expect(collider.triangleCount).toBeGreaterThan(100);
});

test("meshCollision_拱门洞能走_门是推导出来的不是写出来的", () => {
  /*
   * **这是整个方案的灵魂断言。** 旧系统里门口能走是因为
   * `buildingDoorAt` 写了"门心 1.5 米内豁免"；这里能走是因为拱洞那一段
   * **真的没有三角形**。柜台让出的右侧通道 x≈0.7，拱在这一点的下缘
   * 高 3.3，远在头顶之上。
   */
  const collider = dinerCollider();

  const blocked = collider.capsuleBlocked(0.7, 3.5, 0.32, PLINTH_BAND.min, PLINTH_BAND.max);

  expect(blocked).toBe(false);
});

test("meshCollision_露天桌挡人_今天穿模的东西从此有碰撞", () => {
  /*
   * 露天桌在**脚印外**（x −2.8, z 4.65，脚印只到 z 3.5）——旧的矩形规则
   * 永远管不到它，这正是用户报"走过去就会穿模"的那类东西。
   */
  const collider = dinerCollider();

  const table = collider.capsuleBlocked(-2.8, 4.65, 0.35, GROUND_BAND.min, GROUND_BAND.max);
  const menu = collider.capsuleBlocked(2.65, 4.55, 0.32, GROUND_BAND.min, GROUND_BAND.max);

  expect(table, "露天桌").toBe(true);
  expect(menu, "MENU 黑板").toBe(true);
});

test("meshCollision_台阶以下的东西不挡_低于一步高的天然可跨过", () => {
  /*
   * 身高带的下缘是"迈得上去的高度"：门口石阶顶 0.42、小凳顶 0.44，
   * 现实里就是一脚跨上去的东西。把它们也挡死会回到"人贴着廊子走，
   * 腿被挡在外面"那个老坑（V0.13 缘侧硬阻挡的教训）。
   *
   * 第一版这条用的是侧面花箱 (−5.05, 1.2)——测错了点：那个位置其实
   * 压着**栅栏横杆**（0.62/0.88 高，在身高带里，本来就该挡）。
   * 花箱贴着栅栏摆，附近没有一个"只有花箱"的干净采样点。
   */
  const collider = dinerCollider();

  // 门口第一级石阶正中 (0, 4.65)：顶 0.42，周围一米内没有别的东西
  const step = collider.capsuleBlocked(0, 4.65, 0.32, GROUND_BAND.min, GROUND_BAND.max);
  // 露天桌旁的小凳 (−3.58, 4.65)：顶 0.44，桌板边缘在 0.35 米外
  const stool = collider.capsuleBlocked(-3.58, 4.65, 0.3, GROUND_BAND.min, GROUND_BAND.max);

  expect(step, "石阶该跨得上去").toBe(false);
  expect(stool, "小凳该跨得过去").toBe(false);
});

test("meshCollision_台明向下打线得到台面高_期C的站得上从这里来", () => {
  const collider = dinerCollider();

  // (3.5, 4.2)：台明上、屋檐和遮阳篷都罩不到的一点
  const hit = collider.groundHitBelow(3.5, 4.2, 5);
  const miss = collider.groundHitBelow(12, 12, 5);

  expect(hit).not.toBeNull();
  expect(hit!).toBeCloseTo(0.42, 2);
  expect(miss, "模型外没有面，答 null 让地形接手").toBeNull();
});
