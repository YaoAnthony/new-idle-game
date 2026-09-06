import {
  findPersonality,
  findResidentDefinition,
  planRoutine,
  resolvePersonality,
  secondsUntil,
  type ResolvedPersonality,
  type RoutinePlan,
  type SpotKind,
} from "core";
import { getClock } from "../clock";
import { getWeather } from "../weather";
import { getCurrentMap } from "../worldRuntime";
import { mapDefinitions } from "../../../Maps/index";
import { signal } from "../../Systems/story";
import {
  claimSpot,
  homeDoorstepOf,
  homeSpotOf,
  nearestFreeSpot,
  releaseSpot,
  visitorEntryOf,
  type Spot,
} from "../../Systems/residents/spots";
import { leaveForTown } from "../../Systems/residents/townTrips";
import { isSickOn } from "../../Systems/residents/favors";
import { priorityOf, type ResidentAgent } from "../residentAgent";
import type { ActionStep, Intent } from "../actions";
import type { Skill } from "./types";

/**
 * 作息技能（居民系统 02）：性格表说"这一刻该干什么"（Core `planRoutine`），
 * 这里把它翻成动词：去哪、到了做什么。挂在三位居民的子类上。
 *
 * - 决策**不改世界**：占座在 `onArrive`、放座在 `onInterrupted` / `onDone`。
 * - 同一个计划不重复下：正在做同一件事（同一把椅子、同一段睡觉）就答 null。
 * - 藏着（在屋里）的时候照样被问（`worksWhileHidden`）——早上要它自己出门。
 * - 木偶不跑（身体那层就不问技能）。
 */

/** 性格解析结果缓存一次；tick 是热路径 */
const resolvedCache = new Map<string, ResolvedPersonality>();

function personalityOf(agent: ResidentAgent): ResolvedPersonality | null {
  const definition = findResidentDefinition(agent.definitionId);
  const id = definition?.personalityId;
  if (!id) return null;
  let resolved = resolvedCache.get(id);
  if (!resolved) {
    const raw = findPersonality(id);
    if (!raw) return null;
    resolved = resolvePersonality(raw);
    resolvedCache.set(id, resolved);
  }
  return resolved;
}

/** 给别的技能（greet 读招呼距离）用的同一份解析结果 */
export function resolvedPersonalityOf(agent: ResidentAgent): ResolvedPersonality | null {
  return personalityOf(agent);
}

/** 每只正在执行的计划键，用来判"还是同一件事" */
const activePlanKey = new WeakMap<ResidentAgent, string>();

/** 用例可以换掉时钟和天气来源，不用真的拨表 */
let clockSource: () => { minuteOfDay: number; worldDayId: string } = () => {
  const clock = getClock();
  return { minuteOfDay: clock.local.minuteOfDay, worldDayId: clock.worldDayId };
};
let weatherSource: () => string = () => getWeather().kind;

export function setRoutineClockSource(source: (() => { minuteOfDay: number; worldDayId: string }) | null): void {
  clockSource = source ?? (() => {
    const clock = getClock();
    return { minuteOfDay: clock.local.minuteOfDay, worldDayId: clock.worldDayId };
  });
}

export function setRoutineWeatherSource(source: (() => string) | null): void {
  weatherSource = source ?? (() => getWeather().kind);
}

/** 此刻的计划（指令打印用） */
export function routinePlanOf(agent: ResidentAgent): { personality: ResolvedPersonality; plan: RoutinePlan; nowMinute: number } | null {
  const personality = personalityOf(agent);
  if (!personality) return null;
  const { minuteOfDay, worldDayId } = clockSource();
  const planned = planRoutine(personality, { nowMinute: minuteOfDay, weatherKind: weatherSource(), worldDayId });
  return {
    personality,
    plan: isSickOn(agent, worldDayId) && planned.kind !== "sleep_home" ? { kind: "stay_home" } : planned,
    nowMinute: minuteOfDay,
  };
}

const ROAM_WALK_STATE = "wander" as const;

/**
 * 回家的几步（08 起两条路）：
 * - 房子有室内 → **真的走进去**，走到窝那儿（A* 直接排到屋里；门是他自己家的，走到跟前自动开）。
 *   藏着的（老档 / 老路）先 `show`。
 * - 没有室内（l1 壳子、施工中）→ 02 的老路：走到门口，调用方再 `hide`。
 * 指令 `/npc <谁> home` 也走它。
 */
