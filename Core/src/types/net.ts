import type { AvatarConfig } from "./avatar.js";
import type { BuildingPlacement } from "./building.js";
import type { PlayerId } from "./base.js";
import type { ContainerContents } from "./cooking.js";
import type { ItemId } from "./items.js";
import type { PlacedFurniture } from "./furniture.js";
import type { InventorySave, ItemQuality } from "./inventory.js";
import type {
  ParticipantAppearance,
  ParticipantGesture,
  ParticipantTransform,
} from "./runtime.js";
import type { WorldClockSave, WorldDayId } from "./time.js";
import type { WeatherSave } from "./weather.js";
import type { DroppedItem, WorldSave } from "./world.js";
import type { ResidentKeyframe, ResidentSave, ResidentWireIntent } from "./residents.js";

/**
 * 联机协议的共享形状。**客户端和服务端 import 的是同一个文件**——
 * 这正是服务端选 TypeScript 的第一理由：形状只写一遍，漂移不可能发生。
 * 人读的那份契约在 contracts/multiplayer_protocol.md，两边必须同步改。
 *
 * 传输走 socket.io（Backend 骨架已定）：事件名就是路由，不再套一层
 * 自己的 envelope；需要应答的请求用 socket.io 的 ack 回调，服务端
 * 统一回 `XxxOk | NetError`。
 *
 * ---- 权威模型（V0.9，3D 修订版）----
 *
 * 会话期间服务端持有房主的 WorldSave 副本。两类流量：
 *
 * - **瞬态**（transform / appearance / gesture / chat）：不改 WorldSave，
 *   服务端只转发。transform 走 volatile（丢一帧无所谓，下一帧就来）；
 *   其余可靠投递。
 * - **耐久**（摆家具、扔捡东西、天气……）：M2+ 的 op 通道，服务端校验后
 *   改 WorldSave、revision+1、全房广播。M1 用 world:refresh 整片刷新
 *   顶位（见下），op 形状定了但先不实现。
 */

/**
 * 协议版本。和存档的 saveSchemaVersion 是**两个独立的数**：
 * 存档改形状不一定动协议，协议加事件不一定动存档。
 * 握手时两个都核——协议不匹配连不上，存档版本不匹配也连不上
 * （服务端不做迁移，它只要求同一房间里所有人版本相同，见契约）。
 *
 * v2（2026-08-04）：加 world:op 通道（见 WorldOp）。
 * v3（2026-08-04）：op 通道加每日任务两种（daily_board_ticked / _claimed）。
 * v4（2026-08-05）：加唱片机换唱片（gramophone_record_set）+ gramophones 刷新切片。
 * v5（2026-08-19）：加浴缸水位转折（bath_water_set）。
 * v6（2026-08-23）：加灯的开关（lamp_switched）+ lamps 刷新切片。
 */
export const NET_PROTOCOL_VERSION = 12;

/** 服务端强制的上限。放在共享类型里，客户端可以在发送前先自查 */
export const NET_LIMITS = {
  /** 每房最多几个人（含房主）。产品定的 5 */
  maxPlayers: 5,
  /** 上传的 WorldSave 序列化后的字节上限 */
  maxWorldBytes: 3_000_000,
  /** 聊天单条长度（和 ChatPanel 的 maxLength 一致） */
  maxChatLength: 200,
  /** 玩家名长度 */
  maxNameLength: 24,
  /** 一条 `sync:residents` 里最多几只（协议 v8）。五人房里活物不会超过这个数 */
  maxResidentKeyframes: 64,
} as const;

/**
 * 玩家的公开侧写。playerId 由**服务端**在入房时分配——它同时是
 * 对象 id 的发号方前缀（见 Frontend 的 State/ids），所以字符集受限：
 * 不得含 ":" 和 "#"。客户端拿到后调 setIdIssuer(playerId)。
 */
export type PublicPlayerProfile = {
  playerId: PlayerId;
  name: string;
  avatar: AvatarConfig;
};

/** 请求侧的侧写：还没有 playerId（等服务端发） */
export type ProfileDraft = {
  name: string;
  avatar: AvatarConfig;
};

// ---- 错误 ----

export type NetErrorCode =
  | "version_mismatch"
  | "bad_request"
  | "not_found"
  | "session_full"
  | "already_in_session"
  | "payload_too_large"
  | "internal";

