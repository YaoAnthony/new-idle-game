import { ResidentAgent } from "../residentAgent";

/** 旅行商人「小鱼人」。八天一趟的稀客，身后拖着浮筏车（拖车是定义上的声明，视图画）。F 开交易面板 */
export class FishTrader extends ResidentAgent {
  static override skills = ["needs", "nap", "approach", "wander", "trade"] as const;
}
