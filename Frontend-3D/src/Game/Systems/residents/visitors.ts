import {
  Facing,
  findBlueprintForBuilding,
  findResidentDefinition,
  formatMinute,
  listResidentDefinitions,
  parseLocalClockTime,
  pickVisitor,
  residentIdOf,
  roomCellToWorld,
  visitorCandidates,
  visitorTuning,
  COMMAND_SKILL_ID,
  findSkillPriority,
} from "core";
import { emit, on } from "../../EventBus";
import { isRemoteWorld } from "../../Multiplayer/worldLock";
import { listBuildings, previewPlacement } from "../../State/buildings";
import { getClock } from "../../State/clock";
import { getCount } from "../../State/inventory";
import { getResidents, removeResident, spawnResidentAt } from "../../State/residentsRuntime";
import type { ResidentAgent } from "../../State/residentAgent";
import { getCurrentMap, getRoom } from "../../State/worldRuntime";
import { mapDefinitions } from "../../../Maps/index";
import { signal } from "../story";
import { visitorEntryOf } from "./spots";

/**
 * 桥头访客（居民系统 09）：偶尔来一位陌生人，聊得来就请他住下。
 *
 * 到来是剧情效果 `spawn_visitor`（规则走 visitor_arrival 池，同一天最多一位）；**谁来**在这里按候选定
 * （Core `visitorCandidates`：有房子、没住下、房子没在场上、图纸不在你手上、领地放得下一栋），
 * 规则不点名——加新居民 = 注册表加一条，访客池自动包含他。
 *
 * 访客 = `agent.visiting`：只跑标了 forVisitors 的技能（在桥头转、打招呼、按 F 是"想住下来吗"），
 * 到 `leaveAtLocalTime` 走人（走回入口再消失）。邀了照样走：图纸在你手上，房子建好那天走 02 的
 * 搬入链从桥头回来——所以"等你选址"不需要另一个状态，图纸在包里 / 房子在场上就是它。
 */

let clockSource: () => { minuteOfDay: number; worldDayId: string } = () => {
  const clock = getClock();
  return { minuteOfDay: clock.local.minuteOfDay, worldDayId: clock.worldDayId };
};
export function setVisitorsClockSource(source: (() => { minuteOfDay: number; worldDayId: string }) | null): void {
  clockSource = source ?? (() => {
    const clock = getClock();
    return { minuteOfDay: clock.local.minuteOfDay, worldDayId: clock.worldDayId };
  });
}

/** 领地放不放得下这栋：拿真的选址校验扫一遍院子格（一天一次的事，几千次矩形比较不算什么） */
export function hasRoomForHouse(buildingId: string): boolean {
  const yard = getRoom(getCurrentMap().outdoorRoomId);
  if (!yard) return false;
  for (let gy = 0; gy < yard.floorGrid.height; gy += 1) {
    for (let gx = 0; gx < yard.floorGrid.width; gx += 1) {
      const world = roomCellToWorld(yard, gx, gy);
      if (previewPlacement({ buildingId, x: world.x, z: world.z, facing: Facing.North, countsAsNew: true }).ok) return true;
    }
  }
  return false;
}

/** 今天能来谁 */
export function visitorCandidatesNow(): ReturnType<typeof visitorCandidates> {
  const present = new Set(getResidents().map((agent) => agent.definitionId));
  const housed = new Set(listBuildings().map((placement) => placement.buildingId));
  const blueprintHeld = new Set(
    listResidentDefinitions()
      .map((definition) => definition.residence?.buildingId ?? "")
      .filter((buildingId) => {
        const blueprint = findBlueprintForBuilding(buildingId);
        return blueprint !== undefined && getCount(blueprint.id) > 0;
      }),
  );
  return visitorCandidates(listResidentDefinitions(), { present, housed, blueprintHeld, hasRoomFor: hasRoomForHouse });
}

export function currentVisitor(): ResidentAgent | undefined {
  return getResidents().find((agent) => agent.visiting);
}

/**
 * 来一位（剧情效果 / 指令）。`definitionId` 不给就从候选里按今天抽；给了要在候选里（调试也不放已经住下的）。
 * 已经有访客在桥头就不来第二位。
 */
