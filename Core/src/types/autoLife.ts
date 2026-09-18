import type { DayPhaseId } from "./time.js";
import type { WeatherKind } from "./weather.js";

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
 *
 * 2026-09-13 扩成五种（专注模式 01·乙）：用户要角色"过自己的日子"——
 * 吃饭、补精力、出门溜达。`nap` 躺床回一点精力，`outing` 开大门去院子里
 * 走一圈（下雨看背包里有没有伞）。
 */
export type AutoStepKind = "work" | "eat" | "nap" | "water" | "outing" | "stroll";

/** 计划器排进清单里的一步 */
export type AutoStepPlan = {
  kind: AutoStepKind;
  /** 到位之后停留多久（演出时长）。走路的时间不算在内——那由路程决定 */
  dwellSeconds: number;
  /** 出门撑不撑伞。只有 `outing` 会带：天气表写着"有伞才出"、背包里也真有伞 */
  umbrella?: boolean;
};

/**
 * 决策时看得到的世界快照。**纯数据**，由 Frontend 采集好递进来——
 * 决策函数自己不许摸任何状态仓库，不然就测不了了。
 */
export type AutoLifeSnapshot = {
  /** 饱食 0~100 */
  hunger: number;
  /**
   * 精力 0~100。HUD 上叫「精力」，代码里沿用 fatigue 这个名字——**越高越有劲**
   * （`canAfford` 判的就是 fatigue ≥ 代价）。小睡按它判
   */
  fatigue: number;
  /** 背包里能直接吃的东西还有几件（带 food 块的物品总数） */
  edibleCount: number;
  /** 距离上一次离开工位（吃饭/溜达）过了多少秒。刚坐下时为 0 */
  secondsSinceBreak: number;
  /** 游戏钟当天的第几分钟（0~1439）。饭点按它判 */
  minuteOfDay: number;
  /** 时段。出门只在 `autoLifeTuning.outingPhases` 里的时段 */
  dayPhase: DayPhaseId;
  /** 此刻的天气种类。出门查 `autoLifeTuning.outingWeather` */
  weatherKind: WeatherKind;
  /** 背包（含快捷栏）里有没有伞 */
  hasUmbrella: boolean;
  /** 出得去门吗：有大门、没锁（开场锁门那段、剧情锁门都挡在这里） */
  canGoOutside: boolean;
  /** 家里有没有空着的"躺"锚点（床、地铺）。没床就不小睡——不让人躺地板 */
  hasFreeBed: boolean;
  /**
   * 田里缺水的格数（种植系统，2026-09-17）。田把"缺水的格 + 坐标"交出来，
   * 决策只看数——田在哪、走哪条路是剧本的事
   */
  thirstyCells: number;
  /** 背包里最好的那把壶：还有几格水、装得下几格。没有 = null */
  wateringCan: { charges: number; capacity: number } | null;
  /** 这张图上有没有水源（带 WaterSource 的家具，比如井）：壶空了能不能去装 */
  hasWaterSource: boolean;
  /**
   * 每种步子**上次结束**过了多少秒。没做过的不在表里（= 不在冷却）。
   *
   * 冷却放进快照让 Core 判，而不是计划器自己 if：判完才能"这一行冷却中，
   * 往下看下一行"。原来吃饭冷却在计划器里直接 return，那一拍连溜达都不掷。
   */
  secondsSinceStep: Partial<Record<AutoStepKind, number>>;
};

/**
 * 出门看天气的一格：出 / 背包里有伞才出（出的时候撑着）/ 不出。
 *
 * 用户原话"下雨会判断有没有伞在背包里，如果有，撑伞出门，没有就尽量不出门之类的"。
 * 以后"下雪要围巾""大太阳戴草帽"，就是这里多一种值、背包里多查一件东西。
 */
export type OutingWeatherRule = "go" | "umbrella" | "stay";

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
  /** 这一步结束之后多久内不再排它。0 = 不冷却 */
  cooldownSeconds: number;
  /**
   * 等身体到位最多多久，过了视同到位（场景不在、路断了时别让计划器卡死）。
   * 按步子分开给而不是一个全局数：出门那一整圈要一分多钟
   */
  arriveTimeoutSeconds: number;
  soundscape: string[];
};
