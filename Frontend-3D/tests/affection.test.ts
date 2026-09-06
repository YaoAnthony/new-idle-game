import { afterEach, beforeEach, expect, test } from "vitest";
import { AffectionStage, DEFAULT_MAP_ID, affectionTuning, moodTuning, residentIdOf } from "core";

import { emit, on } from "../src/Game/EventBus";
import { restoreBuildings } from "../src/Game/State/buildings";
import { replaceCounts } from "../src/Game/State/inventory";
import { getResident, removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { debugClearWeather } from "../src/Game/State/weather";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { restoreDayFacts } from "../src/Game/Systems/dayRecord";
import { end, getActiveDialogue } from "../src/Game/Systems/dialogue";
import { dismissUnpack, getPendingUnpack } from "../src/Game/Systems/unpack";
import { getPoolMisses, restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { setTalkClockSource, startTalkSystem, talkText, type TalkClock } from "../src/Game/Systems/residents/talk";
import { addressTermFor, gainAffection, resetAffectionLedger, setAffection, settleDailyMood, startAffectionSystem } from "../src/Game/Systems/residents/affection";
import { pendingPresents, startPresentSystem } from "../src/Game/Systems/residents/presents";
import { setResidentAddress } from "../src/Game/Systems/residents/naming";
import { createResidentFromSave } from "../src/Game/State/residents/index";
import { migrateSave } from "../src/Data/Save/migrations";
import type { GameSave } from "core";

/**
 * 居民系统 04：好感与称呼的接线。
 * 纯规则（分 → 档、补值、称呼渲染、昵称确定性）在 Core 的 affection.test；这里钉的是：
 * 规则各 +1 且一天一次、跨档发信号并起昵称、`{you}` 三档渲染、改称呼落存档、
 * 随机赠礼走过来 → 对话 → 领取面板、专属家具一次性、老档迁移补值、做客不涨。
 */

const SLIME = residentIdOf("slime_neighbor");
const PLAYER = { x: 0, z: 0 };
let stops: Array<() => void> = [];
let clock: TalkClock = { worldDayId: "2026-09-06", phase: "day" };

function parked(residentId: string, definitionId: string) {
  const agent = spawnResident(residentId, definitionId);
  agent.debugPlace(agent.x, agent.z);
  return agent;
}

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  replaceCounts({});
  restoreDayFacts([]);
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  debugClearWeather();
  dismissUnpack();
  removeResident(SLIME);
  invalidateNavGrid();
  clock = { worldDayId: "2026-09-06", phase: "day" };
  setTalkClockSource(() => clock);
  resetAffectionLedger();
  stops.push(startStorySystem(false), startAffectionSystem(), startPresentSystem(), startTalkSystem());
});

afterEach(() => {
  if (getActiveDialogue()) end();
  for (const stop of stops) stop();
  stops = [];
  setTalkClockSource(null);
  dismissUnpack();
  removeResident(SLIME);
});

test("affection_打招呼和聊天各加一分_同一天再来不加_按表给分", () => {
  const slime = parked(SLIME, "slime_neighbor");
  expect(slime.affection).toBe(0);

  emit("story_signal", { kind: "resident_greeted", subject: "slime_neighbor" });
  expect(slime.affection).toBe(affectionTuning.gains.greet);
  emit("story_signal", { kind: "resident_greeted", subject: "slime_neighbor" });
  expect(slime.affection).toBe(affectionTuning.gains.greet);

  emit("story_signal", { kind: "resident_talked", subject: "slime_neighbor" });
  expect(slime.affection).toBe(affectionTuning.gains.greet + affectionTuning.gains.chat);

  emit("story_signal", { kind: "resident_gift_received", subject: "slime_neighbor:loved" });
  expect(slime.affection).toBe(affectionTuning.gains.greet + affectionTuning.gains.chat + affectionTuning.gains.gift_loved);
  // 送错也有一分，但今天送礼那条已经给过了——不是同一个来源，所以还能给
  emit("story_signal", { kind: "resident_gift_received", subject: "slime_neighbor:disliked" });
  expect(slime.affection).toBe(affectionTuning.gains.greet + affectionTuning.gains.chat + affectionTuning.gains.gift_loved + affectionTuning.gains.gift_disliked);
});

