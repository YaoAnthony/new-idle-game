import {
  COMMAND_SKILL_ID,
  drawFromPool,
  evaluateHouseComments,
  findPlaceableItem,
  findResidentDefinition,
  findSkillPriority,
  hashSeed,
  houseCommentKey,
  inVisitWindow,
  residentIdOf,
  seededRandom,
  visitTuning,
  type HouseSnapshot,
} from "core";
import { hasLocalizationKey } from "../../../i18n/t";
import { emit, on } from "../../EventBus";
import { isRemoteWorld } from "../../Multiplayer/worldLock";
import { getClock } from "../../State/clock";
import { frontDoorAgent } from "../../State/doorsRuntime";
import { getWorldSeed } from "../../State/worldSeed";
import { isRandomPoolOpen } from "../randomPools";
import { getLocalParticipant } from "../../State/participants";
import { getResident, getResidents, spawnResidentAt } from "../../State/residentsRuntime";
import type { ResidentAgent } from "../../State/residentAgent";
import type { ActionStep } from "../../State/actions";
import { getCurrentMap, getWorld } from "../../State/worldRuntime";
import { isIndoors } from "../../State/world/walkable";
import { getActiveAction } from "../actions";
import { evaluateCondition, getActiveDialogue } from "../dialogue";
import { signal } from "../story";
import { nearestFreeSpot } from "./spots";

/**
 * 来访（居民系统 07）：他来你家敲门 → 你开门 → 他进来看看、坐你的椅子、说几句 → 临走送东西。
 *
 * 只对房主发生：来访日在 `day_started` 抽（保底池，运行时账），条件是你在自己屋里闲着。
 * 敲门是动词 `knock`（等你开，不开就走）；开不开门走门口那段对话（选项报告 → 规则 → `visit_admit` / `visit_refuse` 效果）。
 * 进屋之后的评论从"你家室内"的快照推（Core `evaluateHouseComments`），每位居民文案不同、条件共用。
 * 结束发 `resident_visited_player`——好感、记忆、礼物由规则接。
 */

type VisitState = {
  residentId: string;
  phase: "knocking" | "inside";
  /** 门上按 F 时门先真的打开再说话（20：剧情叫来的小鱼人）。07 的邻居没有：隔着门说 */
  opensDoor?: boolean;
};

/**
 * 剧情叫来敲门的（20，效果 knock_at_front_door）。敲下第一下时 onKnocked 从这里认出"这是剧情的"：
 * 带上 opensDoor，而且不占 07"今天来过一位"的额度——那是邻居串门的额度，不是剧情的。
 */
const storyKnockers = new Map<string, { opensDoor: boolean }>();

/**
 * 剧情敲门等多久：说是"不限时"，写成一整天。不用 Infinity——Intent 要原样发给房客的木偶，
 * JSON 里 Infinity 会变成 null，木偶那边就按默认的 45 秒走人了。
 */
const STORY_KNOCK_SECONDS = 24 * 60 * 60;

let current: VisitState | null = null;
/** 今天谁来过 / 敲过（一天最多一位；不开门也算今天来过） */
let visitedToday: { dayId: string; residentIds: Set<string> } = { dayId: "", residentIds: new Set() };
/** 今天抽中来访的那位（day_started 定，运行时） */
let visitorToday: { dayId: string; residentId: string | null } = { dayId: "", residentId: null };
let visitMisses = 0;

let clockSource: () => { worldDayId: string; minuteOfDay: number } = () => {
  const clock = getClock();
  return { worldDayId: clock.worldDayId, minuteOfDay: clock.local.minuteOfDay };
};
export function setVisitsClockSource(source: (() => { worldDayId: string; minuteOfDay: number }) | null): void {
  clockSource = source ?? (() => {
    const clock = getClock();
    return { worldDayId: clock.worldDayId, minuteOfDay: clock.local.minuteOfDay };
  });
}

function todaySet(): Set<string> {
  const { worldDayId } = clockSource();
  if (visitedToday.dayId !== worldDayId) visitedToday = { dayId: worldDayId, residentIds: new Set() };
  return visitedToday.residentIds;
}

/** 玩家在不在自己的主屋里（base 图、室内格） */
export function playerIndoors(): boolean {
  if (getCurrentMap().mapId !== "base") return false;
  const { transform } = getLocalParticipant();
  return isIndoors(transform.x, transform.y);
}