export type NetError = {
  ok: false;
  code: NetErrorCode;
  /** 给人看的中文说明。客户端直接进聊天记录，所以是文案不是英文枚举 */
  message: string;
};

// ---- 会话 ----

export type SessionCreateRequest = {
  protocolVersion: number;
  saveSchemaVersion: number;
  profile: ProfileDraft;
  world: WorldSave;
  /**
   * 建房那一刻自己站在哪。可选——不带就用零位，第一拍 transform 会纠正。
   * 带上它是为了晚加入的人**第一帧**就把先到者摆对，而不是先看到
   * 一个站在原点的人再瞬移走。
   */
  transform?: ParticipantTransform;
};

export type SessionCreateOk = {
  ok: true;
  sessionId: string;
  /** 邀请码。人念得出来的短码；地址式（"forest 3 号小屋"）是后话 */
  joinCode: string;
  playerId: PlayerId;
  revision: number;
};

export type SessionJoinRequest = {
  protocolVersion: number;
  saveSchemaVersion: number;
  joinCode: string;
  profile: ProfileDraft;
  /** 同 SessionCreateRequest.transform */
  transform?: ParticipantTransform;
};

/** 房间里的一个人：侧写 + 最后一次上报的状态（晚加入的人靠它摆初始位置） */
export type WireParticipant = {
  profile: PublicPlayerProfile;
  transform: ParticipantTransform;
  appearance: ParticipantAppearance;
};

export type SessionJoinOk = {
  ok: true;
  sessionId: string;
  playerId: PlayerId;
  hostPlayerId: PlayerId;
  revision: number;
  /** 房主世界的完整快照。房客拿它灌运行时，**绝不写进自己的存档** */
  world: WorldSave;
  participants: WireParticipant[];
};

export type SessionLeaveOk = { ok: true };

export type SessionEndedEvent = {
  reason: "host_left" | "host_ended";
};

// ---- 瞬态通道 ----

export type TransformEvent = {
  playerId: PlayerId;
  transform: ParticipantTransform;
};

export type AppearanceEvent = {
  playerId: PlayerId;
  appearance: ParticipantAppearance;
};

export type GestureEvent = {
  playerId: PlayerId;
  gesture: ParticipantGesture;
};

export type ParticipantJoinedEvent = {
  participant: WireParticipant;
};

export type ParticipantLeftEvent = {
  playerId: PlayerId;
};

// ---- 聊天 ----

export type ChatSendRequest = { text: string };

export type ChatMessageEvent = {
  playerId: PlayerId;
  name: string;
  text: string;
  atMs: number;
};

// ---- 世界刷新（M1 的整片同步，M2 起被 op 通道逐步替代）----

/**
 * 房主世界变了，把变化的**切片**推给全房。
 *
 * M1 没有 op 通道，但房主自己在世界里过日子（摆家具、扔东西、天气重掷），
 * 房客不能看着一个冻结的世界。整片刷新是最笨也最稳的同步：房主端 debounce
 * 后把变过的切片整个发出来，房客端用现成的 restore* 函数原样灌回去。
 * 5 人房、变更低频，这个流量完全付得起；等 M2 的 op 通道上线，
 * 这条就退化成兜底（掉包后的重对齐）。
 *
 * 切片全部可选：变哪片发哪片。
 */
