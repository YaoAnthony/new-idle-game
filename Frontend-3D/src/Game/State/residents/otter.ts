import { ResidentAgent } from "../residentAgent";

/**
 * 水獭商人。按 F 开交易面板（trade）。
 * 02 起不再挂 needs / nap / approach：商人不该吃你的煎蛋、不该在摊边打盹。
 */
export class Otter extends ResidentAgent {
  static override skills = ["wander", "trade"] as const; // 02 起商人不吃不喝不亲近：他是来做生意的
}