test("affection_跨档发信号_到伙伴档那天他给你起昵称_档位写回", () => {
  const slime = parked(SLIME, "slime_neighbor");
  const seen: string[] = [];
  stops.push(on("story_signal", (payload) => {
    if (payload.kind === "affection_reached") seen.push(payload.subject ?? "");
  }));

  setAffection(SLIME, affectionTuning.stageThresholds.life_companion - 1);
  expect(slime.affectionStage).toBe(AffectionStage.FamiliarResident);
  expect(slime.playerNickname).toBeUndefined();

  gainAffection(SLIME, "chat");
  expect(slime.affectionStage).toBe(AffectionStage.LifeCompanion);
  expect(slime.playerNickname).toBeTruthy();
  expect(seen).toContain("slime_neighbor:life_companion");
});

test("affection_称呼三档_陌生不叫_熟了叫名字_伙伴叫昵称_改了就用改的", () => {
  const slime = parked(SLIME, "slime_neighbor");
  const key = "talk.slime.greet.any_1"; // "{you}，你好呀……{cp}"

  expect(addressTermFor("slime_neighbor")).toBeUndefined();
  expect(talkText("slime_neighbor", key)).toBe("你好呀……嘿嘿");

  setAffection(SLIME, affectionTuning.stageThresholds.familiar_resident);
  const name = addressTermFor("slime_neighbor");
  expect(name).toBeTruthy();
  expect(talkText("slime_neighbor", key)).toBe(`${name}，你好呀……嘿嘿`);

  setAffection(SLIME, affectionTuning.stageThresholds.life_companion);
  expect(addressTermFor("slime_neighbor")).toBe(slime.playerNickname);

  setResidentAddress(SLIME, "nickname", "小软");
  expect(talkText("slime_neighbor", key)).toBe("小软，你好呀……嘿嘿");
  setResidentAddress(SLIME, "catchphrase", "嘿哟");
  expect(talkText("slime_neighbor", key)).toBe("小软，你好呀……嘿哟");
  // 空 = 清掉，退回默认
  setResidentAddress(SLIME, "catchphrase", "   ");
  expect(slime.catchphrase).toBeUndefined();
  expect(talkText("slime_neighbor", key)).toBe("小软，你好呀……嘿嘿");
});

test("affection_四个字段进存档_读回来一样_老档迁移按档位补分", () => {
  const slime = parked(SLIME, "slime_neighbor");
  setAffection(SLIME, 95);
  setResidentAddress(SLIME, "nickname", "小软");
  slime.lastGreetDayId = "2026-09-06";
  const saved = slime.toSave("yard");
  expect(saved.affection).toBe(95);
  expect(saved.playerNickname).toBe("小软");
  const back = createResidentFromSave(saved);
  expect(back.affection).toBe(95);
  expect(back.affectionStage).toBe(AffectionStage.LifeCompanion);
  expect(back.playerNickname).toBe("小软");

  // 老档：只有档位没有分
  const old = { ...saved, affection: undefined, affectionStage: AffectionStage.Family };
  const legacy = createResidentFromSave(old);
  expect(legacy.affection).toBe(affectionTuning.stageThresholds.family);

  const save = {
    meta: { saveSchemaVersion: 38 },
    ownWorld: { pets: { [SLIME]: { ...old } } },
  } as unknown as GameSave;
  const migrated = migrateSave(save);
  expect(migrated.ok).toBe(true);
  if (migrated.ok) {
    expect(migrated.save.ownWorld.pets[SLIME].affection).toBe(affectionTuning.stageThresholds.family);
  }
});

