import { buildSkill } from "./build";
import { needsSkill } from "./needs";
import { routineSkill } from "./routine";
import { tradeSkill } from "./trade";
import { approachSkill, napSkill, wanderSkill } from "./wander";
import type { Skill } from "./types";

export type { InteractOffer, Skill, SkillContext } from "./types";

/**
 * 技能注册表。子类用 id 声明挂什么（`static skills = ["needs", "wander"]`），
 * 工厂从这里查实现。加一个技能 = 一个文件 + 这里一行；优先级在 Core 的
 * `skillPriorityDefinitions` 里（数字不住代码）。
 */
export const skillRegistry: ReadonlyMap<string, Skill> = new Map<string, Skill>(
  [needsSkill, napSkill, approachSkill, wanderSkill, buildSkill, tradeSkill, routineSkill].map(
    (skill) => [skill.id, skill],
  ),
);

/** 按 id 解析。表里没有的名字是内容错误，当场抛——静默跳过会让一只动物悄悄少一种行为 */
export function resolveSkills(ids: readonly string[]): Skill[] {
  return ids.map((id) => {
    const skill = skillRegistry.get(id);
    if (!skill) throw new Error(`技能注册表里没有 "${id}"`);
    return skill;
  });
}
