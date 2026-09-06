import { afterEach, beforeEach, expect, test } from "vitest";
import { COMMAND_SKILL_ID, DEFAULT_MAP_ID, type ResidentWireIntent } from "core";

import { emit, on } from "../src/Game/EventBus";
import { runCommand } from "../src/Game/CommandLine/commands";
import { restoreBuildings } from "../src/Game/State/buildings";
import { initDoors } from "../src/Game/State/doorsRuntime";
import {
  applyResidentKeyframes,
  getResident,
  getResidents,
  isPuppetMode,
  reconcileResidents,
  removeResident,
  replayResidentIntent,
  restoreResidents,
  setPuppetMode,
  snapshotResidentKeyframes,
  snapshotResidents,
  spawnResident,
} from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { applyWorldOp } from "../src/Game/Multiplayer/opApply";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { registerResidentCommands } from "../src/Game/Systems/residents/commands";

/**
 * 居民系统 01c：**房主权威，房客是木偶**。
 *
 * 这里钉的是运行时那一层的契约（不碰网络）：木偶不决策、不衰减；op 送来的
 * Intent 木偶照做；关键帧按三档纠偏；`pets` 切片对账生灭；房主端每换一个
 * Intent 发一条 `resident_intent_started`；做客中 `/npc do` 被拒。
 * 真网络链路（房主发 → 服务端转 → 房客收）由 Backend 的 multiplayer.test 守。
 */

const IDS = ["resident-a", "resident-b"];
let stops: Array<() => void> = [];
const PLAYER = { x: 0, z: 0 };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  setPuppetMode(false);
  restoreBuildings([]);
  restoreResidents({});
  for (const id of IDS) removeResident(id);
  initDoors();
  invalidateNavGrid();
  stops.push(...registerResidentCommands());
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  setPuppetMode(false);
  setRemoteWorldActive(false);
  for (const id of IDS) removeResident(id);
});

function parked(residentId: string) {
  const agent = spawnResident(residentId, "slime_neighbor");
  agent.debugPlace(agent.x, agent.z);
  return agent;
}

function tickFor(agent: { tick: (dt: number, p: { x: number; z: number }) => void }, seconds: number) {
  for (let t = 0; t < seconds; t += 0.1) agent.tick(0.1, PLAYER);
}

test("resident_sync_木偶不问技能不衰减_六十秒后原地不动需求不变", () => {
  // Arrange
  const slime = parked("resident-a");
  slime.needs.hunger = 10; // 饿到阈值以下：非木偶会去找吃的
  setPuppetMode(true);
  expect(slime.puppet).toBe(true);
  const before = { x: slime.x, z: slime.z, hunger: slime.needs.hunger, thirst: slime.needs.thirst };

  // Act
  slime.idleTimer = 0;
  tickFor(slime, 60);

  // Assert
  expect(slime.currentIntent).toBeNull();
  expect({ x: slime.x, z: slime.z, hunger: slime.needs.hunger, thirst: slime.needs.thirst }).toEqual(before);
});

test("resident_sync_op送来的Intent木偶照做_非木偶忽略", () => {
  const slime = parked("resident-a");
  const intent: ResidentWireIntent = {
    skillId: "routine",
    priority: 40,
    interruptible: true,
    steps: [{ verb: "sleep", seconds: 30 }],
  };

  // 非木偶（房主自己、单机）：收到这条是坏客户端，忽略
  applyWorldOp({ kind: "resident_intent", residentId: "resident-a", intent, atMs: 1 });
  expect(slime.currentIntent).toBeNull();

  setPuppetMode(true);
  applyWorldOp({ kind: "resident_intent", residentId: "resident-a", intent, atMs: 2 });
  expect(slime.currentIntent?.skillId).toBe("routine");
  expect(slime.state).toBe("sleeping");

  // 木偶换 Intent 不会再往外发（否则回环）
  const started: string[] = [];
  const off = on("resident_intent_started", ({ residentId }) => started.push(residentId));
  replayResidentIntent("resident-a", { ...intent, steps: [{ verb: "stand", seconds: 1 }] });
  off();
  expect(started).toEqual([]);
});

