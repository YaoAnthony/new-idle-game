import {
  Locomotion,
  type AvatarConfig,
  type ParticipantAppearance,
  type ParticipantGesture,
  type ParticipantTransform,
  type WireParticipant,
} from "core";

/**
 * 房间里**别人**的名册：侧写 + 位置样本环 + 外观。
 *
 * 这是渲染侧的读模型，不是权威——权威在服务端（它转发谁就是谁）。
 * 和 State/participants 分开的原因：那边是"本地玩家的权威状态"，
 * 每帧被 CharacterController 写；这边是"远端玩家的回放缓冲"，
 * 被网络写、被 RemotePlayersView 读，生命周期跟着会话走。
 *
 * ---- 插值 ----
 *
 * 远端位置不直接摆到最新样本上，而是**回放 120ms 之前**的时间点：
 * 两个样本之间做线性插值。这是联机游戏的标准做法（Source 引擎的
 * cl_interp 就是 ~100ms）——代价是别人的动作慢 120ms，换来的是
 * 12Hz 的离散样本看起来是连续走动，而不是一秒十二次的瞬移。
 * 5 人小房、休闲玩法，120ms 完全感知不到。
 */

const INTERP_DELAY_MS = 120;

/** 样本至多留这么久。防抖动足够，也别让暂停的标签页积一坟场 */
const SAMPLE_KEEP_MS = 2_000;

/** 最新样本比回放点还老这么多 = 对面卡了/停了，别再播走路动画 */
const STALE_MS = 400;

type Sample = { atMs: number; transform: ParticipantTransform };

export type RemotePlayer = {
  playerId: string;
  name: string;
  avatar: AvatarConfig;
  appearance: ParticipantAppearance;
  samples: Sample[];
  /** 最近一次手势（渲染层想做起跳灰尘/音效时消费；M1 先只存着） */
  lastGesture: ParticipantGesture | null;
};

const players = new Map<string, RemotePlayer>();

export function upsertRemote(wire: WireParticipant): RemotePlayer {
  const existing = players.get(wire.profile.playerId);
  if (existing) {
    existing.name = wire.profile.name;
    existing.avatar = wire.profile.avatar;
    existing.appearance = wire.appearance;
    pushSample(wire.profile.playerId, wire.transform);
    return existing;
  }

  const created: RemotePlayer = {
    playerId: wire.profile.playerId,
    name: wire.profile.name,
    avatar: wire.profile.avatar,
    appearance: wire.appearance,
    samples: [{ atMs: performance.now(), transform: wire.transform }],
    lastGesture: null,
  };
  players.set(created.playerId, created);
  return created;
}

export function removeRemote(playerId: string): void {
  players.delete(playerId);
}

export function clearRoster(): void {
  players.clear();
}

export function listRemote(): RemotePlayer[] {
  return [...players.values()];
}

export function getRemote(playerId: string): RemotePlayer | undefined {
  return players.get(playerId);
}

export function pushSample(playerId: string, transform: ParticipantTransform): void {
  const player = players.get(playerId);
  if (!player) return;

  const now = performance.now();
  player.samples.push({ atMs: now, transform });
  // 裁旧样本。从头找第一个还年轻的，一刀切掉前面的——样本本来就按时间有序
  const cutoff = now - SAMPLE_KEEP_MS;
  let firstFresh = 0;
  while (
    firstFresh < player.samples.length - 1 &&
    player.samples[firstFresh].atMs < cutoff
  ) {
    firstFresh += 1;
  }
  if (firstFresh > 0) player.samples.splice(0, firstFresh);
}

export function setRemoteAppearance(
  playerId: string,
  appearance: ParticipantAppearance,
): void {
  const player = players.get(playerId);
  if (player) player.appearance = appearance;
}

export function setRemoteGesture(playerId: string, gesture: ParticipantGesture): void {
  const player = players.get(playerId);
  if (player) player.lastGesture = gesture;
}

/** 角度插值走短弧：从 350° 到 10° 该转 20°，不是倒着抡 340° */
function lerpAngle(a: number, b: number, t: number): number {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

/**
 * 取某人在"现在减 120ms"这个回放点上的位置。
 * 回放点越过最新样本时停在最新上（对面卡了就站住，比外推飘走稳）。
 */
export function sampleRemoteTransform(playerId: string): ParticipantTransform | null {
  const player = players.get(playerId);
  if (!player || player.samples.length === 0) return null;

  const renderAt = performance.now() - INTERP_DELAY_MS;
  const samples = player.samples;

  const newest = samples[samples.length - 1];
  if (renderAt >= newest.atMs) {
    // 样本断供：位置停住之外，移动态也要归零，不然人原地跑步
    if (renderAt - newest.atMs > STALE_MS) {
      return { ...newest.transform, locomotion: Locomotion.Idle };
    }
    return newest.transform;
  }

  const oldest = samples[0];
  if (renderAt <= oldest.atMs) return oldest.transform;

  // 找夹住回放点的一对样本。样本量 ~24（2 秒 × 12Hz），线性扫比二分清楚
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    const a = samples[i];
    const b = samples[i + 1];
    if (renderAt < a.atMs || renderAt > b.atMs) continue;

    const span = b.atMs - a.atMs;
    const t = span <= 0 ? 1 : (renderAt - a.atMs) / span;
    return {
      mapId: b.transform.mapId,
      x: a.transform.x + (b.transform.x - a.transform.x) * t,
      y: a.transform.y + (b.transform.y - a.transform.y) * t,
      heading: lerpAngle(a.transform.heading, b.transform.heading, t),
      // 离地高度也插值：跳跃弧线就是靠它平滑回放的
      liftHeight:
        a.transform.liftHeight +
        (b.transform.liftHeight - a.transform.liftHeight) * t,
      // 离散量不插值，取目标端的
      locomotion: b.transform.locomotion,
    };
  }
  return newest.transform;
}
