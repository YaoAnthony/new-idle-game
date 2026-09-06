import { ResidentAgent } from "../residentAgent";

/** 舒舒：两个人那么大的巨猫，十次有八次选择接着睡（睡意在注册表里） */
export class Shushu extends ResidentAgent {
  static override skills = ["needs", "nap", "approach", "wander"] as const;
}
