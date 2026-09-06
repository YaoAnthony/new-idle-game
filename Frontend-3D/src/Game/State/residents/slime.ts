import { ResidentAgent } from "../residentAgent";

/**
 * 咕噜（史莱姆）。居民（`CreatureRole.Resident`）今天在行为上和宠物一样：
 * 吃喝亲近照走，区别只在身份（有房子、算客源）。02 起在这里加 `routine`。
 */
export class Slime extends ResidentAgent {
  static override skills = ["routine", "needs", "nap", "approach", "wander"] as const; // 02 起有作息：性格 easygoing（注册表里）
}
