import type { TalkPool } from "../../../types/talk.js";
import { foxTalk } from "./fox.js";
import { slimeTalk } from "./slime.js";
import { spiritTalk } from "./spirit.js";

/**
 * 对话池注册表（居民系统 03）。**一人一文件**：三位的说话方式刻意分开，
 * 混在一个文件里写着写着就串味了。加第四位邻居 = 加一个文件 + 这里一行。
 *
 * 招呼 / 闲聊怎么抽在 `logic/talk.ts`；条件怎么算在前端 `Systems/dialogue.ts`。
 */
export const talkPools = [slimeTalk, foxTalk, spiritTalk] as const satisfies readonly TalkPool[];

export function findTalkPool(residentDefinitionId: string): TalkPool | undefined {
  return (talkPools as readonly TalkPool[]).find((pool) => pool.residentId === residentDefinitionId);
}