export type WorldRefreshSlices = {
  placedFurniture?: PlacedFurniture[];
  droppedItems?: DroppedItem[];
  inventories?: Record<string, InventorySave>;
  weather?: WeatherSave;
  clock?: WorldClockSave;
  /** 每台唱片机装着哪张唱片（协议 v4）。形状同 WorldSave.gramophones */
  gramophones?: Record<string, { recordItemId: string }>;
  /** 哪几盏灯被关掉了（协议 v6）。形状同 WorldSave.lamps，缺条目 = 开着 */
  lamps?: Record<string, { on: boolean }>;

  /**
   * 玩家在领地里建的建筑（协议 v7）。形状同 WorldSave.buildings。
   *
   * 补这一片之前，期 2 的全部内容在联机里等于不存在：进场那一下 hydrate
   * 房主整份世界所以看得见，但**做客期间房主盖的墙、石傀儡完工的工地、
   * 罐里涨的钱，房客一概不会更新**——一个人在那儿盖房子，另一个人看着
   * 一块空地。
   *
   * 罐子的液面也搭这趟车：`fill` 存在建筑实例的 state 里，跟着这一片走。
   */
  buildings?: BuildingPlacement[];

  /**
   * 已解锁的进度 id（协议 v7）。形状同 `WorldSave.progression.unlockedFeatureIds`。
   *
   * 领地开没开哪块地就记在这里面（`plot.*`），所以扩地要靠它同步——
   * 不发的话房主推倒界桩、围栏往外挪一圈，房客那边纹丝不动。
   *
   * 发整份而不是"新开了哪块"：**只增不减**的集合整份覆盖最省心，
   * 漏包、乱序都收敛到同一个结果。和灯那片发绝对状态是同一个道理。
   */
  unlockedFeatureIds?: string[];

  /**
   * 活物（协议 v8，居民系统 01c）。形状同 `WorldSave.pets`（字段名跟存档一致）。
   *
   * 补这一片之前，房客进场时拿到一次快照，之后两端各跑各的状态机、各掷各的
   * 骰子——A 看见史莱姆在北边、B 看见它在南边是必然。这一片管**生灭与对账**
   * （谁来了、谁走了、位置差太多就放回去）；逐步的行为靠 `resident_intent` op，
   * 走路途中的偏差靠 `sync:residents` 关键帧。
   */
  pets?: Record<string, ResidentSave>;

  /**
   * 委托状态表（协议 v9，居民系统 05）。形状同 `WorldSave.favors`。
   * 房客靠它画"！"气泡；委托本身是房主和邻居的事，房客按 F 只是闲聊。
   */
  favors?: WorldSave["favors"];

  /** 门口展示位与门牌（协议 v10，居民系统 07）。形状同 `WorldSave.porch` */
  porch?: WorldSave["porch"];

  /** 居民房室内槽位（协议 v11，居民系统 08）。形状同 `WorldSave.interiors` */
  interiors?: WorldSave["interiors"];

  /** 信箱（协议 v12，居民系统 10）。房客只读：能翻信，"收下"和"写信"不给 */
  mailbox?: WorldSave["mailbox"];
};

/**
 * 刷新切片的**键白名单**。服务端拿它校验（未知键 = 坏客户端，整条拒绝）。
 *
 * ## 为什么这张表必须住在 Core
 *
 * 它原来是抄在 Backend 的 `validate.ts` 里的一份字面量，和上面这个类型
 * 各写各的。2026-08-23 的审计发现两边已经走散了：协议 v6 给客户端加了
 * `lamps` 并每次刷新都发，而 Backend 那张表没跟上——于是**每一次世界
 * 刷新都被整条打回**，房客连家具、天气都不再同步。没有任何东西报错，
 * 因为拒绝的分支就是 `return null`。
 *
 * 现在类型和表在同一个文件里，而且下面那行编译期断言把它们钉在一起：
 * 往 `WorldRefreshSlices` 加字段却忘了加进这张表，**Core 当场编译不过**。
 * 这是那次走散唯一治得住的修法——靠人记得改两处，迟早再走散一次。
 */
export const WORLD_REFRESH_KEYS = [
  "placedFurniture",
  "droppedItems",
  "inventories",
  "weather",
  "clock",
  "gramophones",
  "lamps",
  "buildings",
  "unlockedFeatureIds",
  "pets",
  "favors",
  "porch",
  "interiors",
  "mailbox",
] as const;

/**
 * 编译期断言：类型里的每一个键都在白名单里。
 *
 * 漏一个的话这里会报 "Type 'xxx' does not satisfy..."，指名道姓告诉你
 * 漏了哪个键。反过来（表里多一个类型没有的）由 `as const` 的字面量
 * 类型和下面的 satisfies 一起挡住。
 */
type MissingFromKeys = Exclude<
  keyof WorldRefreshSlices,
  (typeof WORLD_REFRESH_KEYS)[number]
>;

/**
 * `T extends never` 是这里唯一管用的写法。
 * 写成 `const x: MissingFromKeys[] = []` 是拦不住的——空数组对任何元素
 * 类型都合法，漏了键也照样编译过（第一版就这么写的，加一片假切片试出来的）。
 */
type AssertNoMissingKeys<T extends never> = T;

