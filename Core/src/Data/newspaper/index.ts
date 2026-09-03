/**
 * 报纸的编辑方针（期 7）。**改版面轻重只动这一个文件。**
 *
 * 这里放的是"哪种事更值得上头版"和"哪种事算邻居动态"——都是**数据表
 * 不是 if 链**。加一种大事（以后的节日、餐厅开张）是往表里加一行，
 * 不是回去改挑选逻辑。
 *
 * 挑选算法本身在 `logic/newspaper.ts`，纯函数，一条 if 都没有。
 */

/**
 * 哪种事更值得上头版。数字大的赢。
 *
 * 排序的依据是**这件事对玩家的意外程度**，不是它的经济价值：
 * 被偷钱只有八枚，但那是"有人闯进来了"；卖出一件家具可能赚得更多，
 * 却是每天都在发生的事。头版留给意外。
 *
 * 表里没有的 kind 一律算 0——**不会崩，只是上不了头版**。
 * 这条兜底是有意的：新加的事件源忘了登记时，它安静地待在正文里，
 * 而不是让整份报纸出不来。
 */
export const headlinePriority: Record<string, number> = {
  /** 被偷了。没有比这更大的 */
  theft: 100,
  /** 贼被抓回来了 */
  theft_settled: 95,
  /** 新邻居搬来 */
  resident_moved_in: 90,
  /** 盖好了一栋楼 */
  building_completed: 70,
  /** 稀客来了 */
  traveler_visit: 60,
  /** 卖出了东西 */
  shop_sold: 40,
  /** 寄售箱隔夜出了货。和小店同一档：都是"家里做成了生意" */
  consign_sold: 40,
  /** 做完了一件事 */
  action_completed: 10,
};

/**
 * 哪几种事进「邻居动态」那一栏。
 *
 * 和头条**不是互斥的**：搬家既是头条也是邻居动态，报纸本来就会在
 * 头版说一遍、在里面再展开一遍。
 */
export const neighborKinds = new Set([
  "resident_moved_in",
  "shop_sold",
  "consign_sold",
  "restaurant_served",
]);

/**
 * **哪些剧情信号算新闻。** 键是 `StorySignal.kind`，值是报纸里的 kind。
 *
 * 做成一张表而不是在各个系统里散落 `recordHeadlineFact` 调用：
 * 期 7 落地时发现文档声称"期 3 接了失窃、期 4 接了搬家"，**实际一条都
 * 没接**——只有卖货和行动在写事实，报纸永远只能报卖货。散落的写法就是
 * 这么漏的：每个系统的作者都以为别人接了。
 *
 * 一张表之后，"这件事上不上报"是**一行数据**，而且一眼看得全。
 */
export const newsworthySignals: Record<string, string> = {
  resident_moved_in: "resident_moved_in",
  building_completed: "building_completed",
};

/**
 * **哪些剧情阶段算新闻。** 键是 `"事件id:阶段id"`，值是报纸里的 kind。
 *
 * 剧情事件不发 `story_signal`，它走的是 `event_progress_changed`
 * （带 eventId + stageId），所以另开一张表。失窃那条链有五幕，
 * 但只有两幕值得上报：**东西没了**和**东西回来了**——中间那三幕
 * （水獭上门、见到贼）是过程，报纸不写过程。
 */
export const newsworthyStages: Record<string, string> = {
  "gold_theft:robbed": "theft",
  "gold_theft:settled": "theft_settled",
};

/** 报名最多几个字。报头一行要放得下 */
export const paperNameLimit = 8;
