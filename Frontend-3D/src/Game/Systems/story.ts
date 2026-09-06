import {
  drawFromPool,
  mailTuning,
  findStoryPool,
  signalCountKeysFor,
  storyRules,
  triggerMatches,
  type StoryContext,
  type StoryRule,
  type StorySignal,
  type StoryEffect,
} from "core";
import { emit, on } from "../EventBus";
import { isRemoteWorld } from "../Multiplayer/worldLock";
import { getClock } from "../State/clock";
import { depositGoldTo, takeGoldUpTo } from "../State/gold";
import { addItem, getCounts, removeItem } from "../State/inventory";
import { getResident, setResidentAffection, spawnResident } from "../State/residentsRuntime";
import { getWeather } from "../State/weather";
import { startDialogue } from "./dialogue";
import { gainAffection } from "./residents/affection";
import { giveResidentPresent } from "./residents/presents";
import { declineFavor } from "./residents/favors";
import { placeOnPorch, setNamePlate } from "./residents/porch";
import { placeInInterior } from "./residents/interiors";
import { spawnVisitor } from "./residents/visitors";
import { grantTripGift, planTrip } from "./residents/trips";
import { deliverLetter, mailboxFull, sendResidentLetter } from "./mail";
import { pickPresentFor } from "./residents/presents";
import { beginHouseVisit, refuseVisit } from "./residents/visits";
import { presentItems } from "./unpack";
import { getEventStage, isFeatureUnlocked, setEventStage, unlockFeature } from "./events";

/**
 * 剧情解释器。剧情内容全部来自 Core 的 storyRules 注册表，
 * 这里只负责"匹配触发器 → 执行效果"，不含任何具体剧情分支。
 *
 * 玩法系统只管发信号（emit("story_signal", {...})），不知道剧情的存在；
 * 剧情规则声明关心哪些信号。两边完全解耦。
 */

const firedRules = new Set<string>();

/**
 * 有没有挡视线的面板开着（工作台/背包这类）。
 *
 * 宠物登场是"制作完之后突然出现"的突发事件，如果在玩家还盯着工作台面板时
 * 就蹦出来，过场被面板挡住、也没有"突然"可言。所以延迟登场要**先等面板关掉**
 * 再开始计时。这里只订阅 EventBus 的事件，不知道 React 的存在。
 */
let blockingPanelOpen = false;

/** 等到没有面板挡着再执行；已经空着就直接跑 */
function whenPanelsClear(run: () => void): void {
  if (!blockingPanelOpen) return run();

  const poll = setInterval(() => {
    if (blockingPanelOpen) return;
    clearInterval(poll);
    run();
  }, 250);
}

/**
 * 各信号累计发生过多少次。`signalCount` 触发条件查它。
 *
 * 进存档：关掉游戏再打开，「已经做完的两个任务」不该白做。
 */
let signalCounts: Record<string, number> = {};

/**
 * 判定要用到的外部状态，每次派发现取。
 *
 * 判定本身在 Core（logic/storyTriggers）——那是规则不是表现，
 * 联机时服务端要用同一份校验访客报上来的推进。
 */
function currentContext(): StoryContext {
  /*
   * **一次派发看到的是同一份世界快照**（2026-08-24，用例抓出来的真缺陷）。
   *
   * eventStage / isFeatureUnlocked 原来直接递实时函数，于是同一次
   * day_started 里：偷窃规则把阶段推到 robbed，**下一条**规则的
   * requiresEventStage 立刻看到 robbed 也跟着触发——五幕在一天里连锁
   * 跑完，"一天一步"整个塌掉。剧情能等，玩家一天只该看一幕。
   *
   * 修法是派发内 memo：每个 eventId / featureId 第一次被问时取实时值，
   * 之后同一次派发里永远答同一个数。**要连锁请用两条信号**，
   * 那才是作者显式写出来的意图。
   */
  const stageCache = new Map<string, string | null>();
  const featureCache = new Map<string, boolean>();
  return {
    worldDayId: getClock().worldDayId,
    weatherId: getWeather().id,
    itemCounts: getCounts(),
    signalCounts,
    eventStage: (eventId) => {
      if (!stageCache.has(eventId)) stageCache.set(eventId, getEventStage(eventId));
      return stageCache.get(eventId) ?? null;
    },
    isFeatureUnlocked: (featureId) => {
      if (!featureCache.has(featureId)) featureCache.set(featureId, isFeatureUnlocked(featureId));
      return featureCache.get(featureId) ?? false;
    },
    // 04：requiresAffection 看的是档位；人不在场 = 不成立
    affectionStage: (residentId) => getResident(residentId)?.affectionStage ?? null,
  };
}

