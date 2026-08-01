import type { LocalizationKey } from "./base.js";
import type { UtcTimestamp, WorldDayId } from "./time.js";

/**
 * 消息流：玩家打的字、命令的反馈、剧情提示、NPC 说的话，**全在同一条流里**。
 *
 * 分成几条流是很自然的第一直觉（"命令输出是给开发看的，不该和剧情混"），
 * 但那样每加一种消息就要挑一条流放，而玩家眼里它们本来就是按时间先后
 * 发生的同一串事。Minecraft 也是一条 chat 装下所有东西，靠颜色区分。
 */

export enum ChatMessageKind {
  /** 玩家自己打的字 */
  Player = "player",
  /** 命令的执行反馈 */
  System = "system",
  /** 剧情与教程提示 */
  Story = "story",
  /** NPC / 宠物说的话 */
  Npc = "npc",
}

export type ChatMessageId = string;

export type ChatMessage = {
  id: ChatMessageId;

  /**
   * 说这句话时是世界的第几天。**裁剪按这个，不按真实时间**——
   * 玩家眼里的"三天前"是游戏里过了三天，不是现实过了 72 小时。
   */
  worldDayId: WorldDayId;

  /** 真实时刻。只用来在界面上显示"几点说的"，不参与裁剪 */
  atUtc: UtcTimestamp;

  kind: ChatMessageKind;

  /**
   * 已经成文的正文。
   *
   * 存成文而不是 localizationKey 是**刻意的**：这是一条历史记录，
   * 它记的是"当时屏幕上显示了什么"。存 key 的话，改一次文案会把
   * 三天前那句话也改掉，那就不是记录了。
   * 需要本地化的调用方在写入前先 t() 一次。
   */
  text: string;

  /** 谁说的（NPC 昵称）。玩家和系统消息不填 */
  speaker?: string;

  /**
   * 这条消息**当时**是从哪个文案键来的。
   * 只给调试和以后的重新本地化留个线索，渲染一律用 text。
   */
  sourceKey?: LocalizationKey;
};
