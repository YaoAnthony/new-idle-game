import { codexSources } from "../Data/codex/index.js";
import type {
  CodexEntry,
  CodexEntryId,
  CodexSectionId,
  CodexSectionProgress,
  CodexSignal,
  CodexSource,
  CodexState,
} from "../types/codex.js";

/** 全部条目：按来源的 order，再按各注册表自己的声明序 */
export function listCodexEntries(sources: readonly CodexSource<any>[] = codexSources): CodexEntry[] {
  const entries: CodexEntry[] = [];
  for (const source of [...sources].sort((a, b) => a.order - b.order)) {
    for (const def of source.list()) {
      const sourceId = source.idOf(def);
      entries.push({
        id: `${source.section}:${sourceId}`,
        section: source.section,
        sourceId,
        nameKey: source.nameKey(def),
        descKey: source.descKey(def),
        groupKey: source.groupKey(def),
        icon: source.icon(def),
      });
    }
  }
  return entries;
}

/** 分区列表（页签用），按 order */
export function listCodexSections(
  sources: readonly CodexSource<any>[] = codexSources,
): Array<{ section: CodexSectionId; titleKey: string; emoji: string }> {
  return [...sources]
    .sort((a, b) => a.order - b.order)
    .map((source) => ({ section: source.section, titleKey: source.titleKey, emoji: source.emoji }));
}

/**
 * 一条剧情信号 → 该点亮的条目 id（0 或多条，去重）。
 * 规则算出来的 id 不在那个分区的 `list()` 里就丢：`furniture_placed` 的 subject
 * 可以是任何能摆的东西，图鉴只收家具。
 */
export function codexEntriesForSignal(
  signal: CodexSignal,
  sources: readonly CodexSource<any>[] = codexSources,
): CodexEntryId[] {
  const subject = signal.subject;
  if (subject === undefined) return [];
  const hits = new Set<CodexEntryId>();
  for (const source of sources) {
    const known = new Set(source.list().map((def) => `${source.section}:${source.idOf(def)}`));
    for (const rule of source.rules) {
      if (rule.signal !== signal.kind) continue;
      const id = rule.toEntryId(subject);
      if (id !== null && known.has(id)) hits.add(id);
    }
  }
  return [...hits];
}

/** 每个分区 + 总计的「已收录 / 总数」 */
export function codexProgress(
  state: CodexState,
  sources: readonly CodexSource<any>[] = codexSources,
): Record<CodexSectionId | "all", CodexSectionProgress> {
  const result = { all: { seen: 0, total: 0 } } as Record<CodexSectionId | "all", CodexSectionProgress>;
  for (const entry of listCodexEntries(sources)) {
    const bucket = (result[entry.section] ??= { seen: 0, total: 0 });
    bucket.total += 1;
    result.all.total += 1;
    if (state[entry.id]) {
      bucket.seen += 1;
      result.all.seen += 1;
    }
  }
  return result;
}

/**
 * 内容审计：每个来源非空、分区内 id 唯一、每条规则至少对应一个分区。
 * 返回问题列表，空 = 干净。`Core/tests/codex.test.ts` 和前端 i18n 测试都问它。
 */
export function auditCodexContent(sources: readonly CodexSource<any>[] = codexSources): string[] {
  const problems: string[] = [];
  const sections = new Set<string>();
  for (const source of sources) {
    if (sections.has(source.section)) problems.push(`分区重复：${source.section}`);
    sections.add(source.section);
    const defs = source.list();
    if (defs.length === 0) problems.push(`分区是空的：${source.section}`);
    const ids = new Set<string>();
    for (const def of defs) {
      const id = source.idOf(def);
      if (ids.has(id)) problems.push(`分区 ${source.section} 内 id 重复：${id}`);
      ids.add(id);
    }
    if (source.rules.length === 0) problems.push(`分区没有点亮规则：${source.section}`);
  }
  return problems;
}
