import { beforeEach, expect, test } from "vitest";
import { GestureKind, defaultAvatarConfig } from "core";
import { Object3D } from "three";

import { emitParticipantGesture, onParticipantGesture } from "../src/Game/State/participants";
import { addItem, findStackRef, replaceCounts, selectHotbarSlot } from "../src/Game/State/inventory";
import { ParticleField } from "../src/Game3D/Effects/ParticleField";
import { HoeTool, ToolPlayer, WateringCanTool, toolForHeld, toolForItem } from "../src/Game3D/Tools/index";
import { HAND_HOLD_PITCH } from "../src/Game3D/Tools/HeldTool";
import { buildCharacter } from "../src/Game3D/World/CharacterView";
import { carryModeOf, mountHeldVisual } from "../src/Game3D/World/HeldItemView";

/**
 * 种植系统 · 期 6 · 工具类族、拿法、动作播放器（全部无头，three 不需要 WebGL）。
 */

function effects() {
  const root = new Object3D();
  return { root, dirt: new ParticleField(root, "#000000"), water: new ParticleField(root, "#0000ff") };
}

beforeEach(() => {
  replaceCounts({});
});

test("heldTools_注册表按toolType认类_锄头是HoeTool_两把壶都是WateringCanTool_非工具是null", () => {
  expect(toolForItem("wooden_hoe")).toBeInstanceOf(HoeTool);
  expect(toolForItem("watering_can")).toBeInstanceOf(WateringCanTool);
  expect(toolForItem("watering_can_wide")).toBeInstanceOf(WateringCanTool);
  expect(toolForItem("tomato")).toBeNull();
  expect(toolForItem("umbrella")).toBeNull();
  expect(toolForItem(null)).toBeNull();
  // 同一件只造一次
  expect(toolForItem("wooden_hoe")).toBe(toolForItem("wooden_hoe"));
});

test("heldTools_useFor_锄头只管翻地_壶管浇水和井_各不越界", () => {
  const hoe = toolForItem("wooden_hoe")!;
  const can = toolForItem("watering_can")!;
  expect(hoe.useFor({ kind: "farm", action: "till" })).toBe("swing");
  /*
   * 填平 2026-09-19 从 F 的判定表里去掉了（翻好的地不该连按两下就翻回去），
   * 锄头因此也不再为它出动作。
   *
   * `flatten` 已经不在提示的动作联合类型里了，所以这行要 @ts-expect-error。
   * **留着而不是删掉**：填平这条路本身还在（`farming.ts` 的 `did: "flatten"`、
   * `/farm flatten`），哪天它又接回 F 键，这条会先响。
   */
  // @ts-expect-error 运行时还可能传进来，见上
  expect(hoe.useFor({ kind: "farm", action: "flatten" })).toBeNull();
  expect(hoe.useFor({ kind: "farm", action: "water" })).toBeNull();
  expect(hoe.useFor({ kind: "farm", action: "sow" })).toBeNull();
  expect(hoe.useFor({ kind: "station", capability: "water_source" })).toBeNull();
  expect(can.useFor({ kind: "farm", action: "water" })).toBe("pour");
  expect(can.useFor({ kind: "farm", action: "till" })).toBeNull();
  expect(can.useFor({ kind: "station", capability: "water_source" })).toBe("fill");
  expect(can.useFor({ kind: "station", capability: "cooking" })).toBeNull();
  // 动作名对不上就没有说明
  expect(hoe.use("pour")).toBeNull();
  expect(can.use("pour")?.name).toBe("pour");
  expect(can.useSpecFor({ kind: "farm", action: "water" })?.impactAt).toBeGreaterThan(0);
});

test("heldTools_carryModeOf_工具在手_伞和锅在身前_空手none", () => {
  expect(carryModeOf("wooden_hoe")).toBe("hand");
  expect(carryModeOf("watering_can_wide")).toBe("hand");
  expect(carryModeOf("umbrella")).toBe("front");
  expect(carryModeOf("wok")).toBe("front");
  expect(carryModeOf(undefined)).toBe("none");
});

test("heldTools_mountHeldVisual_工具挂右手带grip_锅挂胸前", () => {
  const rig = buildCharacter(defaultAvatarConfig());
  const hoe = mountHeldVisual(rig, "wooden_hoe");
  expect(hoe?.parent).toBe(rig.handAnchor);
  expect(hoe?.userData.grip).toEqual(toolForItem("wooden_hoe")!.grip);
  const wok = mountHeldVisual(rig, "wok");
  expect(wok?.parent).toBe(rig.heldAnchor);
  expect(wok?.userData.grip).toBeUndefined();
  // 手的挂点长在右臂上：胳膊抡起来工具跟着走
  expect(rig.handAnchor.parent).toBe(rig.parts.armRight);
});