/** 现在能不能来：你在屋里、没在专注行动、时段对、今天还没人来过、没人正在来 */
export function whyCannotVisit(residentId: string, force = false): string | null {
  if (isRemoteWorld()) return "做客中";
  if (current) return "已经有人在来 / 在屋里";
  // force 是调试指令：不看时段、不看今天来过几位（否则一天只能验一次），但你得在屋里
  if (!force && todaySet().size >= visitTuning.visitsPerDay) return "今天已经来过一位";
  if (!playerIndoors()) return "你不在屋里";
  if (getActiveAction()) return "你在专注行动";
  if (!force && !inVisitWindow(clockSource().minuteOfDay)) return "不在来访时段";
  const agent = getResident(residentId);
  if (!agent || agent.puppet || agent.state === "hidden" || agent.asleep) return "他不在场 / 藏着 / 睡着";
  return null;
}

/** 今天抽中的来访者（伙伴档起、保底池）。指令 `/npc <谁> visit` 无视它 */
export function rollVisitorOfDay(worldDayId: string): string | null {
  if (isRemoteWorld()) return null;
  // 池关着（教程没做完）：今天没人来，也不攒保底
  if (!isRandomPoolOpen(visitTuning.pool.poolId)) {
    visitorToday = { dayId: worldDayId, residentId: null };
    return null;
  }
  const candidates = getResidents()
    .filter((agent) => !agent.puppet && visitTuning.requires.every((condition) => evaluateCondition(condition, agent.residentId)))
    .map((agent) => agent.residentId)
    .sort();
  if (candidates.length === 0) {
    visitorToday = { dayId: worldDayId, residentId: null };
    return null;
  }
  const pick = candidates[Math.floor(seededRandom(hashSeed(`${getWorldSeed()}|visit|${worldDayId}`))() * candidates.length)];
  const { hit, nextMisses } = drawFromPool(visitTuning.pool, [pick], visitMisses, worldDayId, getWorldSeed());
  visitMisses = hit ? 0 : nextMisses;
  visitorToday = { dayId: worldDayId, residentId: hit };
  return hit;
}

export function visitorOfDay(): string | null {
  return visitorToday.dayId === clockSource().worldDayId ? visitorToday.residentId : null;
}

/** 主屋门外一步（门的两侧里不在室内的那一侧） */
export function outsideFrontDoor(): { x: number; z: number; doorX: number; doorZ: number } | null {
  const door = frontDoorAgent();
  if (!door) return null;
  const { x, z } = door.center;
  const candidates = [
    { x, z: z + 1.3 },
    { x, z: z - 1.3 },
    { x: x + 1.3, z },
    { x: x - 1.3, z },
  ];
  const outside = candidates.find((point) => !isIndoors(point.x, point.z)) ?? candidates[0];
  return { ...outside, doorX: x, doorZ: z };
}

/** 门外站着的那位（门的 F 交互问它） */
export function visitorAtDoor(): string | null {
  return current?.phase === "knocking" ? current.residentId : null;
}

export function visitInProgress(): VisitState | null {
  return current;
}

/**
 * 他到了门外、开始敲（技能的 Intent 走到 `knock` 那一步时由身体发 `resident_knocked`，这里接）。
 * 记"今天来过"——不开门也不再来第二次。
 */
function onKnocked(residentId: string): void {
  if (isRemoteWorld()) return;
  if (current) return;
  const story = storyKnockers.get(residentId);
  current = { residentId, phase: "knocking", ...(story?.opensDoor ? { opensDoor: true } : {}) };
  if (!story) todaySet().add(residentId);
  const definitionId = getResident(residentId)?.definitionId ?? residentId.replace(/^resident-/, "");
  signal("resident_knocked", definitionId);
  emit("visit_changed", { residentId, phase: "knocking" });
}

/** 敲了没人开：他走了 */
export function giveUpKnocking(residentId: string): void {
  if (current?.residentId !== residentId || current.phase !== "knocking") return;
  current = null;
  emit("visit_changed", { residentId, phase: "left" });
}

/** 你说现在不方便 */
export function refuseVisit(residentId: string): boolean {
  if (current?.residentId !== residentId || current.phase !== "knocking") return false;
  const agent = getResident(residentId);
  current = null;
  agent?.cancelCommand();
  agent?.cancelKnock();
  const definitionId = agent?.definitionId ?? residentId.replace(/^resident-/, "");
  signal("visit_refused", definitionId);
  emit("visit_changed", { residentId, phase: "left" });
  return true;
}

