import { ResidentAgent } from "../residentAgent";

/** 薇尔（精灵）。同 Slime：行为暂同宠物，02 起加作息；她的家是大树（附-薇尔的大树） */
export class Spirit extends ResidentAgent {
  static override skills = ["routine", "needs", "nap", "approach", "wander", "greet", "talk", "reactions"] as const; // 03 起会打招呼、能闲聊、有反应； 02 起有作息：性格 gentle，雨天出门看雨
}
