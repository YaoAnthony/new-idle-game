import { ResidentAgent } from "../residentAgent";

/**
 * 石傀儡：领地上那尊会干活的石头人。**不吃不喝不亲近**——不是把 hungerPerHour
 * 调成 0 那种意思，是这些概念对它不成立，所以干脆不挂 needs / approach。
 * 有工地就去（build 80 压倒游荡 10）；没有就在自己那块地方转悠。
 */
export class Golem extends ResidentAgent {
  static override skills = ["build", "wander"] as const;
  /** 开场没有头，坐在地上休眠；装上才醒（`placeCreatureAt` 的 missingParts 摘的就是它） */
  static override parts = ["head"] as const;
}