/** 你家室内的快照（评论求值用） */
export function houseSnapshot(): HouseSnapshot {
  const room = getWorld().room;
  const furniture = getWorld().placedFurniture
    .filter((placed) => placed.placement.roomId === room.roomId && placed.placement.kind === "floor")
    .map((placed) => {
      const item = findPlaceableItem(placed.furnitureId);
      const footprint = item?.placement.footprint ?? { width: 1, height: 1 };
      return { furnitureId: placed.furnitureId, capabilities: item?.placement.capabilities ?? [], cells: footprint.width * footprint.height };
    });
  return { furniture, floorCells: room.floorGrid.width * room.floorGrid.height };
}

/** 这位进屋会说的几句（文案键，按顺序） */
export function houseCommentKeysFor(definitionId: string): string[] {
  return evaluateHouseComments(houseSnapshot()).map((id) => houseCommentKey(definitionId, id, hasLocalizationKey));
}

/**
 * 你开了门：门打开，他进来看看 → 找最近的空椅子坐（室内）→ 待一会儿 → 起身 → 走到门外 → 结束。
 * 每到一站说一句评论。中途你出屋、或被别的事抢走 → 提前结束（也算来过）。
 */
export function beginHouseVisit(residentId: string): boolean {
  if (isRemoteWorld()) return false;
  const agent = getResident(residentId);
  if (!agent || current?.residentId !== residentId || current.phase !== "knocking") return false;
  const door = frontDoorAgent();
  const outside = outsideFrontDoor();
  if (!door || !outside) return false;

  agent.cancelCommand();
  agent.cancelKnock();
  door.open = true;
  current = { residentId, phase: "inside" };
  emit("visit_changed", { residentId, phase: "inside" });

  const comments = houseCommentKeysFor(agent.definitionId);
  // 每到一站说一句：进门、坐下、临走。评论不够三句就临走那句省掉
  const speak = (index: number): ActionStep[] => {
    const key = comments[index];
    return key ? [{ verb: "speak", localizationKey: key, seconds: 4 }] : [];
  };

  // 室内某个可走点：门内一步再往里 1.5 米（站在门框里看家不像做客；再深就穿过小屋撞墙了）
  const doorway = { x: 2 * outside.doorX - outside.x, z: 2 * outside.doorZ - outside.z };
  const span = Math.hypot(doorway.x - outside.x, doorway.z - outside.z) || 1;
  const deeper = { x: doorway.x + ((doorway.x - outside.x) / span) * 1.5, z: doorway.z + ((doorway.z - outside.z) / span) * 1.5 };
  const inside = agent.findSpotNear(deeper.x, deeper.z, 1.2) ?? doorway;
  const seat = nearestFreeSpot("seat", { x: inside.x, z: inside.z, residentId, scope: "indoor" });
  const [stayMin, stayMax] = visitTuning.staySeconds;
  const stay = stayMin + seededRandom(hashSeed(`stay|${residentId}|${clockSource().worldDayId}`))() * (stayMax - stayMin);

  /*
   * 评论是 `speak` 步夹在串行动词之间（speak 是并行动词，走到那一步就说、不停留）。
   * 第一版靠 onArrive 说——它只在**最后一个** walk_to 到达时调一次，结果进门、坐下都没话，
   * 临走才冒一句。
   */
  const steps: ActionStep[] = [
    { verb: "walk_to", x: inside.x, z: inside.z, state: "approach" },
    ...speak(0),
    { verb: "stand", seconds: visitTuning.lookAroundSeconds, flavor: "browsing" },
  ];
  const stand = seat ? agent.findSpotNear(seat.x, seat.z, seat.reach + agent.radius) : null;
  if (seat && stand) {
    steps.push({ verb: "walk_to", x: stand.x, z: stand.z, state: "approach" });
    steps.push({ verb: "sit", facing: { x: seat.faceX, z: seat.faceZ }, seconds: stay });
    steps.push(...speak(1));
  } else {
    steps.push(...speak(1));
    steps.push({ verb: "stand", seconds: stay });
  }
  steps.push(...speak(2));
  steps.push({ verb: "stand", seconds: 2 });
  steps.push({ verb: "walk_to", x: outside.x, z: outside.z, state: "approach" });

  const finish = (reason: "done" | "interrupted"): void => {
    if (current?.residentId !== residentId) return;
    current = null;
    door.open = false;
    emit("visit_changed", { residentId, phase: "left", reason });
    signal("resident_visited_player", agent.definitionId);
  };
  const start = (): void => {
    if (current?.residentId !== residentId || current.phase !== "inside") return;
    agent.cancelCommand();
    const accepted = agent.perform({
      skillId: COMMAND_SKILL_ID,
      priority: findSkillPriority(COMMAND_SKILL_ID)?.priority ?? 1000,
      interruptible: false,
      steps,
      idleAfter: 1,
      onDone: () => finish("done"),
      onInterrupted: () => finish("interrupted"),
    });
    if (!accepted) finish("interrupted");
  };

  /*
   * "进来吧"是对话里的选项，选完对话还有一句才关。对话开着的每一拍 talk 系统都会
   * 重新下"面向玩家"的指令（同为指令优先级，会把这条来访 Intent 抢掉——第一版就是
   * 这样：选完进来他站在门外不动、来访状态已被 onInterrupted 清空）。所以对话开着
   * 就等它关了再起步：门先开、状态先记"在屋里"，人随对话结束那一拍进门。
   * 用 microtask 而不是直接在监听里起步：talk 系统在关对话那一拍会 cancelCommand，
   * 监听顺序不该是这里的正确性前提。
   */
  if (getActiveDialogue()) {
    const off = on("dialogue_changed", ({ open }) => {
      if (open) return;
      off();
      queueMicrotask(start);
    });
  } else {
    start();
  }
  return true;
}

