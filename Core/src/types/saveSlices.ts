import type { PlayerSave } from "./player.js";
import type { WorldSave } from "./world.js";

/**
 * **持久状态的唯一声明点**（2026-09-13）。
 *
 * `WorldSave` / `PlayerSave` 的每一个键在这里都得有一行——漏一行 Core
 * 编译不过。存档序列化、读档顺序、自动存档触发、房主刷新、房客应用、
 * 服务端合并、契约文档，全部从这两张表**派生**，不再各抄一份。
 *
 * ## 为什么要有这一层
 *
 * 在此之前，一片要存档又要联机的状态得手改 ~10 个文件 14 处（加 op 18 处），
 * 其中只有 2 处有编译期保护。porch / mailbox / flags 三次接入都漏了同样的
 * 两处（服务端 `applyRefresh`、自动存档触发名单），于是晚进房的人看到的是
 * 建房那一刻的委托 / 信箱 / 旗子，而且没有任何东西报错。审计的结论是
 * "靠人记得改 N 处"这条路已经断了——porch 接进来的人**知道**要改服务端，
 * 照样漏了。
 *
 * ## 三个写法上的命门
 *
 * 1. 表的类型是 `{ [K in Key]-?: … }`——**`-?` 不能省**。`WorldSave` 里 20 多个
 *    键是可选的（`buildings?`），同态映射类型会原样保留 `?`，于是这 20 多个
 *    键一个都不登记也能编译过。给 `keyof WorldSave` 起别名也不救：TS 看得穿。
 * 2. 表用 `as const satisfies`，**不是**类型注解。注解会把 `sync: "refresh"`
 *    拓宽成 `string`，下面派生的 `RefreshSliceKey` 立刻退化成 `never`，
 *    `WorldRefreshSlices` 变成 `{}`——所有同步静默消失，编译还是绿的。
 *    `Core/tests/saveSlices.test.ts` 里那条"键名逐字相等"就是为这一手滑准备的。
 * 3. 断言类型必须 **export**：Frontend 的 tsconfig 开了 `noUnusedLocals` 且把
 *    `../Core/src` 包进去，不导出会被当成没用的局部类型报掉——而它恰恰是
 *    最该留着的一行（`net.ts` 早先踩过）。
 */

// ---- 键 ----

/**
 * WorldSave 的可登记键。`progression` 展开一层：它下面是六七片各自独立的
 * 状态（事件阶段、剧情规则、统计、成就…），同步策略和读档顺序都不一样，
 * 当成一片会把它们捆死。
 */
export type WorldSliceKey =
  | Exclude<keyof WorldSave, "progression">
  | `progression.${Extract<keyof WorldSave["progression"], string>}`;

/** PlayerSave 的可登记键。`character` 同理展开一层 */
export type PlayerSliceKey =
  | Exclude<keyof PlayerSave, "character">
  | `character.${Extract<keyof PlayerSave["character"], string>}`;

/** 键 → 存档里那一片的值类型 */
export type WorldSliceValue<K extends WorldSliceKey> = K extends `progression.${infer P}`
  ? P extends keyof WorldSave["progression"]
    ? WorldSave["progression"][P]
    : never
  : K extends keyof WorldSave
    ? WorldSave[K]
    : never;

export type PlayerSliceValue<K extends PlayerSliceKey> = K extends `character.${infer P}`
  ? P extends keyof PlayerSave["character"]
    ? PlayerSave["character"][P]
    : never
  : K extends keyof PlayerSave
    ? PlayerSave[K]
    : never;

/** 只为报错而存在：`T` 不是 never 时编译不过，错误信息里会点名多出来的键 */
export type AssertNever<T extends never> = T;

// ---- 世界侧：同步策略 ----

export type WorldSlicePolicy = {
  /**
   * - `refresh`：房主这一片变了就推给全房（`world:refresh` 切片），服务端也合并进会话世界；
   * - `join`：只在入房快照（整份 `WorldSave`）里给，会话中不变（几何、世界 id 这类）；
   * - `none`：不参与联机——房客进房时这一片保留自己的，刷新里也没有。**必须给 reason**：
   *   "忘了登记"和"故意不同步"要能分辨（运行时测试守着）。
   */
  readonly sync: "refresh" | "join" | "none";
  /**
   * 变更频度。`high` 的片（活物：位置每帧动）不进 DEV 指纹兜底，
   * 否则"变了但没发事件"的检测永远为真。
   */
  readonly churn?: "low" | "high";
  /**
   * 线上键名。只有嵌套键需要——`progression.unlockedFeatureIds` 在协议 v7 就是
   * 顶层的 `unlockedFeatureIds`，改线上键名等于改协议，没必要为整齐付这个钱。
   */
  readonly wireKey?: string;
  /** 为什么是这个取值。写给下一个要改它的人 */
  readonly reason?: string;
};