test("present_随机赠礼_伙伴档起进池_保底必中那天走过来说话_对话结束弹领取面板", () => {
  const slime = parked(SLIME, "slime_neighbor");
  setAffection(SLIME, affectionTuning.stageThresholds.life_companion);
  restoreFiredStoryRules([]);

  // 陌生档进不了池：不算错过
  const stranger = parked(residentIdOf("fox_neighbor"), "fox_neighbor");
  expect(stranger.affectionStage).toBe(AffectionStage.Stranger);

  let days = 0;
  let started = false;
  for (let i = 0; i < 10 && !started; i += 1) {
    days += 1;
    clock = { worldDayId: `2026-09-${String(6 + days).padStart(2, "0")}`, phase: "dawn" };
    emit("world_day_changed", { worldDayId: clock.worldDayId, previousWorldDayId: "x" });
    if (pendingPresents().length > 0) started = true;
  }
  expect(started).toBe(true);
  // 保底：错过几次后必中（base 0.3 + step 0.2 → 第四天封顶）
  expect(days).toBeLessThanOrEqual(4);
  expect(getPoolMisses()["resident_present"] ?? 0).toBe(0);

  // 他在往你这儿走（指令优先级）或者已经开口
  const intent = slime.currentIntent;
  const dialogue = getActiveDialogue();
  expect(intent?.skillId === "command" || dialogue?.dialogueId === "slime_gives_present").toBe(true);

  // 走到 / 到不了都会开口：推几秒
  for (let i = 0; i < 100 && !getActiveDialogue(); i += 1) slime.tick(0.1, PLAYER);
  expect(getActiveDialogue()?.dialogueId).toBe("slime_gives_present");
  expect(getPendingUnpack()).toBeNull();

  end();
  const unpack = getPendingUnpack();
  expect(unpack?.localizationKey).toBe("loot.resident_present");
  expect(unpack?.entries.map((entry) => entry.itemId)).toEqual(expect.arrayContaining([expect.any(String)]));
  expect(pendingPresents()).toEqual([]);
  removeResident(residentIdOf("fox_neighbor"));
});

test("present_家人档那天送专属家具_一次性_记忆记一笔", () => {
  const slime = parked(SLIME, "slime_neighbor");
  setAffection(SLIME, affectionTuning.stageThresholds.family);
  for (let i = 0; i < 100 && !getActiveDialogue(); i += 1) slime.tick(0.1, PLAYER);
  expect(getActiveDialogue()?.dialogueId).toBe("slime_gives_signature");
  end();
  expect(getPendingUnpack()?.entries[0]?.itemId).toBe("furniture_cloud_lamp");
  expect(slime.memories.has("gave_signature")).toBe(true);

  // 再跨一次（调分回去再上来）不会第二次送：规则 once
  dismissUnpack();
  setAffection(SLIME, 0);
  setAffection(SLIME, affectionTuning.stageThresholds.family);
  for (let i = 0; i < 30; i += 1) slime.tick(0.1, PLAYER);
  expect(getActiveDialogue()).toBeNull();
});

test("mood_几天没人理往下掉_合口味的天气往上抬_不进好感", () => {
  const slime = parked(SLIME, "slime_neighbor");
  slime.mood = 60;
  slime.lastTalkDayId = "2026-09-01";
  const affection = slime.affection;
  settleDailyMood("2026-09-06");
  expect(slime.mood).toBeLessThanOrEqual(60 - moodTuning.lonelyPenalty + moodTuning.likedWeatherBonus);
  expect(slime.affection).toBe(affection);

  // 昨天刚聊过：不算孤单
  slime.mood = 60;
  slime.lastTalkDayId = "2026-09-05";
  settleDailyMood("2026-09-06");
  expect(slime.mood).toBeGreaterThanOrEqual(60);
});

test("affection_做客时什么都不涨_也不弹输入框", () => {
  const slime = parked(SLIME, "slime_neighbor");
  setRemoteWorldActive(true);
  emit("story_signal", { kind: "resident_talked", subject: "slime_neighbor" });
  expect(gainAffection(SLIME, "chat")).toBeNull();
  expect(slime.affection).toBe(0);
  expect(setResidentAddress(SLIME, "nickname", "x")).toBe(false);
  setRemoteWorldActive(false);
  expect(getResident(SLIME)).toBeDefined();
});
