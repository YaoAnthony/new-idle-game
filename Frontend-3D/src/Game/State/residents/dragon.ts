import { ResidentAgent } from "../residentAgent";

/**
 * 小龙「青涟」（偷金币的贼）。只在失窃链"被抓回来"那一幕登场。
 * 行为同宠物（吃喝衰减在注册表里是 0，所以 needs 永远不触发；站着等发落）。
 */
export class CoinDragon extends ResidentAgent {
  static override skills = ["needs", "nap", "approach", "wander"] as const;
}