function runEffect(effect: StoryEffect): void {
  switch (effect.kind) {
    case "set_event_stage":
      setEventStage(
        effect.eventId,
        effect.stageId,
        effect.complete ? "completed" : "active",
      );
      break;

    case "set_affection":
      setResidentAffection(effect.residentId, effect.stage);
      break;

    case "unlock_feature":
      unlockFeature(effect.featureId);
      break;

    case "give_item":
      addItem(effect.itemId, effect.quantity);
      break;

    case "consume_item":
      removeItem(effect.itemId, effect.quantity);
      break;

    case "spawn_resident": {
      const { residentId, definitionId, delayMs = 0, jitterMs = 0 } = effect;
      const wait = delayMs + Math.random() * jitterMs;

      // 先等面板关掉，再等这段时间——"突然出现"要发生在玩家看得见屋子的时候
      whenPanelsClear(() => {
        if (wait > 0) setTimeout(() => spawnResident(residentId, definitionId), wait);
        else spawnResident(residentId, definitionId);
      });
      break;
    }

    case "start_dialogue": {
      const run = () =>
        startDialogue(effect.dialogueId, effect.residentId ?? null);
      if (effect.delayMs) setTimeout(run, effect.delayMs);
      else run();
      break;
    }

    // 睡/醒终归是宠物自己的状态，剧情只负责喊一声"该醒了/该睡了"
    case "resident_wake":
      getResident(effect.residentId)?.wakeUp();
      break;

    case "resident_sleep":
      getResident(effect.residentId)?.fallAsleep();
      break;

    case "show_toast":
      emit("story_toast", {
        localizationKey: effect.localizationKey,
        durationMs: effect.durationMs ?? 6000,
      });
      break;

    // 好感唯一的加分口（04）。一天一次的节流、跨档信号都在 gainAffection 里
    case "adjust_affection":
      gainAffection(effect.residentId, effect.source);
      break;

    // 他走过来送你东西（04）：随机赠礼 / 专属家具同一条路
    case "resident_present":
      giveResidentPresent(effect.residentId, effect.dialogueId, effect.itemId);
      break;

    // 委托奖励经领取面板（05）。做客时不给：那是房主的委托
    case "grant_items":
      if (!isRemoteWorld()) presentItems(effect.localizationKey, effect.items.map((entry) => ({ itemId: entry.itemId, quantity: entry.quantity })));
      break;

    // 对话里拒绝了委托（05）：直接过期，不进 cooldown
    case "favor_decline":
      declineFavor(effect.favorId);
      break;

    // 来访（07）：开门放人 / 回绝
    case "visit_admit":
      beginHouseVisit(effect.residentId);
      break;
    case "visit_refuse":
      refuseVisit(effect.residentId);
      break;

    // 门口展示位 / 门牌（07）：只有这里写
    case "porch_place":
      placeOnPorch(effect.residentId, effect.itemId);
      break;
    case "porch_nameplate":
      setNamePlate(effect.residentId, true);
      break;
    // 屋里的槽位（08）：有室内进屋，没有退回门口——interiors 自己判
    case "interior_place":
      placeInInterior(effect.residentId, effect.itemId);
      break;

    // ---- 访客与出门（09）----
    case "spawn_visitor":
      // 等面板关掉再来：和 spawn_resident 一样，"桥头站着个人"要发生在玩家看得见的时候
      whenPanelsClear(() => spawnVisitor());
      break;
    case "reset_pool":
      poolMisses[effect.poolId] = 0;
      break;
    case "visitor_invited": {
      const definitionId = getResident(effect.residentId)?.definitionId;
      if (definitionId) signal("visitor_invited", definitionId);
      break;
    }
    case "plan_trip":
      planTrip(effect.residentId, effect.tripId);
      break;
    case "grant_trip_gift":
      grantTripGift(effect.residentId);
      break;

    // ---- 信箱（10）----
    case "send_letter":
      deliverLetter(effect.letterId, { fromResidentId: effect.fromResidentId, attach: effect.attach });
      break;
    case "send_resident_letter":
      // 信箱满了不寄，池的 miss 也别累加（不然回来一开箱 20 封同一天的）
      if (mailboxFull()) poolMisses[mailTuningPoolId()] = 0;
      else sendResidentLetter(effect.residentId);
      break;

    // 来访临走的礼物（07）：从他的 presents 里挑，不用再走过来
    case "grant_present": {
      if (isRemoteWorld()) break;
      const definitionId = getResident(effect.residentId)?.definitionId;
      const itemId = definitionId ? pickPresentFor(definitionId, getClock().worldDayId) : undefined;
      if (itemId) presentItems("loot.resident_present", [{ itemId, quantity: 1 }]);
      break;
    }

    // 改称呼的输入框（04）。做客时不弹：那是房主的邻居
    case "prompt_text":
      if (!isRemoteWorld()) emit("text_prompt_requested", { residentId: effect.residentId, target: effect.target });
      break;

    // 记忆唯一的写入口（03）。做客时剧情系统本来就不跑；人不在场就丢掉——
    // 不在场的人没经历这件事，"记得"就不成立
    case "add_memory":
      getResident(effect.residentId)?.remember(effect.memoryId);
      break;

    case "adjust_gold":
      // 正数入库照常走溢出规则；负数"扣到底为止"（被偷的语义，
      // 不是买东西的全有或全无）。做客守卫在 gold.ts 那两个函数里
      if (effect.amount > 0) depositGoldTo(effect.amount);
      else if (effect.amount < 0) takeGoldUpTo(-effect.amount);
      break;
  }
}

