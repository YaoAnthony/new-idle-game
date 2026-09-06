import { isConstructionDone } from "core";
import { jitterSeconds } from "./jitter";
import { findBuildingLevel } from "../../../Buildings/index";
import { claimSite, finishSite, listSites, releaseSite } from "../buildings";
import { getClock } from "../clock";
import { isWalkable } from "../worldRuntime";
import { findRoute } from "../../Systems/navigation";
import { priorityOf, setWorkChecker, type ResidentAgent, type WorkOutcome } from "../residentAgent";
import type { Intent } from "../actions";
import type { Skill } from "./types";

/**
 * 去工地干活（原 `trySeekSite` / `beginWork` / `tickWork` / `diagnoseSites`，
 * 2026-09-06 搬出来）。挂在石傀儡子类上。
 *
 * - **一次只认一块**：手上有活（`workerId` 是自己）就接着干那块，不半路改主意。
 * - 候选是**所有**没人认领的工地，按下单顺序试；去不了的跳过、不报错。
 * - 到达即认领（`claimSite`），认领了才开始走进度；进度由 Core 按
 *   startUtc/finishUtc 算，这里只每帧看"到点没到 / 工地还在不在"。
 * - 被抢走（引开、读档）→ `releaseSite`，工地退回队列。
 *
 * 玩家按 F：醒着的工头直接开建造面板，没有对话这一步（用户定）。
 */

function reachOf(agent: ResidentAgent, site: ReturnType<typeof listSites>[number]) {
  const level = findBuildingLevel(
    site.buildingId,
    site.construction?.targetLevelId ?? site.levelId,
  );
  const half = Math.max(level?.footprint.width ?? 2, level?.footprint.height ?? 2) / 2;
  return { reach: agent.radius + 0.9 + half, blocked: half };
}

function workIntent(agent: ResidentAgent, instanceId: string, spot: { x: number; z: number } | null): Intent {
  const site = listSites().find((item) => item.instanceId === instanceId);
  const facing = site ? { x: site.x, z: site.z } : undefined;
  const steps: Intent["steps"] = spot ? [{ verb: "walk_to", x: spot.x, z: spot.z }] : [];
  steps.push({ verb: "work_at", instanceId, facing });
  return {
    skillId: "build",
    priority: priorityOf("build"),
    interruptible: true,
    steps,
    // 完工立刻找下一块：队里还有的话，玩家看见他转身就走
    idleAfter: 0.4,
    onArrive: () => {
      // 到了工地却没了（被拆了 / 读档换了世界）→ 回去发呆
      if (!listSites().some((item) => item.instanceId === instanceId)) return false;
      claimSite(instanceId, agent.residentId, getClock().sample.nowUtc);
      return true;
    },
    onInterrupted: () => {
      const mine = listSites().find(
        (item) => item.instanceId === instanceId && item.construction?.workerId === agent.residentId,
      );
      if (mine) releaseSite(instanceId);
    },
    /*
     * 收工没活了就地打个盹（12）。傀儡没挂 nap 技能（nap 靠 sleepiness 掷骰，傀儡是 0），
     * 之前完工后只是杵着发呆——"干完活歇一会"比"干完活立正"像活物。用 nap 的优先级：
     * 队里再来一块工地，build（80）照样把他叫醒。
     */
    onDone: () => {
      if (listSites().some((item) => !item.construction?.workerId || item.construction.workerId === agent.residentId)) return;
      agent.perform({
        skillId: "nap",
        priority: priorityOf("nap"),
        interruptible: true,
        steps: [{ verb: "gesture", gestureId: "stretch" }, { verb: "stand", seconds: 2, flavor: "resting" }, { verb: "sleep", seconds: jitterSeconds(60, 120) }],
        idleAfter: 3,
      });
    },
  };
}

export const buildSkill: Skill = {
  id: "build",
  decide: ({ agent, current }) => {
    if (agent.dormant) return null;
    if (current?.skillId === "build") return null;

    const mine = listSites().find((site) => site.construction?.workerId === agent.residentId);
    const candidates = mine
      ? [mine]
      : listSites().filter((site) => !site.construction?.workerId);

    for (const target of candidates) {
      const { reach, blocked } = reachOf(agent, target);
      // 已经站在跟前了 → 直接开工，不用再走
      if (Math.hypot(target.x - agent.x, target.z - agent.z) <= reach) {
        return workIntent(agent, target.instanceId, null);
      }
      // 排不出路 = 这块地他过不去（门太窄、地没解锁）。换下一块
      const spot = agent.findSpotNear(target.x, target.z, reach, blocked);
      if (!spot) continue;
      return workIntent(agent, target.instanceId, spot);
    }
    return null;
  },
  interact: ({ agent }) => (agent.dormant ? null : { kind: "build_shop" }),
};