export function homeSteps(agent: ResidentAgent): ActionStep[] | null {
  const spot = homeSpotOf(agent.definitionId);
  if (spot) {
    const steps: ActionStep[] = [];
    if (agent.state === "hidden") steps.push({ verb: "show" });
    if (Math.hypot(agent.x - spot.x, agent.z - spot.z) > 0.35) steps.push({ verb: "walk_to", x: spot.x, z: spot.z });
    return steps;
  }
  const door = homeDoorstepOf(agent.definitionId);
  if (!door) return null;
  const steps: ActionStep[] = [];
  const there = Math.hypot(agent.x - door.x, agent.z - door.z) <= 1.2;
  if (!there) steps.push({ verb: "walk_to", x: door.x, z: door.z });
  return steps;
}

function intentOf(agent: ResidentAgent, steps: ActionStep[], extra: Partial<Intent> = {}): Intent {
  return {
    skillId: "routine",
    priority: priorityOf("routine"),
    interruptible: true,
    steps,
    idleAfter: 1,
    ...extra,
    onDone: (body) => {
      activePlanKey.delete(agent);
      extra.onDone?.(body);
    },
    onInterrupted: (body) => {
      activePlanKey.delete(agent);
      extra.onInterrupted?.(body);
    },
  };
}

function visitIntent(agent: ResidentAgent, spot: Spot, plan: Extract<RoutinePlan, { kind: "visit" }>): Intent | null {
  const stand = agent.findSpotNear(spot.x, spot.z, spot.reach + agent.radius);
  if (!stand) return null;
  const facing = { x: spot.faceX, z: spot.faceZ };
  const steps: ActionStep[] = [{ verb: "walk_to", x: stand.x, z: stand.z, speedScale: plan.speedScale, state: ROAM_WALK_STATE }];
  if (spot.kind === "seat") {
    steps.push({ verb: "sit", facing, seconds: 3600 });
  } else if (spot.kind === "water") {
    steps.push({ verb: "stand", seconds: 6, facing, flavor: "drawing" });
    steps.push({ verb: "stand", seconds: 20 + Math.random() * 40, facing });
  } else if (spot.kind === "shop") {
    // 货架上有货 → 站得久一倍
    steps.push({ verb: "stand", seconds: (40 + Math.random() * 40) * (spot.stocked ? 2 : 1), facing, flavor: "browsing" });
  } else {
    steps.push({ verb: "stand", seconds: 30 + Math.random() * 30, facing, flavor: "browsing" });
  }
  return intentOf(agent, steps, {
    idleAfter: 2,
    onArrive: () => {
      if (!claimSpot(spot.key, agent.residentId)) return false;
      signal("resident_used_spot", spot.kind);
      return true;
    },
    onDone: () => releaseSpot(spot.key, agent.residentId),
    onInterrupted: () => releaseSpot(spot.key, agent.residentId),
  });
}