/**
 * 各抽签池"连续错过了几次"。进存档——不进的话读一次档保底就归零，
 * 玩家重开游戏就能把等待重置。
 */
let poolMisses: Record<string, number> = {};

function mailTuningPoolId(): string {
  return mailTuning.pool.poolId;
}

function fire(rule: StoryRule): void {
  firedRules.add(rule.id);
  for (const effect of rule.effects) runEffect(effect);
}

function handleSignal(signal: StorySignal): void {
  /**
   * **先计数再派发**。顺序反了的话 `signalCount: 1` 要等到第二次才成立——
   * "做完一个任务"这种最常见的写法会整体差一拍。
   */
  for (const key of signalCountKeysFor(signal)) {
    signalCounts[key] = (signalCounts[key] ?? 0) + 1;
  }

  const context = currentContext();

  /*
   * 派发分两段：不进池的照旧一条条判；进池的按 poolId 分组，一组
   * 一次掷点（同一天最多命中一条——三位邻居不该同一天全来）。
   *
   * 一条规则算不算"进池"，看的是**这次匹配上的那个 trigger** 有没有
   * poolId——同一条规则可以有两个 trigger，一个走池一个不走。
   */
  const pooled = new Map<string, StoryRule[]>();

  for (const rule of storyRules) {
    if ((rule.once ?? true) && firedRules.has(rule.id)) continue;
    const hit = rule.triggers.find((trigger) =>
      triggerMatches(trigger, signal, context),
    );
    if (!hit) continue;

    if (hit.poolId) {
      const group = pooled.get(hit.poolId) ?? [];
      group.push(rule);
      pooled.set(hit.poolId, group);
    } else {
      fire(rule);
    }
  }

  /*
   * 池结算。**候选为空的池根本不在 pooled 里**，所以"错过"只在真有
   * 候选时才累积——门槛没满足的那些天不攒保底，否则条件满足那天
   * 保底已满、邻居当场就来，"过几天会有人来"的节奏被吃掉。
   */
  for (const [poolId, candidates] of pooled) {
    const pool = findStoryPool(poolId);
    if (!pool) {
      // 池没登记 = 数据写错了。auditStoryContent 开机会报；这里不静默
      if (import.meta.env.DEV) {
        console.warn(
          `[story] 池 "${poolId}" 没有登记，${candidates.length} 条规则不会触发`,
        );
      }
      continue;
    }

    const { hit, nextMisses } = drawFromPool(
      pool,
      candidates,
      poolMisses[poolId] ?? 0,
      context.worldDayId,
    );
    poolMisses[poolId] = nextMisses;
    if (hit) fire(hit);
  }
}

