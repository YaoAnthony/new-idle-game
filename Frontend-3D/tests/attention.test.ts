import { afterEach, beforeEach, expect, test } from "vitest";
import { COMMAND_SKILL_ID, DEFAULT_MAP_ID, attentionTuning, residentIdOf, wrapAngle } from "core";
import { restoreBuildings } from "../src/Game/State/buildings";
import { removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { end, getActiveDialogue, startDialogue } from "../src/Game/Systems/dialogue";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { setTalkClockSource, startTalkSystem } from "../src/Game/Systems/residents/talk";
import { greetSkill } from "../src/Game/State/skills/greet";

/**
 * 注视（居民系统 21）：说话的双方互相看着对方。
 * 身体转过去（不是一帧到位）、坐着只转头、来源各清各的、关键帧带头的偏转给木偶。
 */

const SLIME = residentIdOf("slime_neighbor");
const FOX = residentIdOf("fox_neighbor");
const PLAYER = { x: 0, z: 0 };
const DT = 1 / 30;
let stops: Array<() => void> = [];

/** 召出来、清掉登场 Intent、站在原地朝 +z */
function parked(residentId: string, definitionId: string) {
  const agent = spawnResident(residentId, definitionId);
  agent.debugPlace(agent.x, agent.z);
  agent.heading = 0;
  return agent;
}

/** 站住不动（指令优先级，技能抢不走），不带 facing */
function standStill(agent: ReturnType<typeof parked>): void {
  expect(agent.perform({ skillId: COMMAND_SKILL_ID, priority: 1000, interruptible: false, steps: [{ verb: "stand", seconds: 600 }] })).toBe(true);
}

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  for (const id of [SLIME, FOX]) removeResident(id);
  invalidateNavGrid();
  setTalkClockSource(() => ({ worldDayId: "2026-09-15", phase: "day" }));
});

afterEach(() => {
  while (getActiveDialogue()) end();
  for (const stop of stops) stop();
  stops = [];
  setTalkClockSource(null);
  for (const id of [SLIME, FOX]) removeResident(id);
});

test("attention_对话打开_他站着逐帧转过来面向你_转到了头回正_关掉清掉", () => {
  stops.push(startTalkSystem());
  const slime = parked(SLIME, "slime_neighbor");
  // 你在他正右方（+x）：目标朝向 π/2
  const player = { x: slime.x + 3, z: slime.z };

  expect(startDialogue("slime_chat_any_1", SLIME)).toBe(true);
  expect(slime.attentionTarget()).toEqual({ kind: "player" });
  // 站的指令不再带开对话那一拍的坐标快照
  expect(slime.currentIntent?.steps[0]).toEqual({ verb: "stand", seconds: 3600 });
  expect(slime.heading).toBe(0);

  slime.tick(DT, player);
  expect(slime.heading).toBeGreaterThan(0);
  expect(slime.heading).toBeLessThan(Math.PI / 2);
  // 第一帧头先扭过去（头比身体快）
  expect(slime.headYaw).toBeGreaterThan(0);

  for (let i = 0; i < 150; i += 1) slime.tick(DT, player);
  expect(slime.heading).toBeCloseTo(Math.PI / 2, 2);
  // 身体对上了，头相对身体回正
  expect(Math.abs(slime.headYaw)).toBeLessThan(0.05);

  end();
  expect(slime.attentionTarget()).toBeNull();
});

test("attention_目标每帧重读_你绕到另一边他跟着转", () => {
  const slime = parked(SLIME, "slime_neighbor");
  standStill(slime);
  slime.attend("dialogue", { kind: "player" });
  for (let i = 0; i < 150; i += 1) slime.tick(DT, { x: slime.x + 3, z: slime.z });
  expect(slime.heading).toBeCloseTo(Math.PI / 2, 2);

  for (let i = 0; i < 150; i += 1) slime.tick(DT, { x: slime.x - 3, z: slime.z });
  expect(slime.heading).toBeCloseTo(-Math.PI / 2, 2);
});

test("attention_坐着_不转身只转头_头夹在限角内", () => {
  const slime = parked(SLIME, "slime_neighbor");
  expect(slime.perform({ skillId: COMMAND_SKILL_ID, priority: 1000, interruptible: false, steps: [{ verb: "sit" }] })).toBe(true);
  expect(slime.state).toBe("sitting");
  slime.attend("dialogue", { kind: "player" });

  // 右后方 135°：超过头的限角
  const behindRight = { x: slime.x + 3, z: slime.z - 3 };
  for (let i = 0; i < 150; i += 1) slime.tick(DT, behindRight);

  expect(slime.heading).toBe(0);
  expect(slime.headYaw).toBeCloseTo(attentionTuning.headClampRad, 2);
});

test("attention_睡着_头也不转", () => {
  const slime = parked(SLIME, "slime_neighbor");
  expect(slime.perform({ skillId: COMMAND_SKILL_ID, priority: 1000, interruptible: false, steps: [{ verb: "sleep", seconds: 600 }] })).toBe(true);
  expect(slime.state).toBe("sleeping");
  slime.attend("dialogue", { kind: "player" });
  for (let i = 0; i < 30; i += 1) slime.tick(DT, { x: slime.x + 3, z: slime.z });
  expect(slime.heading).toBe(0);
  expect(slime.headYaw).toBe(0);
});

