import { ResidentAgent } from "../residentAgent";

/**
 * 水獭商人。按 F 开交易面板（trade）。
 *
 * 01 零行为变化：他今天仍挂着 needs / nap / approach——原来的 `chooseNextActivity`
 * 对 Merchant 没有像 Worker 那样跳过吃喝亲近，所以商人一直在饿、在找地上的吃的。
 * 这不对（商人不该吃你的煎蛋），但那是行为改动，留给 02 一起改：到时只删这里三个词。
 */
export class Otter extends ResidentAgent {
  static override skills = ["needs", "nap", "approach", "wander", "trade"] as const;
}
