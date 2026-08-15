/**
 * **和 server 说话的唯一出口。**
 *
 * 这条边界的规矩只有一句：`socket.emit` / `socket.on` / `NET_EVENTS`
 * 只允许出现在 `src/Api/` 里。`Game/` 一律调这里导出的类型化函数，
 * 拿不到 socket 实例，也不需要知道事件名长什么样。
 *
 * 立这条界的理由：在此之前线上通信散在 `Game/Net/` 的三个文件、19 处
 * `socket.emit`/`socket.on` 里，552 行的会话状态机同时干着三件事——
 * 拼协议载荷、跑状态机、管房客的存档纪律。想知道"这个游戏一共会往
 * 服务器发几种消息"，得把三个文件读完。现在读这一个目录就够。
 *
 * 分工：
 * - `connection` 连接生命周期（socket 实例**不出目录**）
 * - `session`    三条带 ack 的会话请求
 * - `outbound`   六种发出去就不管的消息
 * - `inbound`    九种入站消息的类型化订阅
 *
 * 会话状态机、名册插值、op 重放都不在这儿——那些是玩法，住 `Game/Multiplayer/`。
 */

export { disconnect, ensureConnected, isConnected } from "./connection.js";

export {
  createSession,
  joinSession,
  leaveSession,
  type CreateSessionRequest,
  type JoinSessionRequest,
} from "./session.js";

export {
  sendAppearance,
  sendChat,
  sendGesture,
  sendTransform,
  sendWorldOp,
  sendWorldRefresh,
} from "./outbound.js";

export {
  onAppearance,
  onChat,
  onDisconnect,
  onGesture,
  onParticipantJoined,
  onParticipantLeft,
  onSessionEnded,
  onTransform,
  onWorldOp,
  onWorldRefresh,
} from "./inbound.js";
