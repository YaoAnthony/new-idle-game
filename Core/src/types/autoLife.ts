/**
 * 自动生活（专注期间角色自己过日子）的类型。
 *
 * ---- 定位（2026-08-29 和用户敲定）----
 *
 * 只在专注期间开。本质是挂机陪伴：玩家在现实里干活，游戏窗口在旁边
 * 实时演角色的小生活——坐在桌前干活，饿了起身做口饭，偶尔溜达一圈。
 * **声音是第一产出**（行为产生白噪音），事后报告只是副产品。
 *
 * ---- 架构（用户点名的形状）----
 *
 * 一个**计划器**（Frontend 的 `AutoLifePlanner`）在专注开始时启动，
 * 维护一条工作清单；**每做完一件事重新评估**要不要插入新的内容。
 * 每种"能干的事"是一个可注册的处理函数——以后有了 NPC 慰问、种植浇水，
 * 就是注册一个新处理器 + 这张表里加一行，计划器本身不动。
 *
 * 这个文件只放**决策要用的形状**；决策规则在 `logic/autoLife.ts`（纯函数，
 * headless 可测），数字在 `Data/autoLife`（内容零硬编码）。
 */

/**
 * 一步能干的事。
 *
 * `work` 是默认态（坐在行动那件家具前），不进这张枚举也行，但进来了
 * 处理器注册表才是完备的——"回去干活"和"去吃饭"在执行层是同一种东西：
 * 走过去、摆姿势、待一段。
 */
export type AutoStepKind = "work" | "eat" | "stroll";

/** 计划器排进清单里的一步 */
export type AutoStepPlan = {
  kind: AutoStepKind;
  /** 到位之后停留多久（演出时长）。走路的时间不算在内——那由路程决定 */
  dwellSeconds: number;
};

/**
 * 决策时看得到的世界快照。**纯数据**，由 Frontend 采集好递进来——
 * 决策函数自己不许摸任何状态仓库，不然就测不了了。
 */
export type AutoLifeSnapshot = {
  /** 饱食 0~100 */
  hunger: number;
  /** 背包里能直接吃的东西还有几件（带 food 块的物品总数） */
  edibleCount: number;
  /** 距离上一次离开工位（吃饭/溜达）过了多少秒。刚坐下时为 0 */
  secondsSinceBreak: number;
};

/**
 * 行为表里的一行。
 *
 * `soundscape`：这一步进行中该响哪些循环（AudioEngine 的 profileId）。
 * **素材和发声接线归用户管**（2026-08-29 的分工），这里只是把位置留好：
 * 行为进入时开、退出时停的生命周期钩子按这个字段读。
 */
export type AutoBehaviorDefinition = {
  kind: AutoStepKind;
  dwellSeconds: number;
  soundscape: string[];
};