/**
 * 这个类型**只为报错而存在**，没有任何运行时意义：
 * `WorldRefreshSlices` 里有键不在 `WORLD_REFRESH_KEYS` 里时，它编译不过。
 *
 * 导出是因为前端那边开了 `noUnusedLocals`——不导出的话它在最严的那个
 * 消费者里会被当成"没人用的局部类型"报掉，而它恰恰是最该留着的一行。
 */
export type WorldRefreshKeysAreComplete = AssertNoMissingKeys<MissingFromKeys>;

// 反向：表里不能有类型里没有的键
const _keysAreRealSlices: readonly (keyof WorldRefreshSlices)[] =
  WORLD_REFRESH_KEYS;
void _keysAreRealSlices;

export type WorldRefreshEvent = {
  revision: number;
  slices: WorldRefreshSlices;
};

// ---- 世界操作（op 通道，协议 v2）----

/**
 * 一次**世界突变**的即时广播。谁做了什么，发生的那一刻发出去，
 * 房里其他人各自重放同一个动作——扔出去的东西大家看到同一条抛物线，
 * 拆掉的纸箱立刻从所有人眼前消失，不用等整片刷新的防抖。
 *
 * 和 world:refresh 的分工：**op 管即时，refresh 管收敛**。op 是
 * 尽力而为的转发（服务端不逐条校验游戏规则），漏一条、乱一次序都由
 * 房主随后的整片刷新拉回来。这个组合比"全靠刷新"快一个量级，
 * 又比"全靠 op 且服务端仲裁"（真正的 M2）便宜一个量级。
 *
 * 权限：**当前所有参与者都可以发**（2026-08-04 定：进来的人先给满权限，
 * 分级是以后的事）。id 撞不了——每人发的对象 id 都带自己的发号方前缀。
 *
 * 形状约定：每种 op 携带**结果所需的全部数据**（完整的家具实例、
 * 完整的槽位内容），而不是"去查你本地的状态"——接收方的状态可能
 * 落后半拍，op 必须自带真相。
 */
export type WorldOp =
  | {
      kind: "furniture_placed";
      placed: PlacedFurniture;
    }
  | {
      kind: "furniture_removed";
      instanceId: string;
    }
  | {
      /**
       * 厨房槽位内容定格（投料/拿起/起锅/倒掉全都归结为一次置位）。
       * content 是 HeldStack 的线上形状——结构相同但**不 import 那个类型**：
       * 它定义在 logic/cookingRules（规则层），types 反向依赖 logic 会把
       * 层级搅成环。null = 槽位清空。
       */
      kind: "kitchen_slot_set";
      instanceId: string;
      slotId: string;
      content: {
        itemId: ItemId;
        quality?: ItemQuality;
        container?: ContainerContents;
      } | null;
    }
  | {
      /** 扔出去。带初始参数，各端本地重放同一条抛物线 */
      kind: "item_thrown";
      id: string;
      roomId: string;
      stack: DroppedItem["stack"];
      from: { x: number; z: number };
      heading: number;
    }
  | {
      /** 直接放在某处（读档除外的轻放/系统放置） */
      kind: "item_settled";
      item: DroppedItem;
    }
  | {
      /** 从地上消失（被捡走 / 被锅吸收） */
      kind: "item_removed";
      id: string;
    }
  | {
      /** 一个储物箱的整箱内容。箱级替换，比逐格 op 抗竞争 */
      kind: "storage_box_set";
      box: InventorySave;
    }
  | {
      /**
       * 有人给唱片机换了唱片（协议 v4）。旧唱片弹出来那一下走
       * item_thrown（现成的抛物线 op），这条只负责"机器里现在是哪张"。
       * 幂等：同一张再设一次就地跳过。
       */
      kind: "gramophone_record_set";
      instanceId: string;
      recordItemId: string;
    }
  | {
      /**
       * 有人拉了一盏灯的开关（协议 v6）。
       *
       * **发绝对状态不发"切一下"**：op 通道是尽力而为的转发，不保证不
       * 重复、不保证有序。发"toggle"的话丢一包或重一包，两个人屋里的
       * 亮度就永久相反了；发 on/off 则重放几次都收敛到同一个结果。
       */
      kind: "lamp_switched";
      instanceId: string;
      on: boolean;
    }
  | {
      /**
       * 有人给每日任务打了一个勾（V0.11）。
       *
       * **不带 instanceId**：进度是全家一份（`WorldSave.dailyBoard`），
       * 不属于哪一台机器。
       *
       * **发绝对进度不发 +1**：op 通道是尽力而为的转发（不保证不重复、
       * 不保证有序），增量在这种通道上必然算歪。
       *
       * `worldDayId` 用来丢弃跨天边界上的迟到包——凌晨 4 点前发出、
       * 4 点后才到的那条，不该把新一天的进度顶成 1。
       */
      kind: "daily_board_ticked";
      worldDayId: WorldDayId;
      progress: number;
    }
  | {
      /**
       * 今日奖励已发放。**吐东西本身走 item_thrown**（现成的抛物线 op），
       * 这条只负责置 claimed——它的价值是让**后加入的人**也知道今天领过了。
       */
      kind: "daily_board_claimed";
      worldDayId: WorldDayId;
    }
  | {
      /**
       * 浴缸水位的**转折点**（协议 v5）：开始注水 / 满 / 开始放水 / 空。
       * 带绝对 level 和 flow——接收方从这个水位按同一速率自己往下推，
       * 中间不逐帧发（op 通道不保证有序，增量必歪）。幂等：同值再设跳过。
       */
      kind: "bath_water_set";
      instanceId: string;
      level: number;
      flow: "in" | "out" | "still";
    }
  | {
      /**
       * 房主端一只活物换上了新 Intent（协议 v8）。房客用同一套动词自己走——
       * 意图复制 + 关键帧纠偏，不是全量位置流（见居民系统 01 的联机那节）。
       * **只有房主发**；房客是木偶，自己不决策。
       */
      kind: "resident_intent";
      residentId: string;
      intent: ResidentWireIntent;
      atMs: number;
    };

