import type { ExpressionDefinition } from "../../types/talk.js";

/**
 * 表情注册表（居民系统 03）。
 *
 * 头顶冒的小图标 + 可选的一次性动作。`gesture` 是给造型层的名字：物种实现了就播，
 * 没实现就只冒图标——所以这里放心写动作名，Core 不校验它。
 * 图标先用 emoji（`expr.*` 文案键），美术图到了换成 `/icons/expr_*.png`，表不动。
 */
export const expressionDefinitions = [
  { id: "happy", iconKey: "expr.happy", gesture: "bounce" },
  { id: "shy", iconKey: "expr.shy", gesture: "look_away" },
  { id: "puzzled", iconKey: "expr.puzzled", gesture: "tilt" },
  { id: "sleepy", iconKey: "expr.sleepy", gesture: "nod_off" },
  { id: "surprised", iconKey: "expr.surprised", gesture: "hop" },
  { id: "sad", iconKey: "expr.sad" },
] as const satisfies readonly ExpressionDefinition[];

export function findExpression(id: string): ExpressionDefinition | undefined {
  return (expressionDefinitions as readonly ExpressionDefinition[]).find((entry) => entry.id === id);
}

/** 表情大概挂多久（秒）。和气泡同一个节奏，表情不该比话留得久 */
export const EXPRESSION_SECONDS = 3;
