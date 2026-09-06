import { afterEach, beforeEach, expect, test } from "vitest";
import { COMMAND_SKILL_ID, CreatureRole, DEFAULT_MAP_ID, Facing, findSkillPriority } from "core";

import { runCommand } from "../src/Game/CommandLine/commands";
import { restoreBuildings } from "../src/Game/State/buildings";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import { settleItem } from "../src/Game/State/droppedItems";
import {
  getResidents,
  removeResident,
  restoreResidents,
  seedInitialCreatures,
  spawnResident,
} from "../src/Game/State/residentsRuntime";
import { getCurrentMapId, getWorld } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { registerResidentCommands } from "../src/Game/Systems/residents/commands";

/**
 * 居民系统 01：身体 / 动词 / 技能三层拆开之后，行为一个不能变。
 * 这里钉的是**拆分本身的规矩**：谁先决策、谁能抢、指令无视一切、
 * 关掉技能就不做、按 F 问技能。原来的行为由 golem / yielding / theftChain
 * 那些用例继续守。
 */

const IDS = ["resident-a", "resident-otter_trader", "resident-stone_golem"];
let stops: Array<() => void> = [];

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  clearAllFurniture();
  for (const id of IDS) removeResident(id);
  invalidateNavGrid();
  stops.push(...registerResidentCommands());
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  for (const id of IDS) removeResident(id);
});

/** 开局的那尊，装上头 */
function awakeGolem() {
  seedInitialCreatures();
  const golem = getResidents().find((resident) => resident.role === CreatureRole.Worker)!;
  golem.attachPart("head");
  golem.idleTimer = 0;
  return golem;
}

const PLAYER = { x: 0, z: 0 };

/**
 * 召出来的活物站在门口格（可走）且带着一个不可打断的"登场"Intent。
 * 用例要一个**能走、没事干**的起点：原地 debugPlace 一下就把 Intent 清了。
 * （不用 (0, 4)：无头环境里那一格不可走，路排不出来。）
 */
function parked(residentId: string, definitionId: string) {
  const agent = spawnResident(residentId, definitionId);
  agent.debugPlace(agent.x, agent.z);
  return agent;
}

function tickFor(agent: { tick: (dt: number, p: { x: number; z: number }) => void }, seconds: number) {
  for (let t = 0; t < seconds; t += 0.1) agent.tick(0.1, PLAYER);
}

test("skills_石傀儡有工地时第一次决策来自build_站在跟前直接开工", () => {
  const golem = awakeGolem();
  // 工地就在他脚边（金库 1×1，reach = 1.1 + 0.9 + 0.5）
  restoreBuildings([
    {
      instanceId: "local:building:gold_jar#1",
      buildingId: "gold_jar",
      x: golem.x + 1.5,
      z: golem.z,
      elevation: 0,
      facing: Facing.North,
      levelId: "l1",
      construction: { targetLevelId: "l1" },
    },
  ]);

  golem.tick(0.1, PLAYER);

  expect(golem.currentIntent?.skillId).toBe("build");
  expect(golem.state).toBe("work");
});

test("skills_没有工地时石傀儡只会游荡_决策来自wander", () => {
  const golem = awakeGolem();

  golem.tick(0.1, PLAYER);

  // 没工地：build 答 null。院子在无头环境里不可走，wander 排不出路，
  // 所以只断言"没去干活、也没去吃喝"和技能表本身
  expect(golem.currentIntent?.skillId).not.toBe("build");
  expect(["work", "eat", "drink"]).not.toContain(golem.state);
  expect(golem.skills.map((skill) => skill.id)).toEqual(["build", "wander"]);
});

test("skills_饿了地上有吃的_needs抢过wander_吃到跟前不再可打断", () => {
  const slime = parked("resident-a", "slime_neighbor");
  // 把两个掷骰子的填充技能关掉，这条用例只看 needs 和 wander 的关系
  slime.setSkillEnabled("nap", false);
  slime.setSkillEnabled("approach", false);
  // 作息（40）读的是真时钟：白天会给一条 roam 抢在 wander 前面，这条用例不看它
  slime.setSkillEnabled("routine", false);
  // 先让他在游荡（一个可打断的低优先级 Intent）
  slime.idleTimer = 0;
  slime.needs.hunger = 80;
  slime.tick(0.1, PLAYER);
  expect(slime.currentIntent?.skillId).toBe("wander");

  // 地上出现煎蛋（放在一个他能走到的点上）、饿到阈值以下
  const food = slime.randomFreeSpot()!;
  settleItem({
    roomId: getWorld().room.roomId,
    stack: { stackId: "probe-egg", itemId: "fried_egg", quantity: 1 },
    at: { x: food[0], y: 0, z: food[1] },
  });
  slime.needs.hunger = 10;

  // 半秒一轮的"做着事也问一圈"会让 needs（60）抢走 wander（10）
  tickFor(slime, 0.6);
  expect(slime.currentIntent?.skillId).toBe("needs");
  expect(slime.currentIntent?.interruptible).toBe(true);

  // 走到跟前开吃：最后一步锁住，连 build（80）都抢不走；指令能
  // （逐帧推到开吃那一刻停下——推满 6 秒的话一顿 2.6 秒的饭早吃完了）
  for (let t = 0; t < 12 && slime.state !== "eat"; t += 0.1) slime.tick(0.1, PLAYER);
  expect(slime.state).toBe("eat");
  expect(slime.currentIntent?.interruptible).toBe(false);
  const bully = slime.perform({
    skillId: "build",
    priority: findSkillPriority("build")!.priority,
    interruptible: true,
    steps: [{ verb: "stand", seconds: 1 }],
  });
  expect(bully).toBe(false);
  expect(slime.state).toBe("eat");

  const command = slime.perform({
    skillId: COMMAND_SKILL_ID,
    priority: findSkillPriority(COMMAND_SKILL_ID)!.priority,
    interruptible: false,
    steps: [{ verb: "stand", seconds: 1 }],
  });
  expect(command).toBe(true);
  expect(slime.state).toBe("idle");
});