test("attention_stand的facing_转过去而不是一帧到位_转到就对齐", () => {
  const slime = parked(SLIME, "slime_neighbor");
  // 正后方：π
  expect(slime.perform({ skillId: COMMAND_SKILL_ID, priority: 1000, interruptible: false, steps: [{ verb: "stand", seconds: 600, facing: { x: slime.x, z: slime.z - 1 } }] })).toBe(true);
  expect(slime.heading).toBe(0);

  slime.tick(DT, PLAYER);
  expect(slime.heading).toBeGreaterThan(0);
  expect(slime.heading).toBeLessThan(Math.PI);

  for (let i = 0; i < 150; i += 1) slime.tick(DT, PLAYER);
  expect(Math.abs(wrapAngle(slime.heading - Math.PI))).toBeLessThan(1e-9);
});

test("attention_来源各清各的_对话赢过邻居聊天", () => {
  const slime = parked(SLIME, "slime_neighbor");
  slime.attend("pair", { kind: "resident", residentId: FOX });
  slime.attend("dialogue", { kind: "player" });
  expect(slime.attentionTarget()).toEqual({ kind: "player" });

  slime.unattend("dialogue");
  expect(slime.attentionTarget()).toEqual({ kind: "resident", residentId: FOX });

  slime.unattend("pair");
  expect(slime.attentionTarget()).toBeNull();
});

test("attention_看着另一位居民_对方走了就当没有目标_头回正", () => {
  const slime = parked(SLIME, "slime_neighbor");
  const fox = parked(FOX, "fox_neighbor");
  fox.debugPlace(slime.x + 3, slime.z);
  standStill(slime);
  slime.attend("pair", { kind: "resident", residentId: FOX });
  for (let i = 0; i < 150; i += 1) slime.tick(DT, PLAYER);
  expect(slime.heading).toBeCloseTo(Math.PI / 2, 2);

  removeResident(FOX);
  for (let i = 0; i < 150; i += 1) slime.tick(DT, PLAYER);
  // 人没了：身体留在原处，头回正
  expect(slime.heading).toBeCloseTo(Math.PI / 2, 2);
  expect(Math.abs(slime.headYaw)).toBeLessThan(1e-6);
});

test("attention_关键帧带头的偏转_木偶照着房主转身转头_0不带", () => {
  const host = parked(SLIME, "slime_neighbor");
  expect(host.keyframe().headYaw).toBeUndefined();
  standStill(host);
  host.attend("dialogue", { kind: "player" });
  // 转到一半截一帧：身体在路上、头扭着
  for (let i = 0; i < 5; i += 1) host.tick(DT, { x: host.x + 3, z: host.z + 3 });
  const frame = host.keyframe();
  expect(frame.heading).toBeGreaterThan(0);
  expect(frame.headYaw).toBeGreaterThan(0);

  const puppet = parked(FOX, "fox_neighbor");
  puppet.puppet = true;
  puppet.applyKeyframe({ ...frame, id: puppet.residentId, x: puppet.x, z: puppet.z });
  // 收到那一拍不跳：转是自己转的
  expect(puppet.heading).toBe(0);
  for (let i = 0; i < 150; i += 1) puppet.tick(DT, PLAYER);
  expect(puppet.heading).toBeCloseTo(frame.heading, 3);
  expect(puppet.headYaw).toBeCloseTo(frame.headYaw!, 3);
});

test("attention_打招呼那一眼_只转头不转身_几秒后自己收回", () => {
  const slime = parked(SLIME, "slime_neighbor");
  standStill(slime);
  // 你在他正右方一米：进了招呼距离，相对身体 90°，超过头的限角
  const near = { x: slime.x + 1, z: slime.z };

  greetSkill.observe!({ agent: slime, player: near, current: null });
  expect(slime.speech).not.toBeNull();
  expect(slime.attentionTarget()).toEqual({ kind: "player" });

  for (let i = 0; i < 60; i += 1) slime.tick(DT, near);
  expect(slime.heading).toBe(0);
  expect(slime.headYaw).toBeCloseTo(attentionTuning.headClampRad, 2);

  // 看够了（greetLookSeconds）自己撤，头回正
  for (let i = 0; i < Math.ceil(attentionTuning.greetLookSeconds / DT) + 60; i += 1) slime.tick(DT, near);
  expect(slime.attentionTarget()).toBeNull();
  expect(Math.abs(slime.headYaw)).toBeLessThan(1e-6);
});

test("attention_打招呼时开了对话_对话的注意力压过去_身体跟着转", () => {
  const slime = parked(SLIME, "slime_neighbor");
  standStill(slime);
  const near = { x: slime.x + 1, z: slime.z };
  greetSkill.observe!({ agent: slime, player: near, current: null });
  expect(slime.attentionTarget()).toEqual({ kind: "player" });

  slime.attend("dialogue", { kind: "player" });
  for (let i = 0; i < 150; i += 1) slime.tick(DT, near);
  expect(slime.heading).toBeCloseTo(Math.PI / 2, 2);
});
