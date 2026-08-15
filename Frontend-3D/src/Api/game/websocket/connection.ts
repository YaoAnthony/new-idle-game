import { io, type Socket } from "socket.io-client";

/**
 * 到 Backend 的那一条 socket。**懒建、全局一条**——会话状态机是它唯一的
 * 使用方，但连接本身要能活过 GameView 的重挂载（换世界就是靠重挂载做的，
 * 见 EventBus 的 net_world_swapped），所以不能塞进 React 的生命周期里。
 *
 * **socket 实例不出这个目录。** 外面拿到的只有 `Api/game/websocket` 导出的
 * 类型化函数——这条边界的意义见 index.ts 的文件头。
 */

const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  "http://localhost:3001";

let socket: Socket | null = null;

/** 只给同目录的兄弟模块用。**不要从 index.ts 导出它** */
export function rawSocket(): Socket {
  if (socket) return socket;

  socket = io(BACKEND_URL, {
    // 手动连：标题页、单机期间不该挂着一条空连接反复重试
    autoConnect: false,
    // 直接 websocket，跳过 long-polling 升级那一步。这是游戏不是网页表单，
    // 连不上 ws 的环境里 polling 也撑不起 12Hz 的位置流
    transports: ["websocket"],
  });
  return socket;
}

/** 确保已连接。失败抛错（带人话），由调用方决定怎么告诉玩家 */
export async function ensureConnected(timeoutMs = 5000): Promise<Socket> {
  const active = rawSocket();
  if (active.connected) return active;

  active.connect();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`连不上联机服务器（${BACKEND_URL}）——它开着吗？`));
    }, timeoutMs);
    const onConnect = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(new Error(`联机服务器拒绝连接：${error.message}`));
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      active.off("connect", onConnect);
      active.off("connect_error", onError);
    };
    active.once("connect", onConnect);
    active.once("connect_error", onError);
  });
  return active;
}

export function disconnect(): void {
  socket?.disconnect();
}

export function isConnected(): boolean {
  return socket?.connected ?? false;
}