/** 你走出主屋 / 换图：他说一句先回去了，提前结束 */
function onPlayerLeftHouse(): void {
  if (current?.phase !== "inside") return;
  const agent = getResident(current.residentId);
  if (!agent) return;
  agent.say("talk.common.visit_cut", 3);
  agent.cancelCommand();
}

let detach: (() => void) | null = null;

export function startVisitSystem(): () => void {
  if (detach) return detach;
  const offDay = on("world_day_changed", ({ worldDayId }) => rollVisitorOfDay(worldDayId));
  const offKnock = on("resident_knocked", ({ residentId }) => onKnocked(residentId));
  const offGaveUp = on("resident_changed", ({ residentId, reason }) => {
    if (reason === "knock_timeout") giveUpKnocking(residentId);
  });
  const offMap = on("map_changed", () => onPlayerLeftHouse());
  const timer = setInterval(() => {
    if (current?.phase === "inside" && !playerIndoors()) onPlayerLeftHouse();
  }, 1000);
  detach = () => {
    offDay();
    offKnock();
    offGaveUp();
    offMap();
    clearInterval(timer);
    current = null;
    detach = null;
  };
  return detach;
}

/** 用例用 */
export function resetVisits(): void {
  current = null;
  storyKnockers.clear();
  visitedToday = { dayId: "", residentIds: new Set() };
  visitorToday = { dayId: "", residentId: null };
  visitMisses = 0;
}

/** 指令：立即来访（无视时段与抽签，但仍要求你在屋里）。返回不能来的原因 */
export function forceVisit(residentId: string): string | null {
  const why = whyCannotVisit(residentId, true);
  if (why) return why;
  visitorToday = { dayId: clockSource().worldDayId, residentId };
  const agent = getResident(residentId)!;
  const outside = outsideFrontDoor();
  if (!outside) return "没有主屋的门";
  const accepted = agent.perform(knockIntent(agent, outside));
  return accepted ? null : "他不肯来";
}

/**
 * 敲门站哪儿：沿门朝外，离门心 = 门的自动开半径 + 他的半径 + 一点余量（至少还是门外那一步）。
 *
 * 原来就站 `outsideFrontDoor` 那一步（离门心 1.3 米）。门的自动开量的是**体表**离门心多远（大门 1.2），
 * 半径 0.3 的咕噜站过去体表离门 1.0——门没锁的时候他一站定门就自己开了，"敲门等你开"成了
 * "门自己开了他还在敲"。从门的半径和他的身体推出来，换多大的家伙都不用回来调这个数。
 */
export function knockSpot(
  agent: { radius: number },
  outside: { x: number; z: number; doorX: number; doorZ: number },
): { x: number; z: number } {
  const openRadius = frontDoorAgent()?.definition.behavior?.autoOpenRadius ?? 0;
  const dx = outside.x - outside.doorX;
  const dz = outside.z - outside.doorZ;
  const step = Math.hypot(dx, dz) || 1;
  const distance = Math.max(step, openRadius + agent.radius + visitTuning.knockStandClearance);
  return { x: outside.doorX + (dx / step) * distance, z: outside.doorZ + (dz / step) * distance };
}