type WorldPolicyTable = { [K in WorldSliceKey]-?: WorldSlicePolicy };

/**
 * 世界侧每一片的同步策略。
 *
 * 取值的历史（原来散在 `net.ts` 各切片的 JSDoc 里，搬过来一条不丢）：
 * - 协议 v4 唱片机、v6 灯、v7 建筑 + 已解锁进度、v8 活物、v9 委托、v10 门口、
 *   v11 室内、v12 信箱、v13 旗子——每一片都是"漏了它房客看到的世界就冻结在
 *   一部分"之后补进来的。
 * - 2026-09-13 起用户拍板：**所有世界切片都要同步**（"报纸是这家的私事"那类
 *   老注释作废），分阶段翻成 `refresh`；此刻还是 `join` 的那几片标着 TODO。
 */
export const WORLD_SLICE_POLICY = {
  worldId: { sync: "join", reason: "世界身份，会话中不变" },
  seed: { sync: "join", reason: "只在建档时定；运行时无人读它（审计 2026-09-13）" },
  house: { sync: "join", reason: "屋子风格。房客进场 hydrate 一次；会话中没有改风格的入口" },
  maps: { sync: "join", reason: "房间几何只在换世界时灌；联机限定 base 图，会话中不会换图" },

  placedFurniture: { sync: "refresh", churn: "low", reason: "M1 起就在。发的是当前图在场的家具（见前端 replicate）" },
  droppedItems: { sync: "refresh", churn: "low", reason: "M1 起就在。房客端对账而不是整体替换：飞行中的要保住运动学" },
  inventories: { sync: "refresh", churn: "low", reason: "M1 起就在。储物箱 / 货架 / 寄售箱的格子" },
  weather: { sync: "refresh", churn: "low", reason: "M1 起就在。房客不重掷日程，天气全靠这一片" },
  clock: { sync: "refresh", churn: "low", reason: "M1 起就在。时区 + 推导依据；拨过的时间偏移（阶段 3）也在这里" },
  gramophones: {
    sync: "refresh",
    churn: "low",
    reason: "协议 v4：每台唱片机装着哪张。谁换了唱片全房间都得听见",
  },
  lamps: {
    sync: "refresh",
    churn: "low",
    reason: "协议 v6：哪几盏灯被关掉了。灯光是共享的物理事实，不是各人的显示偏好",
  },
  buildings: {
    sync: "refresh",
    churn: "low",
    reason:
      "协议 v7：补这一片之前，做客期间房主盖的墙、傀儡完工的工地、罐里涨的钱，房客一概看不到。罐子液面存在实例 state 里，跟着这一片走",
  },
  pets: {
    sync: "refresh",
    churn: "high",
    reason:
      "协议 v8：活物的生灭与对账（谁来了、谁走了、位置差太多就放回去）。逐步行为靠 resident_intent op，走路偏差靠关键帧",
  },
  favors: { sync: "refresh", churn: "low", reason: "协议 v9：房客靠它画委托的「！」气泡" },
  porch: { sync: "refresh", churn: "low", reason: "协议 v10：门口展示位与门牌" },
  interiors: { sync: "refresh", churn: "low", reason: "协议 v11：居民房室内槽位，房客进他家看到的和房主一样" },
  mailbox: { sync: "refresh", churn: "low", reason: "协议 v12：房客能翻信，收不了附件" },
  flags: { sync: "refresh", churn: "low", reason: "协议 v13：房客按 F 要知道今天是谁的生日" },
  "progression.unlockedFeatureIds": {
    sync: "refresh",
    churn: "low",
    wireKey: "unlockedFeatureIds",
    reason:
      "协议 v7：领地开没开哪块地记在这里，扩地要靠它同步。发整份而不是增量——只增不减的集合整份覆盖最省心，漏包乱序都收敛",
  },

  // ---- 下面这些今天还是 join，阶段 3（协议 v14）全部翻成 refresh ----
  doors: { sync: "join", reason: "TODO 阶段 3 翻 refresh：门锁状态两端要一致；开关本身走 door_set op（阶段 5）" },
  baseGold: { sync: "join", reason: "TODO 阶段 3 翻 refresh：钱匣那 10 枚，房客 HUD 看到的余额今天是旧的" },
  chatLog: { sync: "join", reason: "TODO 阶段 3 翻 refresh：消息流。实时消息走聊天通道，这一片管收敛" },
  dayFacts: { sync: "join", reason: "TODO 阶段 3 翻 refresh：昨日事实（报纸素材）" },
  residentTrips: { sync: "join", reason: "TODO 阶段 3 翻 refresh：谁去了小镇、几点回" },
  tripPlans: { sync: "join", reason: "TODO 阶段 3 翻 refresh：多日出门的计划" },
  travelerStock: { sync: "join", reason: "TODO 阶段 3 翻 refresh：旅行商人这一趟卖掉了什么" },
  newspaper: { sync: "join", reason: "TODO 阶段 3 翻 refresh：报纸。老注释的「家务事不同步」作废（用户 2026-09-13）" },
  dailyBoard: { sync: "join", reason: "TODO 阶段 3 翻 refresh：共享进度今天只靠 op 走，晚进房的人拿到的是开房时的" },
  "progression.events": { sync: "join", reason: "TODO 阶段 3 翻 refresh：事件阶段。房客端的对话条件读它" },
  "progression.firedStoryRuleIds": { sync: "join", reason: "TODO 阶段 3 翻 refresh：房客端剧情不跑，但条件要读得到最新的" },
  "progression.signalCounts": { sync: "join", reason: "TODO 阶段 3 翻 refresh" },
  "progression.poolMisses": { sync: "join", reason: "TODO 阶段 3 翻 refresh" },
  "progression.stats": { sync: "join", reason: "TODO 阶段 3 翻 refresh：统计表。做客期间自己不记（stats.ts），看到的是房主的" },
  "progression.achievements": { sync: "join", reason: "TODO 阶段 3 翻 refresh：成就的达成日 / 领奖日" },
  "progression.codex": { sync: "join", reason: "TODO 阶段 3 翻 refresh：图鉴的初见日。做客不记（用户 2026-09-15）" },

  gameRules: { sync: "none", reason: "死字段：全仓无读写（审计 2026-09-13），阶段 6 删" },
} as const satisfies WorldPolicyTable;