export const routineSkill: Skill = {
  id: "routine",
  worksWhileHidden: true,
  decide: ({ agent, current }) => {
    const personality = personalityOf(agent);
    if (!personality) return null;

    const { minuteOfDay, worldDayId } = clockSource();
    // 病着（05 的 sick 委托）：不管性格表说什么，整天待在家醒着；睡觉时段照睡
    const planned = planRoutine(personality, { nowMinute: minuteOfDay, weatherKind: weatherSource(), worldDayId });
    const plan: RoutinePlan = isSickOn(agent, worldDayId) && planned.kind !== "sleep_home" ? { kind: "stay_home" } : planned;

    // "同一件事"就不重下。键里带场所种类，换段就换键；睡觉的键带日期，第二天重新判
    const baseKey = plan.kind === "visit" ? `visit:${plan.spot}` : plan.kind === "town" ? `town:${worldDayId}` : plan.kind;
    if (current?.skillId === "routine" && activePlanKey.get(agent) === baseKey) return null;
    // 别人的 Intent 在做（needs 吃到一半、指令）：优先级由身体裁决，这里照常给

    const hidden = agent.state === "hidden";
    let intent: Intent | null = null;

    switch (plan.kind) {
      case "sleep_home":
      case "stay_home": {
        const steps = homeSteps(agent);
        if (!steps) return null;
        const nest = homeSpotOf(agent.definitionId);
        // 没有室内：进门 = hide（02）；有室内：人已经在窝那儿，睡 / 坐着待
        if (!nest && !hidden) steps.push({ verb: "hide" });
        if (plan.kind === "sleep_home") {
          steps.push({ verb: "sleep", seconds: Math.max(60, secondsUntil(minuteOfDay, personality.wakeAt)) });
        } else if (nest) {
          steps.push({ verb: "sit", facing: { x: nest.faceX, z: nest.faceZ }, seconds: 3600 });
        } else {
          steps.push({ verb: "stand", seconds: 3600, state: "idle" });
        }
        // 睡着了不该被 approach 叫起来；指令仍能
        intent = intentOf(agent, steps, { interruptible: plan.kind !== "sleep_home", idleAfter: 0.5 });
        break;
      }
      case "watch_rain": {
        const door = homeDoorstepOf(agent.definitionId);
        if (!door) return null;
        const steps: ActionStep[] = hidden ? [{ verb: "show" }] : [];
        if (Math.hypot(agent.x - door.x, agent.z - door.z) > 1.2) steps.push({ verb: "walk_to", x: door.x, z: door.z });
        // 站在屋檐下面朝院子：背对门（门在正面，院子在门外）
        steps.push({ verb: "stand", seconds: 3600, flavor: "watching" });
        intent = intentOf(agent, steps);
        break;
      }
      case "town": {
        const entry = visitorEntryOf(getCurrentMap().mapId, mapDefinitions);
        const stand = agent.findSpotNear(entry.x, entry.z, 1.5 + agent.radius);
        if (!stand) return null;
        const steps: ActionStep[] = hidden ? [{ verb: "show" }] : [];
        steps.push({ verb: "walk_to", x: stand.x, z: stand.z });
        const backAt = plan.backAt;
        intent = intentOf(agent, steps, {
          onArrive: () => {
            leaveForTown(agent.residentId, backAt);
            return true;
          },
        });
        break;
      }
      case "hang_home": {
        const nest = homeSpotOf(agent.definitionId);
        if (nest) {
          // 08：有室内 = 在屋里的窝上坐一会儿，起来让 wander 转一圈（圆心是家），再回来坐
          const steps = homeSteps(agent) ?? [];
          steps.push({ verb: "sit", facing: { x: nest.faceX, z: nest.faceZ }, seconds: 600 + Math.random() * 600 });
          intent = intentOf(agent, steps, { idleAfter: 20 + Math.random() * 40 });
          break;
        }
        // 门口转圈是 wander 的事（圆心就是家门口）。藏着的先出来
        if (!hidden) return null;
        intent = intentOf(agent, [{ verb: "show" }, { verb: "gesture", gestureId: "stretch" }], { idleAfter: 0.5 });
        break;
      }
      case "visit": {
        const spot = nearestFreeSpot(plan.spot as SpotKind, { x: agent.x, z: agent.z, residentId: agent.residentId });
        if (!spot) {
          // 挑不到场所：退回门口转圈；藏着的先出来
          if (!hidden) return null;
          intent = intentOf(agent, [{ verb: "show" }], { idleAfter: 0.5 });
          break;
        }
        const visit = visitIntent(agent, spot, plan);
        if (!visit) return null;
        if (hidden) visit.steps.unshift({ verb: "show" });
        intent = visit;
        break;
      }
      case "roam": {
        const spot = agent.randomFreeSpot(plan.radius);
        if (!spot) return null;
        const steps: ActionStep[] = hidden ? [{ verb: "show" }] : [];
        steps.push({ verb: "walk_to", x: spot[0], z: spot[1], speedScale: plan.speedScale, state: ROAM_WALK_STATE });
        intent = intentOf(agent, steps, { idleAfter: 1 + Math.random() * 3 });
        break;
      }
      case "nap_out": {
        const steps: ActionStep[] = hidden ? [{ verb: "show" }] : [];
        const [min, max] = plan.napSeconds;
        steps.push({ verb: "stand", seconds: 2 }, { verb: "sleep", seconds: min + Math.random() * (max - min) });
        intent = intentOf(agent, steps, { idleAfter: 2 });
        break;
      }
    }

    if (!intent) return null;
    // 记下"正在做哪件事"：做完 / 被抢时 intentOf 的包装会把它删掉，下一轮才会再下同一种计划
    activePlanKey.set(agent, baseKey);
    return intent;
  },
};