/** 走到门外敲门的 Intent（技能和指令共用） */
export function knockIntent(
  agent: ResidentAgent,
  outside: { x: number; z: number; doorX: number; doorZ: number },
): import("../../State/actions").Intent {
  const spot = knockSpot(agent, outside);
  return {
    skillId: "visitPlayer",
    priority: findSkillPriority("visitPlayer")?.priority ?? 50,
    interruptible: true,
    steps: [
      { verb: "walk_to", x: spot.x, z: spot.z, state: "approach" },
      {
        verb: "knock",
        seconds: visitTuning.knockWaitSeconds,
        every: visitTuning.knockRepeatSeconds,
        facing: { x: outside.doorX, z: outside.doorZ },
      },
    ],
    idleAfter: 2,
    onInterrupted: () => giveUpKnocking(agent.residentId),
  };
}

/**
 * 剧情叫他来门口敲门（居民系统 20，效果 knock_at_front_door）。
 *
 * 和 07 的来访是两个入口、同一个敲门动作：不看时段、不看你在不在屋里、不占"今天来过一位"——
 * 剧情说此刻有人敲门，就是此刻。不在场就直接生成在敲门站位上（用户定：不从桥头走过来），
 * 在场就走过去。指令优先级、不限时，敲到有人开为止。
 *
 * **幂等**：已经在门口敲着就什么都不做——"读档接着演"的规则会反复发它。
 * 门口正有邻居在来访就先不来（返回 false），等下一次信号（次日早上 / 读档）再叫。
 */
export function knockAtFrontDoor(residentId: string, options: { opensDoor?: boolean } = {}): boolean {
  if (isRemoteWorld()) return false;
  if (current?.residentId === residentId && current.phase === "knocking") return true;
  if (current) return false;
  // 主屋的门在 base 图上；人在镇上时不叫，回到这张图的信号会再叫一次
  if (getCurrentMap().mapId !== "base") return false;
  const outside = outsideFrontDoor();
  if (!outside) return false;

  storyKnockers.set(residentId, { opensDoor: options.opensDoor ?? false });
  let agent = getResident(residentId);
  if (!agent) {
    const definitionId = residentDefinitionIdOf(residentId);
    const at = knockSpot({ radius: findResidentDefinition(definitionId)?.collisionRadius ?? 0 }, outside);
    agent = spawnResidentAt(residentId, definitionId, at, at);
  }
  const at = knockSpot(agent, outside);
  const knock = {
    verb: "knock",
    seconds: STORY_KNOCK_SECONDS,
    every: visitTuning.knockRepeatSeconds,
    facing: { x: outside.doorX, z: outside.doorZ },
  } as const;
  const perform = (steps: import("../../State/actions").ActionStep[]): boolean =>
    agent.perform({
      skillId: COMMAND_SKILL_ID,
      priority: findSkillPriority(COMMAND_SKILL_ID)?.priority ?? 1000,
      interruptible: false,
      steps,
      idleAfter: 1,
    });

  perform([{ verb: "walk_to", x: at.x, z: at.z, state: "approach" }, knock]);
  if (agent.currentIntent) return true;
  /*
   * walk_to 当场作废了：要么已经站在站位那一格上（刚生成在这儿、读档回来原地没动——寻路对"原地"
   * 排不出两点的路，整条 Intent 就被丢掉），要么真的排不出路。两种都直接站到门口敲：
   * 一个在摊位边对着空气敲门的商人，比一次挪位糟得多（spawnResidentAt"走不到就落在驻地"同一个规矩）。
   */
  agent.debugPlace(at.x, at.z);
  perform([knock]);
  return agent.currentIntent !== null;
}

/** 剧情那边收场（20）：敲门状态清掉、身上的 knock 撤掉。之后他去哪由调用方下指令 */
export function finishStoryKnock(residentId: string): void {
  storyKnockers.delete(residentId);
  if (current?.residentId === residentId) {
    current = null;
    emit("visit_changed", { residentId, phase: "left", reason: "story" });
  }
  getResident(residentId)?.cancelKnock();
}

export function residentDefinitionIdOf(residentId: string): string {
  return getResident(residentId)?.definitionId ?? residentId.replace(/^resident-/, "");
}

export function residentIdFor(definitionId: string): string {
  return residentIdOf(definitionId);
}
