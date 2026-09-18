import type { LocalizationKey } from "./base.js";
import type { StorySignal, StorySignalKind } from "./story.js";

/**
 * 图鉴（2026-09-15）。
 *
 * ## 架构
 *
 * - **图鉴没有自己的内容表。** 它有的是一张「来源表」（`Data/codex`）：哪几张注册表要进图鉴、
 *   每条怎么取 id / 名字 / 介绍 / 图 / 分组、哪些剧情信号点亮它。条目就是注册表的定义本身，
 *   图鉴不复制任何字段——加一件家具、加一位居民，图鉴自动多一格。
 * - **加分区（建筑、配方……）= 来源表加一项 + 文案。** 面板、运行时、存档形状都不动。
 * - **状态进存档**（`WorldSave.progression.codex`）：第一次见到那天。只存"发生过的事实"，
 *   "解锁了没"= 存档里有没有这条（同成就的思路，见 `types/achievements.ts` 文件头）。
 *   记在世界上（用户 2026-09-15 拍板）：做客见到的不算，除非把别人家的家具带回背包、回家再算获得。
 * - **运行时**在 Frontend `Systems/codex.ts`：听 `story_signal`，经 `codexEntriesForSignal` 变成条目 id
 *   落状态；开局对账一次（背包里的家具、屋里摆着的家具、在场的居民）——老档和"带回家"的都靠这一步补上。
 */

/** 图鉴分区。加分区 = 这里加一个字面量 + `Data/codex` 加一项来源 */
export type CodexSectionId = "furniture" | "resident" | "crop";

/** 条目 id：`<分区>:<注册表里的 id>`。同一个注册表 id 进两个分区也不会撞 */
export type CodexEntryId = `${CodexSectionId}:${string}`;

/** 存档里的一条：第一次见到那天（worldDayId）。有这条就是解锁了 */
export type CodexDiscovery = { seenDayId: string };
export type CodexState = Record<string, CodexDiscovery>;

/**
 * 卡片上的图。`iconKey` 走 Frontend `Assets/icons` 的键（`items/<id>` / `residents/<id>`），
 * 那张图不存在时退到 `fallback`（emoji）。
 */
export type CodexIcon = { iconKey: string; fallback: string };

/**
 * 一条点亮规则：某个剧情信号到了，subject 经 `toEntryId` 变成条目 id；返回 null = 与本分区无关。
 * 返回的 id 必须能在 `list()` 里找到，否则 `logic/codex` 丢弃（防止污染存档）。
 */
export type CodexDiscoveryRule = {
  signal: StorySignalKind;
  toEntryId: (subject: string) => CodexEntryId | null;
};

/**
 * 一个分区的来源：从哪张注册表枚举、每条怎么读。`T` 是那张注册表的定义类型。
 */
export type CodexSource<T> = {
  section: CodexSectionId;
  /** 左栏页签名 */
  titleKey: LocalizationKey;
  /** 页签图标（emoji） */
  emoji: string;
  /** 左栏顺序 */
  order: number;
  list(): readonly T[];
  idOf(def: T): string;
  nameKey(def: T): LocalizationKey;
  /** 介绍文案键。缺文案时面板显示 `codex.panel.no_desc` */
  descKey(def: T): LocalizationKey;
  /** 分区内的子分组，面板据此分段；值是文案键 */
  groupKey(def: T): LocalizationKey;
  icon(def: T): CodexIcon;
  rules: readonly CodexDiscoveryRule[];
};

/** 面板消费的展开结果（Core 纯函数产出，前端只渲染） */
export type CodexEntry = {
  id: CodexEntryId;
  section: CodexSectionId;
  /** 注册表里的原 id（家具的 itemId / 居民的 definitionId） */
  sourceId: string;
  nameKey: LocalizationKey;
  descKey: LocalizationKey;
  groupKey: LocalizationKey;
  icon: CodexIcon;
};

export type CodexSectionProgress = { seen: number; total: number };

export type CodexSignal = StorySignal;
