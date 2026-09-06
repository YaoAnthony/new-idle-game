import { ResidentAgent } from "../residentAgent";

/** 阿茜（狐狸）。同 Slime：行为暂同宠物，02 起加作息 */
export class Fox extends ResidentAgent {
  static override skills = ["needs", "nap", "approach", "wander"] as const;
}