test("resident_sync_关键帧三档纠偏_小忽略_中插值_大直接放", () => {
  const slime = parked("resident-a");
  setPuppetMode(true);
  const base = { x: slime.x, z: slime.z, heading: slime.heading };
  const frame = (dx: number) => ({
    atMs: 1,
    residents: [{ id: "resident-a", x: base.x + dx, z: base.z, heading: base.heading, verb: null, hidden: false }],
  });

  // 0.4 m：忽略
  applyResidentKeyframes(frame(0.4));
  tickFor(slime, 1);
  expect(slime.x).toBeCloseTo(base.x, 5);

  // 2 m：0.3 秒内插过去
  applyResidentKeyframes(frame(2));
  tickFor(slime, 0.1);
  expect(slime.x).toBeGreaterThan(base.x + 0.3);
  expect(slime.x).toBeLessThan(base.x + 2);
  tickFor(slime, 0.4);
  expect(slime.x).toBeCloseTo(base.x + 2, 3);

  // 5 m：立即
  applyResidentKeyframes(frame(7));
  expect(slime.x).toBeCloseTo(base.x + 7, 5);
});

test("resident_sync_关键帧动词不一致就切_房主在睡木偶也躺下", () => {
  const slime = parked("resident-a");
  setPuppetMode(true);
  expect(slime.state).toBe("idle");

  applyResidentKeyframes({
    atMs: 1,
    residents: [{ id: "resident-a", x: slime.x, z: slime.z, heading: 0, verb: "sleep", hidden: false }],
  });
  expect(slime.state).toBe("sleeping");

  // 房主醒了在走：木偶不去猜路（走路由 op 管），只把睡放下
  applyResidentKeyframes({
    atMs: 2,
    residents: [{ id: "resident-a", x: slime.x, z: slime.z, heading: 0, verb: null, hidden: false }],
  });
  expect(slime.state).toBe("idle");
  expect(slime.currentIntent).toBeNull();
});

test("resident_sync_pets切片对账_多的造木偶_少的移除_已有的不重建", () => {
  const slime = parked("resident-a");
  setPuppetMode(true);
  const intentBefore = { skillId: "routine", priority: 40, interruptible: true, steps: [{ verb: "sleep" as const, seconds: 30 }] };
  replayResidentIntent("resident-a", intentBefore);
  const snapshot = snapshotResidents();
  // 房主那边还有一只 b，a 没变
  const b = { ...snapshot["resident-a"], residentId: "resident-b", definitionId: "fox_neighbor" };
  reconcileResidents({ ...snapshot, "resident-b": b });

  expect(getResident("resident-b")?.puppet).toBe(true);
  expect(getResident("resident-a")).toBe(slime);
  expect(slime.currentIntent?.skillId).toBe("routine");

  // 房主那边 a 走了
  reconcileResidents({ "resident-b": b });
  expect(getResident("resident-a")).toBeUndefined();
  expect(getResidents().map((r) => r.residentId)).toEqual(["resident-b"]);
});

test("resident_sync_房主端每换一个Intent发一条started_载荷是能上网线的那一半", () => {
  parked("resident-a");
  const seen: ResidentWireIntent[] = [];
  const off = on("resident_intent_started", ({ intent }) => seen.push(intent));

  runCommand("/npc slime do sleep 30");
  off();

  expect(seen).toHaveLength(1);
  expect(seen[0].skillId).toBe(COMMAND_SKILL_ID);
  expect(seen[0].steps).toEqual([{ verb: "sleep", seconds: 30 }]);
  expect(Object.keys(seen[0]).some((key) => key.startsWith("on"))).toBe(false);
  // 关键帧里能看到这个动词
  expect(snapshotResidentKeyframes().find((f) => f.id === "resident-a")?.verb).toBe("sleep");
  expect(isPuppetMode()).toBe(false);
});

test("resident_sync_做客中npc_do和skill被拒_房主那边无事发生", () => {
  const slime = parked("resident-a");
  setRemoteWorldActive(true);
  setPuppetMode(true);

  const result = runCommand("/npc slime do sit");
  const toggled = runCommand("/npc slime skill wander off");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("做客");
  expect(toggled.ok).toBe(false);
  expect(slime.currentIntent).toBeNull();
  expect(slime.isSkillEnabled("wander")).toBe(true);
  emit("resident_changed", { residentId: "resident-a", reason: "probe" });
});
