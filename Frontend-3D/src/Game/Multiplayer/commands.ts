import { registerCommand, type CommandResult } from "../CommandLine/commands";
import { pushSystemMessage } from "../State/chatLog";
import { getActiveAction } from "../Systems/actions";
import { listRemote } from "./roster";
import {
  getSessionState,
  hostSession,
  isInSession,
  joinSession,
  leaveSession,
} from "./session";

/**
 * 联机的命令行入口（M1 的唯一入口，正式 UI 后补——大门交互是原设计，
 * 等联机手感验证完再做）。命令处理器是同步签名，而联机操作全是
 * 异步的，所以这里都是"先应一声、结果回头进消息记录"的形式。
 */

export function registerNetCommands(): Array<() => void> {
  const ok = (message: string): CommandResult => ({ ok: true, message });
  const fail = (message: string): CommandResult => ({ ok: false, message });

  return [
    registerCommand({
      name: "host",
      usage: "host",
      description: "开启联机：把自己的家变成房间，拿到邀请码",
      handler: () => {
        if (isInSession()) return fail("已经在联机中了（/leave 先退出）");

        void hostSession()
          .then((joinCode) => {
            // 结果走系统消息（hostSession 里没推，这里推）——
            // 命令的同步返回那句早就显示过了
            pushSystemMessage(
              `房间开好了！邀请码 ${joinCode} ——朋友输 /join ${joinCode} 就能来`,
            );
          })
          .catch((error: Error) => {
            pushSystemMessage(`开房失败：${error.message}`);
          });
        return ok("正在开房…");
      },
    }),

    registerCommand({
      name: "join",
      usage: "join <邀请码>",
      description: "凭邀请码去朋友家做客（会暂离自己的世界，随时 /leave 回来）",
      handler: (args) => {
        const code = (args[0] ?? "").trim();
        if (!code) return fail("要带邀请码：/join ABC123");
        if (isInSession()) return fail("已经在联机中了（/leave 先退出）");
        // 行动绑着自己家的家具和离线结算，出门做客前先收尾
        if (getActiveAction()) return fail("正在专注中——先停下手头的行动再出门");

        void joinSession(code).catch((error: Error) => {
          pushSystemMessage(`加入失败：${error.message}`);
        });
        return ok("正在去朋友家的路上…");
      },
    }),

    registerCommand({
      name: "leave",
      usage: "leave",
      description: "离开联机（房主离开会解散房间；房客回自己家）",
      handler: () => {
        if (!isInSession()) return fail("现在不在联机中");
        void leaveSession();
        return ok("正在离开…");
      },
    }),

    registerCommand({
      name: "who",
      usage: "who",
      description: "看看房间里都有谁",
      handler: () => {
        const state = getSessionState();
        if (state.kind === "idle") return fail("现在不在联机中");

        const others = listRemote().map((player) => player.name);
        const role = state.kind === "hosting" ? "房主" : "访客";
        const line =
          others.length === 0
            ? `只有你自己（${role}）`
            : `你（${role}）和 ${others.join("、")}`;
        return ok(line);
      },
    }),
  ];
}
