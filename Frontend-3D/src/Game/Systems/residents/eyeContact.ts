import { attentionTuning, inEyeContact, type Gazer } from "core";
import { emit } from "../../EventBus";
import { isRemoteWorld } from "../../Multiplayer/worldLock";
import { getResidents } from "../../State/residentsRuntime";
import type { AttentionTarget } from "core";

/**
 * 对视（2026-09-16）：你和一位居民**互相看着**、够近、连着看满 holdSeconds 那一拍，
 * 发剧情信号 `resident_eye_contact`（subject = definitionId）。视线断开再对上才会再发（边沿触发）。
 *
 * 为什么不用"在场"：图鉴的居民分区原来听 resident_spawned——人在院子另一头你根本没看见，图鉴却亮了
 * （用户报的）。"见过面"得是脸对脸那一下。判定在 Core `logic/attention.inEyeContact`：
 * 注意力目标是对方（对话 / 打招呼）或脸（身体 + 头）对准对方在 cone 内，两边都成立。
 *
 * 每帧由 RoomScene 在 tickResidents 之后调。做客不发：图鉴是房主世界的，房客那边也不跑图鉴。
 */

export type PlayerGaze = {
  x: number;
  z: number;
  heading: number;
  headYaw: number;
  attention: AttentionTarget | null;
};

/** 每位居民连着对视了多久；断开就删 */
const held = new Map<string, number>();
/** 已经发过、视线还没断的 */
const fired = new Set<string>();

export function tickEyeContact(deltaSeconds: number, player: PlayerGaze): void {
  if (isRemoteWorld()) return;
  const tuning = attentionTuning.eyeContact;
  const seen = new Set<string>();
  for (const agent of getResidents()) {
    if (agent.puppet || agent.state === "hidden" || agent.asleep) continue;
    const target = agent.attentionTarget();
    const residentGaze: Gazer = {
      x: agent.x,
      z: agent.z,
      heading: agent.heading,
      headYaw: agent.headYaw,
      attendingOther: target?.kind === "player",
    };
    const playerGaze: Gazer = {
      x: player.x,
      z: player.z,
      heading: player.heading,
      headYaw: player.headYaw,
      attendingOther: player.attention?.kind === "resident" && player.attention.residentId === agent.residentId,
    };
    if (!inEyeContact(playerGaze, residentGaze, tuning)) continue;
    seen.add(agent.residentId);
    const total = (held.get(agent.residentId) ?? 0) + deltaSeconds;
    held.set(agent.residentId, total);
    if (total < tuning.holdSeconds || fired.has(agent.residentId)) continue;
    fired.add(agent.residentId);
    emit("story_signal", { kind: "resident_eye_contact", subject: agent.definitionId });
  }
  for (const id of [...held.keys()]) {
    if (!seen.has(id)) {
      held.delete(id);
      fired.delete(id);
    }
  }
}

/** 测试 / 换世界用：清掉计时 */
export function resetEyeContact(): void {
  held.clear();
  fired.clear();
}