/** 全部世界键，按表的声明序 */
export const WORLD_SLICE_KEYS = Object.keys(WORLD_SLICE_POLICY) as readonly WorldSliceKey[];

// ---- 玩家侧：只登记键（玩家数据从不联机，做客期间的合成规则在前端 Data/Save）----

export const PLAYER_SLICE_KEYS = [
  "playerId",
  "name",
  "avatar",
  "actionGroups",
  "pendingGold",
  "birthday",
  "character.inventory",
  "character.inventoryId",
  "character.needs",
  "character.heldItem",
  "character.position",
  "character.restingOn",
  "discoveredRecipeIds",
  "actionEntries",
  "dailyTasks",
  "actionLog",
  "diary",
  "activeActionProcess",
] as const satisfies readonly PlayerSliceKey[];

/** PlayerSave 里有键不在上面那张表里时，这里编译不过 */
export type PlayerSliceKeysAreComplete = AssertNever<
  Exclude<PlayerSliceKey, (typeof PLAYER_SLICE_KEYS)[number]>
>;

// ---- 派生：刷新切片（`net.ts` 原来手写的那份从此消失）----

type WireKeyOf<K extends WorldSliceKey> = (typeof WORLD_SLICE_POLICY)[K] extends {
  wireKey: infer W extends string;
}
  ? W
  : K;

/** 策略是 refresh 的那些存档键 */
export type RefreshSliceKey = {
  [K in WorldSliceKey]: (typeof WORLD_SLICE_POLICY)[K]["sync"] extends "refresh" ? K : never;
}[WorldSliceKey];

/**
 * `world:refresh` 的载荷：房主变哪片发哪片，全部可选。
 * 键名是线上键（`wireKey`，没有就等于存档键），值的形状和存档里一模一样。
 */
export type WorldRefreshSlices = {
  [K in RefreshSliceKey as WireKeyOf<K>]?: WorldSliceValue<K>;
};

/** 刷新切片的键白名单（线上键）。服务端拿它校验：未知键 = 坏客户端，整条拒绝 */
export const WORLD_REFRESH_KEYS: readonly string[] = WORLD_SLICE_KEYS.filter(
  (key) => WORLD_SLICE_POLICY[key].sync === "refresh",
).map((key) => wireKeyOf(key));

/** 线上键 → 存档键。服务端合并和房客应用都靠它把 `unlockedFeatureIds` 放回 progression 下面 */
export const WIRE_KEY_TO_SLICE: Readonly<Record<string, WorldSliceKey>> = Object.fromEntries(
  WORLD_SLICE_KEYS.filter((key) => WORLD_SLICE_POLICY[key].sync === "refresh").map((key) => [
    wireKeyOf(key),
    key,
  ]),
);

export function wireKeyOf(key: WorldSliceKey): string {
  const policy: WorldSlicePolicy = WORLD_SLICE_POLICY[key];
  return policy.wireKey ?? key;
}
