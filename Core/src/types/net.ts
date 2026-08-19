import type { AvatarConfig } from "./avatar.js";
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
 */
export const NET_PROTOCOL_VERSION = 5;

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
};

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
  },
} as const;
