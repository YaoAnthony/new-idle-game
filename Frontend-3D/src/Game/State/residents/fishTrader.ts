import { ResidentAgent } from "../residentAgent";

/** 旅行商人「小鱼人」。八天一趟的稀客，身后拖着浮筏车（拖车是定义上的声明，视图画）。F 开交易面板 */
export class FishTrader extends ResidentAgent {
  /*
   * 02 起商人不吃不喝不亲近：他是来做生意的。
   * visitPlayer（20）只为它的 interact：剧情叫他来门口敲门时，对着他按 F 是门口那段对话。
   * 它的 decide 不会让商人自己来串门——每日来访只从伙伴档的居民里抽。
   */
  static override skills = ["visitPlayer", "wander", "trade"] as const;
}
