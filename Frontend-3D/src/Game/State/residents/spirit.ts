import { ResidentAgent } from "../residentAgent";

/** 薇尔（精灵）。同 Slime：行为暂同宠物，02 起加作息；她的家是大树（附-薇尔的大树） */
export class Spirit extends ResidentAgent {
  static override skills = ["needs", "nap", "approach", "wander"] as const;
}