export function spawnVisitor(definitionId?: string): ResidentAgent | null {
  if (isRemoteWorld() || currentVisitor()) return null;
  const candidates = visitorCandidatesNow();
  const definition = definitionId ? candidates.find((entry) => entry.id === definitionId) : pickVisitor(candidates, clockSource().worldDayId);
  if (!definition) return null;
  const entry = visitorEntryOf(getCurrentMap().mapId, mapDefinitions);
  const agent = spawnResidentAt(residentIdOf(definition.id), definition.id, entry, { x: entry.x, z: entry.z });
  agent.visiting = { leaveAtLocalTime: visitorTuning.leaveAtLocalTime };
  signal("visitor_arrived", definition.id);
  emit("resident_changed", { residentId: agent.residentId, reason: "visitor" });
  return agent;
}

/** 走人：走回入口再消失。排不出路就原地消失 */
export function leaveVisitor(residentId: string): boolean {
  const agent = getResidents().find((entry) => entry.residentId === residentId && entry.visiting);
  if (!agent) return false;
  const definitionId = agent.definitionId;
  const gone = (): void => {
    if (!removeResident(residentId)) return;
    signal("visitor_left", definitionId);
  };
  const entry = visitorEntryOf(getCurrentMap().mapId, mapDefinitions);
  const accepted = agent.perform({
    skillId: COMMAND_SKILL_ID,
    priority: findSkillPriority(COMMAND_SKILL_ID)?.priority ?? 1000,
    interruptible: false,
    steps: [{ verb: "walk_to", x: entry.x, z: entry.z }],
    idleAfter: 0,
    onDone: gone,
    onInterrupted: gone,
  });
  if (!accepted) gone();
  return true;
}

/** 邀过了没：图纸在你手上，或房子已经在场上 */
export function isVisitorInvited(definitionId: string): boolean {
  const buildingId = findResidentDefinition(definitionId)?.residence?.buildingId;
  if (!buildingId) return false;
  if (listBuildings().some((placement) => placement.buildingId === buildingId)) return true;
  const blueprint = findBlueprintForBuilding(buildingId);
  return blueprint !== undefined && getCount(blueprint.id) > 0;
}

/** 访客按 F 开哪段：没邀过 → "想住下来吗"（firstMeet）；邀过了 → 寒暄（casual）。不是访客 → null */
export function visitorDialogueFor(agent: { visiting?: unknown; definitionId: string }): string | null {
  if (!agent.visiting) return null;
  const definition = findResidentDefinition(agent.definitionId);
  if (!definition?.dialogues) return null;
  return (isVisitorInvited(agent.definitionId) ? definition.dialogues.casual : definition.dialogues.firstMeet) ?? null;
}

/** 到点没走的走人（半分钟看一次；换日也看：昨天留下的一律走） */
export function syncVisitors(): number {
  if (isRemoteWorld()) return 0;
  const { minuteOfDay } = clockSource();
  let left = 0;
  for (const agent of getResidents()) {
    if (!agent.visiting) continue;
    if (minuteOfDay < parseLocalClockTime(agent.visiting.leaveAtLocalTime)) continue;
    if (leaveVisitor(agent.residentId)) left += 1;
  }
  return left;
}

export function describeVisitor(agent: ResidentAgent): string {
  return agent.visiting ? `访客（在桥头，${agent.visiting.leaveAtLocalTime} 走${isVisitorInvited(agent.definitionId) ? "，已邀请" : ""}）` : "";
}

let detach: (() => void) | null = null;
const CHECK_INTERVAL_MS = 30_000;

export function startVisitorSystem(): () => void {
  if (detach) return detach;
  const timer = setInterval(() => syncVisitors(), CHECK_INTERVAL_MS);
  const offDay = on("world_day_changed", () => {
    // 昨天留下的访客（离线一夜）：天亮就走，别站一整天
    for (const agent of getResidents()) if (agent.visiting) leaveVisitor(agent.residentId);
  });
  detach = () => {
    clearInterval(timer);
    offDay();
    detach = null;
  };
  return detach;
}

void formatMinute;