/**
 * 按 id 直接点火一条规则，**跳过所有触发条件**（含池）。
 *
 * 只给调试指令用（`/rule`）——用户定的"命令行能指定具名加入"落到实现
 * 上就是它：期 4 之后 `/rule resident_slime_arrives` 让史莱姆当场来。
 * `once` 照常生效：已经触发过的一次性规则返回 "already_fired"，
 * 想重演先清存档，别给调试口开重放后门。
 */
export function fireStoryRuleById(
  ruleId: string,
): "fired" | "already_fired" | "unknown" {
  const rule = storyRules.find((item) => item.id === ruleId);
  if (!rule) return "unknown";
  if ((rule.once ?? true) && firedRules.has(rule.id)) return "already_fired";
  fire(rule);
  return "fired";
}

// ---- 存档 ----
//
// 已触发过的规则必须入档，否则读档后 once 重新成立，
// 开场提示和灰灰登场会再演一遍。

export function getFiredStoryRuleIds(): string[] {
  return [...firedRules];
}

export function restoreFiredStoryRules(ids: string[]): void {
  firedRules.clear();
  for (const id of ids) firedRules.add(id);
}

export function getSignalCounts(): Record<string, number> {
  return { ...signalCounts };
}

/** 老存档没有这一段 → 从零开始数，不需要迁移 */
export function restoreSignalCounts(
  counts: Record<string, number> | undefined,
): void {
  signalCounts = { ...(counts ?? {}) };
}

export function getPoolMisses(): Record<string, number> {
  return { ...poolMisses };
}

/** 老存档没有这一段 → 从零开始数，不需要迁移 */
export function restorePoolMisses(
  misses: Record<string, number> | undefined,
): void {
  poolMisses = { ...(misses ?? {}) };
}

let detach: (() => void) | null = null;

/**
 * 挂上信号监听。整个应用只调一次。
 *
 * `emitGameStarted` 在读档进入时传 false——存档里的剧情已经推进过了，
 * 不该把"终于搬进来了"再播一遍。
 */
export function startStorySystem(emitGameStarted = true): () => void {
  if (detach) return detach;

  const off = on("story_signal", handleSignal);
  const offPanel = on("blocking_panel_changed", ({ open }) => {
    blockingPanelOpen = open;
  });

  /*
   * 把三个玩法事件翻译成剧情信号。
   *
   * 放在这里而不是让玩法系统自己调 `signal()`：本文件头上那句
   * "玩法系统不知道剧情的存在"才算真的成立，而且 State/buildings.ts
   * 不必 import 本模块（那会是 State → Systems → State 的循环）。
   * `resident_moved_in` 的发射点在居民那一期——搬入这个动作那时才存在。
   */
  const offDay = on("world_day_changed", () => signal("day_started"));
  const offBuilt = on("building_completed", ({ buildingId }) =>
    signal("building_completed", buildingId),
  );
  const offMap = on("map_changed", ({ mapId }) => signal("map_entered", mapId));

  detach = () => {
    off();
    offPanel();
    offDay();
    offBuilt();
    offMap();
    blockingPanelOpen = false;
    detach = null;
  };

  // 开场信号：让"搬进新家"这类规则有机会触发
  if (emitGameStarted) emit("story_signal", { kind: "game_started" });
  return detach;
}

/** 玩法系统发信号的统一入口 */
export function signal(
  kind: StorySignal["kind"],
  subject?: string,
): void {
  emit("story_signal", { kind, subject });
}