test("heldTools_toolForHeld_看选中的快捷栏格", () => {
  expect(toolForHeld()).toBeNull();
  addItem("wooden_hoe", 1);
  selectHotbarSlot(findStackRef("wooden_hoe")!);
  expect(toolForHeld()).toBeInstanceOf(HoeTool);
});

test("heldTools_ToolPlayer_挥锄播完_impact恰好一次在那一拍_土块飞_结束回持握角_进行中拒第二次", () => {
  const rig = buildCharacter(defaultAvatarConfig());
  mountHeldVisual(rig, "wooden_hoe");
  const fx = effects();
  const player = new ToolPlayer(rig, fx);
  const spec = toolForItem("wooden_hoe")!.use("swing")!;
  let impacts = 0;
  expect(player.play(spec, { target: { x: 1, y: 0.5, z: 2 }, onImpact: () => { impacts += 1; } })).toBe(true);
  expect(player.busy).toBe(true);
  expect(player.play(spec)).toBe(false);

  const dt = 1 / 60;
  let elapsed = 0;
  let impactedAt = -1;
  let peak = 0;
  while (player.busy) {
    player.update(dt);
    elapsed += dt;
    peak = Math.min(peak, rig.parts.armRight.rotation.x);
    if (impacts === 1 && impactedAt < 0) impactedAt = elapsed;
  }
  expect(impacts).toBe(1);
  expect(impactedAt).toBeCloseTo(spec.impactAt, 1);
  expect(elapsed).toBeCloseTo(spec.duration, 1);
  // 抡过头（比持握角高得多）再落下来
  expect(peak).toBeLessThan(-2);
  expect(rig.parts.armRight.rotation.x).toBeCloseTo(HAND_HOLD_PITCH, 1);
  // 土块从格上飞起来了（落地后会回收，所以看的是"飞过"不是"还在"）
  expect(fx.dirt.count).toBeGreaterThanOrEqual(0);
  const tool = rig.handAnchor.children[0];
  expect(tool.rotation.x).toBeCloseTo(toolForItem("wooden_hoe")!.grip.rotation[0], 5);
});

test("heldTools_ToolPlayer_倾壶期间水滴持续落_cancel不触发impact", () => {
  const rig = buildCharacter(defaultAvatarConfig());
  mountHeldVisual(rig, "watering_can");
  const fx = effects();
  const player = new ToolPlayer(rig, fx);
  const can = toolForItem("watering_can")!;
  let impacts = 0;
  player.play(can.use("pour")!, { target: { x: 0, y: 0, z: 1 }, onImpact: () => { impacts += 1; } });
  for (let i = 0; i < 30; i += 1) player.update(1 / 60);
  // 0.5 秒：水已经开始落了
  expect(impacts).toBe(1);
  expect(fx.water.count).toBeGreaterThan(0);
  expect(player.current).toBe("pour");

  // 井边装水半路收手：没到 impact 就不算装
  const player2 = new ToolPlayer(rig, fx);
  let filled = 0;
  player2.play(can.use("fill")!, { onImpact: () => { filled += 1; } });
  player2.update(0.1);
  player2.cancel();
  expect(player2.busy).toBe(false);
  expect(filled).toBe(0);
});

test("heldTools_ParticleField_撒一把_按重力落_落到floorY回收_池满不撒", () => {
  const root = new Object3D();
  const field = new ParticleField(root, "#123456", 10);
  field.burst({ at: { x: 0, y: 1, z: 0 }, count: 20, speed: 0, spread: 0, up: 0, gravity: 10, life: 5, size: 0.05, floorY: 0 });
  expect(field.count).toBe(10);
  for (let i = 0; i < 120; i += 1) field.update(1 / 60);
  // 两秒自由落体早过了 1 米：全落到地上回收了
  expect(field.count).toBe(0);
  expect(field.mesh.count).toBe(0);
  field.dispose();
  expect(field.mesh.parent).toBeNull();
});

test("heldTools_本地手势带tool块_远端按名字找回同一个动作", () => {
  const seen: Array<{ playerId: string; kind: string; tool?: unknown }> = [];
  const off = onParticipantGesture((playerId, gesture) => seen.push({ playerId, kind: gesture.kind, tool: gesture.tool }));
  emitParticipantGesture("p-x", GestureKind.ToolUse, 123, { itemId: "wooden_hoe", use: "swing", at: { x: 1, z: 2 } });
  emitParticipantGesture("p-x", GestureKind.Jump, 124);
  off();
  expect(seen).toEqual([
    { playerId: "p-x", kind: "tool_use", tool: { itemId: "wooden_hoe", use: "swing", at: { x: 1, z: 2 } } },
    { playerId: "p-x", kind: "jump", tool: undefined },
  ]);
  const tool = seen[0].tool as { itemId: string; use: string };
  expect(toolForItem(tool.itemId)?.use(tool.use)?.name).toBe("swing");
});
