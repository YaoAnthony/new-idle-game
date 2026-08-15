import type { GameSave } from "./save.js";
import type { UtcTimestamp } from "./time.js";

/**
 * 账户与云存档的共享形状。**客户端和服务端 import 的是同一个文件**——
 * 和 net.ts 同一纪律：形状只写一遍，漂移不可能发生。
 * 人读的契约在 contracts/account_protocol.md，两边必须同步改。
 *
 * 传输走 REST（不是 socket.io）：登录/存档是低频请求-应答，不需要长连接。
 * 响应统一 `XxxOk | AccountError` 判别式，风格对齐 net.ts。
 *
 * ---- 权威模型 ----
 *
 * 本地 IndexedDB 是运行时唯一读写的存档；云端是一份**受控副本**，只在
 * 进（启动对账）、中（节流推送）、出（退出冲刷）三个时机被同步引擎触碰。
 * 服务端对存档内容是保管员不是裁判：只做字节封顶 + 顶层结构探测，
 * 迁移知识全在客户端（migrateSave）。
 */

/**
 * 协议版本。改任何请求/响应形状就 +1。REST 无握手，不逐请求核对，
 * 预留给未来"强制升级客户端"的判定。
 */
export const ACCOUNT_PROTOCOL_VERSION = 1;

/** 服务端强制的上限。放共享类型里，客户端发送前可先自查 */
export const ACCOUNT_LIMITS = {
  /** RFC 5321 的邮箱长度上限 */
  maxEmailLength: 254,
  minPasswordLength: 8,
  /** bcrypt 的输入硬上限：72 字节之后被静默截断，所以干脆拒绝 */
  maxPasswordLength: 72,
  /** 云存档序列化字节上限（> NET_LIMITS.maxWorldBytes 的 3MB，留出玩家侧数据的余量） */
  maxSaveBytes: 4_000_000,
  /**
   * pagehide 时 keepalive fetch 的安全上限。浏览器对 keepalive 请求体
   * 有 64KB 硬限，超了请求直接失败——超限时不发，靠下次启动补推。
   */
  keepaliveSafeBytes: 60_000,
} as const;

export type AccountUser = {
  /** 服务端生成的 uuid */
  id: string;
  /** 已小写归一 */
  email: string;
  /** false = google-only 账号（UI 据此隐藏"改密码"类入口） */
  hasPassword: boolean;
  createdAtUtc: UtcTimestamp;
};

// ---- 请求体 ----

export type RegisterRequest = { email: string; password: string };
export type LoginRequest = { email: string; password: string };
/** idToken 是 @react-oauth/google 回调里的 credential */
export type GoogleLoginRequest = { idToken: string };

// ---- 错误 ----

export type AccountErrorCode =
  /** 结构/格式校验失败（400） */
  | "bad_request"
  /** 注册：邮箱已被密码账号占用（409） */
  | "email_taken"
  /** 注册：邮箱已被 google-only 账号占用，去用 Google 登录（409） */
  | "email_uses_google"
  /** 登录：邮箱或密码错（401，恒定时序，不区分哪个错） */
  | "invalid_credentials"
  /** google idToken 验签失败 / aud 不对 / email 未验证（401） */
  | "invalid_google_token"
  /** Bearer 缺失/过期/篡改（401） */
  | "unauthorized"
  /** 429 */
  | "rate_limited"
  /** 413 */
  | "payload_too_large"
  /** 云存档顶层结构探测失败（422） */
  | "invalid_save"
  /** PUT 乐观并发失败（409），载荷是 SavePutConflict */
  | "revision_conflict"
  /** 云端无档（GET /api/saves/me 的 404） */
  | "no_save"
  /** 服务端没配 GOOGLE_CLIENT_ID（503） */
  | "not_configured";

export type AccountError = {
  ok: false;
  code: AccountErrorCode;
  message: string;
};

// ---- 响应 ----

/** register / login / google 共用 */
export type AuthOk = { ok: true; token: string; user: AccountUser };
export type MeOk = { ok: true; user: AccountUser };

/** 云端存档的元信息（不含 payload，供启动对账比对用） */
export type SaveHead = {
  /** 从 1 起；0 保留给"无档"语义（首传 baseRevision 用 0） */
  revision: number;
  updatedAtUtc: UtcTimestamp;
  /** 上传时客户端报的 SAVE_SCHEMA_VERSION */
  saveSchemaVersion: number;
  byteSize: number;
  /** 最后写入的设备（冲突 UI 显示"另一台设备"用） */
  deviceId: string;
  /**
   * 最后一次写入的 writeId。客户端据此认出**"这一版就是我自己推上来的"**——
   * 推送成功但响应没收到（关标签页、网络抖动）时，本地基准停在旧 revision，
   * 光比 revision 会把自己的写当成别人的改动，给单机玩家弹一个假冲突框。
   * 客户端持久化 pendingWriteId，启动时一比就知道那一版的来历。
   */
  lastWriteId: string;
};

export type SaveHeadOk = {
  ok: true;
  /** null = 云端无档 */
  head: SaveHead | null;
};

export type SaveGetOk = { ok: true; revision: number; save: GameSave };

/**
 * baseRevision 语义（服务端单事务判定）：
 * - 云端无档：仅接受 0，写入后 revision=1；
 * - 云端有档：等于当前 revision 才写入（revision+1），否则 409 revision_conflict；
 * - -1 = **强制覆盖**：冲突框里玩家点了"用本机"之后的专用值，
 *   正常自动同步永远不发 -1。
 * 覆盖前服务端都会把当前 payload 挪进 prev_*（一份轮转备份）。
 */
export const FORCE_OVERWRITE_REVISION = -1;

export type SavePutRequest = {
  baseRevision: number;
  /**
   * 客户端每次写生成的 uuid，网络重试时**复用同一个**——
   * 服务端据此幂等：上次写成功但响应丢了的重试直接返回成功，不重复写。
   */
  writeId: string;
  /** 客户端首启生成、持久化的设备 uuid */
  deviceId: string;
  saveSchemaVersion: number;
  save: GameSave;
};

export type SavePutOk = {
  ok: true;
  revision: number;
  updatedAtUtc: UtcTimestamp;
};

/** 409 的载荷：带上云端现状，客户端直接进冲突流程，不用再 GET head */
export type SavePutConflict = AccountError & {
  code: "revision_conflict";
  currentRevision: number;
  currentUpdatedAtUtc: UtcTimestamp;
  currentSaveSchemaVersion: number;
  currentDeviceId: string;
};
