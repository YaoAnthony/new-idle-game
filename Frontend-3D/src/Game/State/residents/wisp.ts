import { ResidentAgent } from "../residentAgent";

/**
 * 三只 wisp（苔灵 / 沫灵 / 烬灵）共用一个子类：它们只差性情数字（在注册表里），
 * 行为一样——饿了找吃、渴了找喝、偶尔凑到你身边、其余时间在屋里飘。
 */
export class Wisp extends ResidentAgent {
  static override skills = ["needs", "nap", "approach", "wander"] as const;
}