/**
 * op 的 kind 白名单。**Backend 从这里读**，不再手抄一份——手抄那份和类型
 * 各写各的，正是 `WORLD_REFRESH_KEYS` 在 2026-08-23 走散过的那种 bug
 * （加了 lamps 没加白名单，整条刷新被静默打回）。下面的编译期断言把它和
 * `WorldOp` 钉在一起：往联合里加一种 op 却忘了加进这张表，Core 当场编译不过。
 */
export const WORLD_OP_KINDS = [
  "furniture_placed",
  "furniture_removed",
  "kitchen_slot_set",
  "item_thrown",
  "item_settled",
  "item_removed",
  "storage_box_set",
  "gramophone_record_set",
  "lamp_switched",
  "daily_board_ticked",
  "daily_board_claimed",
  "bath_water_set",
  "resident_intent",
] as const;

type MissingOpKinds = Exclude<WorldOp["kind"], (typeof WORLD_OP_KINDS)[number]>;
type AssertNoMissingOpKinds<T extends never> = T;
export type WorldOpKindsAreComplete = AssertNoMissingOpKinds<MissingOpKinds>;
const _opKindsAreReal: readonly WorldOp["kind"][] = WORLD_OP_KINDS;
void _opKindsAreReal;

/**
 * 活物关键帧流（协议 v8）。房主每 0.5 秒发一次**有变化的**那几只；房客拿它纠偏：
 * 偏差 < 0.6 m 忽略，0.6~3 m 用 0.3 s 插过去，> 3 m 直接放。服务端只接受房主发的。
 */
export type ResidentKeyframesEvent = {
  atMs: number;
  residents: ResidentKeyframe[];
};

export type WorldOpEvent = {
  playerId: PlayerId;
  op: WorldOp;
};

// ---- 事件名 ----

/**
 * socket.io 的事件名常量。两边都从这里取，杜绝手打字符串对不上。
 * `c2s` = 客户端发起（多数带 ack），`s2c` = 服务端广播。
 */
export const NET_EVENTS = {
  c2s: {
    sessionCreate: "session:create",
    sessionJoin: "session:join",
    sessionLeave: "session:leave",
    transform: "sync:transform",
    appearance: "sync:appearance",
    gesture: "sync:gesture",
    chat: "chat:send",
    worldOp: "world:op",
    worldRefresh: "world:refresh",
    residents: "sync:residents",
  },
  s2c: {
    sessionEnded: "session:ended",
    participantJoined: "participant:joined",
    participantLeft: "participant:left",
    transform: "sync:transform",
    appearance: "sync:appearance",
    gesture: "sync:gesture",
    chat: "chat:message",
    worldOp: "world:op",
    worldRefresh: "world:refresh",
    residents: "sync:residents",
  },
} as const;
