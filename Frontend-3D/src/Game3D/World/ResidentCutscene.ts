import { on } from "../../Game/EventBus";
import { getResident } from "../../Game/State/residentsRuntime";

/**
 * 登场跟拍：宠物 / 居民走进来的那一段，镜头接管、人不能动、HUD 收起。
 * 这里只定**拍谁、什么时候开、什么时候收**；镜头和输入怎么变归 RoomScene（`onChange`）。
 *
 * 原来是"`spawn` 就开、`entered` 才收"。可登场不一定有一段路要走：剧情叫小鱼人直接出现在门口敲门
 * （居民系统 20），生成完进屋那条 Intent 当场被敲门指令顶掉，`entered` 永远不来——镜头一直对着门，
 * 玩家不能动，也走不到门口开门（2026-09-15 用户报的）。进屋走到一半被指令抢走、半路被移除，是同一个结局。
 *
 * 所以开和收都看**他此刻还在不在走进来**（`ResidentAgent.isEntering`），不只认两个事件：
 * - `spawn` 只记下候选，等下一次 `sync`（场景每帧调）再看。调用方常常紧跟着就下别的指令，
 *   当场就看会把一段马上被顶掉的进屋也拍进去，HUD 闪一下；
 * - 走完那一拍的 `entered` 当场收：同一拍紧跟着的 `resident_entered` 剧情信号可能马上开对话，
 *   对话那边要看到过场已经收了；
 * - 被顶掉、被移除这类不会再来事件的，由每帧的 `sync` 收。
 */
export class ResidentCutscene {
  /** 正在跟拍谁；null = 没在过场 */
  residentId: string | null = null;
  /** 登场了、还没对过账的那位。同一帧来两位拍后来的，过场中又来一位就换过去拍——和原来一样 */
  private pending: string | null = null;
  private readonly onChange: (active: boolean) => void;

  constructor(onChange: (active: boolean) => void) {
    this.onChange = onChange;
  }

  /** 挂上 `resident_changed` 监听，返回摘除函数 */
  listen(): () => void {
    return on("resident_changed", ({ residentId, reason }) => {
      if (reason === "spawn") this.pending = residentId;
      if (reason === "entered" && residentId === this.residentId) this.end();
    });
  }

  /** 对账：候选真在走进来就开拍；拍着的那位不在走进来了就收 */
  sync(): void {
    const pending = this.pending;
    this.pending = null;
    if (pending && isEntering(pending)) {
      const filming = this.residentId !== null;
      this.residentId = pending;
      if (!filming) this.onChange(true);
    }
    if (this.residentId && !isEntering(this.residentId)) this.end();
  }

  private end(): void {
    this.residentId = null;
    this.onChange(false);
  }
}

function isEntering(residentId: string): boolean {
  return getResident(residentId)?.isEntering() ?? false;
}