test("skills_npc_do立即生效_哪怕他正在睡", () => {
  const slime = parked("resident-a", "slime_neighbor");

  expect(runCommand("/npc slime do sleep 30").ok).toBe(true);
  expect(slime.state).toBe("sleeping");

  const result = runCommand("/npc slime do stand 1");
  expect(result.ok).toBe(true);
  expect(slime.state).toBe("idle");
  expect(slime.currentIntent?.skillId).toBe(COMMAND_SKILL_ID);

  // 并行槽：说话不打断站着
  expect(runCommand("/npc slime do speak talk.test").ok).toBe(true);
  expect(slime.speech?.localizationKey).toBe("talk.test");
  expect(slime.currentIntent?.skillId).toBe(COMMAND_SKILL_ID);
});

test("skills_关掉技能就不做_npc_skill_off", () => {
  const slime = parked("resident-a", "slime_neighbor");
  slime.needs.hunger = 80;
  slime.needs.thirst = 80;

  expect(runCommand("/npc slime skill wander off").ok).toBe(true);
  expect(runCommand("/npc slime skill nap off").ok).toBe(true);
  expect(runCommand("/npc slime skill approach off").ok).toBe(true);

  slime.idleTimer = 0;
  tickFor(slime, 2);
  expect(slime.currentIntent).toBeNull();
  expect(slime.state).toBe("idle");

  const listing = runCommand("/npc slime skills");
  expect(listing.ok).toBe(true);
  expect(listing.message).toContain("wander");
  expect(listing.message).toContain("[关]");

  expect(runCommand("/npc slime skill wander on").ok).toBe(true);
  slime.idleTimer = 0;
  tickFor(slime, 0.2);
  expect(slime.currentIntent?.skillId).toBe("wander");
});

test("skills_按F问技能_商人开交易_工头开建造_居民落回对话", () => {
  const otter = spawnResident("resident-otter_trader", "otter_trader");
  expect(otter.interact(PLAYER)).toEqual({ kind: "trade", merchantId: "otter_trader" });

  // seedInitialCreatures 在场上已有活物时不再种，所以这里直接召一尊
  const golem = spawnResident("resident-stone_golem", "stone_golem");
  golem.attachPart("head");
  expect(golem.interact(PLAYER)).toEqual({ kind: "build_shop" });

  const slime = parked("resident-a", "slime_neighbor");
  // 03 起居民挂了 talk 技能：按 F 答的是闲聊池抽出来的一段（不再落回 RoomScene 的兜底对话）
  expect(slime.interact(PLAYER)?.kind).toBe("dialogue");
});

test("skills_where打印Intent来源_描述里有技能名和步骤", () => {
  parked("resident-a", "slime_neighbor");
  runCommand("/npc slime do sleep 30");

  const where = runCommand("/npc slime where");

  expect(where.ok).toBe(true);
  expect(where.message).toContain("resident-a");
  expect(where.message).toContain(COMMAND_SKILL_ID);
  expect(where.message).toContain("sleep");
});

test("skills_hide之后填充技能不再把他拉出来_直到show", () => {
  const slime = parked("resident-a", "slime_neighbor");
  slime.needs.hunger = 80;
  slime.needs.thirst = 80;

  expect(runCommand("/npc slime do hide").ok).toBe(true);
  expect(slime.state).toBe("hidden");

  // 藏着：idleTimer 归零后 wander / nap / approach 都不该把他弄出来
  slime.idleTimer = 0;
  tickFor(slime, 10);
  expect(slime.state).toBe("hidden");
  expect(slime.currentIntent).toBeNull();

  expect(runCommand("/npc slime do show").ok).toBe(true);
  expect(slime.state).toBe("idle");
});
