import type { GolemPart } from "core";
import { ResidentAgent } from "../residentAgent";

/**
 * 石傀儡：领地上那尊会干活的石头人。**不吃不喝不亲近**——不是把 hungerPerHour
 * 调成 0 那种意思，是这些概念对它不成立，所以干脆不挂 needs / approach。
 * 有工地就去（build 80 压倒游荡 10）；没有就在自己那块地方转悠。
 *
 * 三个形态（居民系统 22，用户定）：没头没手 → 没手 → 齐全。
 * 头 = 会说话（唤醒零件），手 = 能干活（build 技能看 `assembled`）。
 * 形态**从零件推**，不另存一个阶段字段——存档里已经有零件表，再存一份迟早对不上。
 */
export class Golem extends ResidentAgent {
  static override skills = ["build", "wander"] as const;
  /** 开场三件都缺，坐在地上休眠（`placeCreatureAt` 的 missingParts 摘的就是它们） */
  static override parts = ["head", "arm_left", "arm_right"] as const satisfies readonly GolemPart[];
  /** 只有头管醒：装上头就站起来咔咔，手另算 */
  static override wakeParts = ["head"] as const satisfies readonly GolemPart[];
}

/** 他现在是哪个形态。剧情条件、气泡、调试指令都读这个 */
export type GolemStage = "headless" | "armless" | "complete";

export function golemStage(golem: ResidentAgent): GolemStage {
  if (!golem.attachedParts.has("head")) return "headless";
  return golem.assembled ? "complete" : "armless";
}
