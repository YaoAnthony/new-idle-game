import { ResidentAgent } from "../residentAgent";

/** 阿茜（狐狸）。同 Slime：行为暂同宠物，02 起加作息 */
export class Fox extends ResidentAgent {
  static override skills = ["routine", "needs", "nap", "approach", "wander", "greet", "talk", "reactions", "favor", "social"] as const; // 03 起会打招呼、能闲聊、有反应； 02 起有作息：性格 lively，隔三天去一趟小镇
}
