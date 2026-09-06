/**
 * 技能优先级表（居民系统 01，2026-09-06）。
 *
 * 一只活物闲下来时按这张表从高到低问每个技能"想干什么"，第一个给出
 * Intent 的赢；已经在做事时，只有比当前 Intent 优先级高、且当前允许打断的
 * 才能抢过来。**数字住这里不住代码**：调"饿了要不要放下手里的活"改这一行。
 *
 * `command` 是玩家用 `/npc <谁> do …` 下达的，优先级 1000 而不是 Infinity——
 * Intent 要能上网线（联机木偶按同一份 JSON 执行），`Infinity` 序列化成 null。
 *
 * 技能的**实现**在 Frontend（`Game/State/skills/`），这里只有名字和数字：
 * Core 不知道"找工地"怎么做，只知道它排在"找吃的"前面。
 */
export type SkillId = string;

export type SkillPriorityDefinition = {
  id: SkillId;
  priority: number;
  /**
   * 这个技能下的 Intent 默认能不能被更高优先级抢走。
   * 技能自己产出的 Intent 可以覆盖（needs 走到最后一步吃到一半时翻成 false）。
   */
  interruptible: boolean;
};

export const COMMAND_SKILL_ID: SkillId = "command";

export const skillPriorityDefinitions = [
  { id: COMMAND_SKILL_ID, priority: 1000, interruptible: false },
  /** 石傀儡去工地。压倒游荡，被引开会释放工地 */
  { id: "build", priority: 80, interruptible: true },
  /** 饿了渴了找吃找喝。走过去的路上可以被抢，吃到一半不行 */
  { id: "needs", priority: 60, interruptible: false },
  /**
   * 作息（02）：到点回家睡、雨天回屋、小镇日出门、白天去场所。
   * 压过打盹 / 亲近 / 游荡（不然夜里在院子里打盹就不回家了），
   * 让给饿了渴了；睡觉那条 Intent 自己翻成不可打断。
   */
  { id: "routine", priority: 40, interruptible: true },
  /**
   * 打招呼（03）。**并行槽**：它不下串行 Intent，走 `observe` 每半秒看一眼玩家多近，
   * 到了就往嘴上放一句——所以这个数字实际不参与抢占，只是把它排在表里。
   */
  /** 来你家（07）：今天是来访日、时段对、你在屋里闲着 → 走到门外敲门 */
  { id: "visitPlayer", priority: 50, interruptible: true },
  /** 居民之间（06）：碰面停下聊两句、shy 挪一步、一起待着时隔一会儿聊一段 */
  { id: "social", priority: 45, interruptible: true },
  /** 有事求你（05）：委托挂着、你在附近，他走过来站到你跟前。不追人 */
  { id: "favor", priority: 35, interruptible: true },
  { id: "greet", priority: 30, interruptible: true },
  /** 闲着打盹（舒舒十次有八次）。只在无事可做时掷 */
  { id: "nap", priority: 25, interruptible: true },
  /** 熟了以后偶尔凑到玩家身边 */
  { id: "approach", priority: 20, interruptible: true },
  /** 兜底：驻地附近随便走走 */
  { id: "wander", priority: 10, interruptible: true },
  /** 商人的交易面板。没有 decide，只回答"按 F 开什么" */
  { id: "trade", priority: 0, interruptible: true },
  /** 居民的闲聊（03）。没有 decide，只回答"按 F 开哪段"——段落由闲聊池按条件抽 */
  { id: "talk", priority: 0, interruptible: true },
  /** 反应（03）。没有 decide，只有 onEvent：暴风来了做个表情 */
  { id: "reactions", priority: 0, interruptible: true },
] as const satisfies readonly SkillPriorityDefinition[];

export function findSkillPriority(id: SkillId): SkillPriorityDefinition | undefined {
  return (skillPriorityDefinitions as readonly SkillPriorityDefinition[]).find(
    (entry) => entry.id === id,
  );
}

/**
 * 技能问一圈的节流（秒）。每帧都问的话两个技能会一帧一换地互相抢；
 * 半秒一问，玩家看不出延迟，技能也不会抖。
 */
export const SKILL_DECIDE_INTERVAL_SECONDS = 0.5;
