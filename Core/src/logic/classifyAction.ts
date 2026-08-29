import {
  actionCategoryKeywords,
  defaultActionCategory,
} from "../Data/actions/index.js";
import type { ActionCategory } from "../types/actions.js";

/**
 * 标题 → 行动分类。日记本左页写计划、右页补录都不选分类，靠它后台归。
 *
 * 关键词正则**懒编译 + 缓存**：表在 Data 层是正则源字符串（内容零硬编码，
 * 加词条只动表），这里第一次用到时才 `new RegExp` 拼起来。大小写不敏感
 * 照顾英文（gym/Gym/GYM）。
 *
 * 表序即优先级，第一个命中的分类赢——为什么 work_study 排在 creation
 * 前面写在表上（"写作业"问题）。全没中 → `defaultActionCategory`。
 *
 * 这版就是"能跑通的最朴素方案"（用户原话：未来这一块肯定要改）。
 * 换 LLM/词向量时只换这个函数，表还能当词典用。
 */

let compiled: Array<{ category: ActionCategory; pattern: RegExp }> | null = null;

function rules(): Array<{ category: ActionCategory; pattern: RegExp }> {
  if (!compiled) {
    compiled = actionCategoryKeywords.map((entry) => ({
      category: entry.category,
      pattern: new RegExp(entry.patterns.join("|"), "i"),
    }));
  }
  return compiled;
}

export function classifyActionTitle(title: string): ActionCategory {
  const text = title.trim();
  if (text.length > 0) {
    for (const rule of rules()) {
      if (rule.pattern.test(text)) return rule.category;
    }
  }
  return defaultActionCategory;
}