/**
 * `work_at` 那一步的完成条件，注入给身体（见 `setWorkChecker`）：
 * 工地没了 → lost（被拆了 / 读档换了世界）；到点 → 结算完工、done；否则接着干。
 */
export function checkWork(instanceId: string): WorkOutcome {
  const site = listSites().find((item) => item.instanceId === instanceId);
  if (!site) return "lost";
  if (isConstructionDone(site, getClock().sample.nowUtc)) {
    finishSite(site.instanceId);
    return "done";
  }
  return "working";
}
setWorkChecker(checkWork);

/**
 * **为什么不去建**：逐块工地报原因（`/golem` 指令用）。
 *
 * 用户 2026-08-25 报"石傀儡不过来建造"时没有任何工具能回答这个问题——三种原因
 * （有人认领了 / 已经站到了 / 排不出路）从外面长得一模一样。不改任何状态。
 */
export function diagnoseSites(agent: ResidentAgent): {
  errand: string;
  sites: Array<{ instanceId: string; verdict: string }>;
} {
  const current = agent.currentIntent;
  const step = current?.steps[agent.currentStepIndex];
  const errand =
    current?.skillId === "build"
      ? step?.verb === "work_at"
        ? step.instanceId
        : "(在路上)"
      : (current?.skillId ?? "(空)");

  const sites = listSites().map((site) => {
    if (site.construction?.workerId && site.construction.workerId !== agent.residentId) {
      return { instanceId: site.instanceId, verdict: `别人在建（${site.construction.workerId}）` };
    }
    const { reach, blocked } = reachOf(agent, site);
    const distance = Math.hypot(site.x - agent.x, site.z - agent.z);
    if (distance <= reach) {
      return { instanceId: site.instanceId, verdict: `够得着（距离 ${distance.toFixed(1)} ≤ ${reach.toFixed(1)}）` };
    }
    if (agent.findSpotNear(site.x, site.z, reach, blocked)) {
      return { instanceId: site.instanceId, verdict: `走得到（距离 ${distance.toFixed(1)}）` };
    }
    /*
     * 去不了的话，分清是"没地方站"还是"站得下但走不过去"，后者再分
     * "路太窄"（小个子过得去）和"那片地不连通"（小个子也过不去）。
     */
    let standable = 0;
    let tried = 0;
    const inner = blocked + agent.radius;
    const RINGS = 4;
    const DIRECTIONS = 12;
    for (let ring = 0; ring <= RINGS; ring += 1) {
      const d = inner >= reach ? reach : inner + ((reach - inner) * ring) / RINGS;
      const spokes = d <= 0.01 ? 1 : DIRECTIONS;
      const phase = (ring * Math.PI) / DIRECTIONS;
      for (let spoke = 0; spoke < spokes; spoke += 1) {
        const angle = phase + (spoke * Math.PI * 2) / spokes;
        tried += 1;
        if (isWalkable(site.x + Math.cos(angle) * d, site.z + Math.sin(angle) * d, agent.radius, agent.residentId)) {
          standable += 1;
        }
      }
    }
    let narrowOnly = false;
    if (standable > 0) {
      const tiny = findRoute(
        { x: agent.x, z: agent.z },
        { x: site.x, z: site.z },
        { radius: 0.25, snapRings: 4, phasing: agent.phasing },
      );
      narrowOnly = Boolean(tiny && tiny.length >= 2);
    }
    return {
      instanceId: site.instanceId,
      verdict:
        standable === 0
          ? `**没地方站**（环带 ${inner.toFixed(1)}~${reach.toFixed(1)}，${tried} 个候选点一个都站不下，半径 ${agent.radius}）`
          : narrowOnly
            ? `**路太窄**（小个子过得去，他半径 ${agent.radius} 过不去；${standable}/${tried} 个落脚点可站）`
            : `**那片地不连通**（小个子也过不去；${standable}/${tried} 个落脚点可站，距离 ${distance.toFixed(1)}）`,
    };
  });
  return { errand, sites };
}
