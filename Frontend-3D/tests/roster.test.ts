import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Locomotion, type ParticipantTransform, type WireParticipant } from "core";

import {
  clearRoster,
  getRemote,
  listRemote,
  pushSample,
  removeRemote,
  sampleRemoteTransform,
  setRemoteAppearance,
  setRemoteGesture,
  upsertRemote,
} from "../src/Game/Net/roster";

/**
 * 远端玩家的回放缓冲。
 *
 * 核心是**回放 120ms 之前**（Source 引擎的 cl_interp 就是这个量级）：
 * 12Hz 的离散样本靠插值看起来才是连续走动，而不是一秒十二次瞬移。
 * 所以这份用例几乎全靠手动推进 `performance.now()` —— 不控时间的话
 * 插值分支根本走不到，只会一直落在"回放点越过最新样本"那条兜底上。
 */

let now = 0;

beforeEach(() => {
  now = 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  clearRoster();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function transform(patch: Partial<ParticipantTransform> = {}): ParticipantTransform {
  return {
    mapId: "base",
    x: 0,
    y: 0,
    heading: 0,
    locomotion: Locomotion.Walk,
    liftHeight: 0,
    ...patch,
  };
}

function wire(playerId: string, patch: Partial<ParticipantTransform> = {}): WireParticipant {
  return {
    profile: { playerId, name: `玩家${playerId}`, avatar: { slots: {} } as never },
    transform: transform(patch),
    appearance: { posture: "stand", activity: null, heldItem: null, restingOn: null },
  };
}

// ---- 名册 ----

test("进房建条目，再进同一个人是更新不是新增", () => {
  upsertRemote(wire("p-1"));
  expect(listRemote()).toHaveLength(1);

  upsertRemote({
    ...wire("p-1", { x: 5 }),
    profile: { playerId: "p-1", name: "改了名", avatar: { slots: {} } as never },
  });

  expect(listRemote()).toHaveLength(1);
  expect(getRemote("p-1")?.name).toBe("改了名");
  // 更新时那一帧也当样本收下——不然重进的人会停在旧位置
  expect(getRemote("p-1")?.samples.length).toBeGreaterThan(1);
});

test("离场删条目，清空名册删全部", () => {
  upsertRemote(wire("p-1"));
  upsertRemote(wire("p-2"));

  removeRemote("p-1");
  expect(listRemote().map((p) => p.playerId)).toEqual(["p-2"]);

  clearRoster();
  expect(listRemote()).toEqual([]);
});

test("对不在名册里的人的样本/外观/手势一律忽略，不凭空建条目", () => {
  pushSample("查无此人", transform());
  setRemoteAppearance("查无此人", { posture: "sit" } as never);
  setRemoteGesture("查无此人", { kind: "jump", atMs: 1 } as never);

  expect(listRemote()).toEqual([]);
  expect(sampleRemoteTransform("查无此人")).toBeNull();
});

test("外观和手势各自记在人身上", () => {
  upsertRemote(wire("p-1"));

  setRemoteAppearance("p-1", { posture: "sit", heldItem: null, restingOn: null, activity: null });
  setRemoteGesture("p-1", { kind: "wave", atMs: 42 } as never);

  expect(getRemote("p-1")?.appearance.posture).toBe("sit");
  expect(getRemote("p-1")?.lastGesture?.kind).toBe("wave");
});

// ---- 插值 ----

test("回放点落在两个样本之间时做线性插值", () => {
  upsertRemote(wire("p-1", { x: 0 }));
  now += 200;
  pushSample("p-1", transform({ x: 10 }));

  // 最新样本在 10200，回放点 = now - 120。把 now 推到 10320 →
  // 回放点 10200 正好是最新样本；再推 100ms，回放点落在两样本正中偏后
  now = 10_300; // 回放点 10180，落在 10000~10200 之间的 90%
  const sampled = sampleRemoteTransform("p-1");

  expect(sampled?.x).toBeCloseTo(9, 5);
});

test("回放点比最新样本还新时停在最新上（不外推）", () => {
  upsertRemote(wire("p-1", { x: 3 }));
  now += 50; // 回放点还在样本之前

  expect(sampleRemoteTransform("p-1")?.x).toBe(3);
});

test("回放点比最老样本还老时停在最老上", () => {
  upsertRemote(wire("p-1", { x: 7 }));
  now += 500;
  pushSample("p-1", transform({ x: 9 }));

  // 把回放点拉到第一个样本之前
  now = 10_050; // 回放点 9930 < 10000
  expect(sampleRemoteTransform("p-1")?.x).toBe(7);
});

test("样本断供超过阈值：位置停住，移动态归零（不然人原地跑步）", () => {
  upsertRemote(wire("p-1", { x: 2, locomotion: Locomotion.Run }));

  now += 100;
  expect(sampleRemoteTransform("p-1")?.locomotion).toBe(Locomotion.Run);

  // 回放点比最新样本老 400ms 以上
  now += 1_000;
  const stale = sampleRemoteTransform("p-1");
  expect(stale?.x).toBe(2);
  expect(stale?.locomotion).toBe(Locomotion.Idle);
});

test("角度插值走短弧：350° → 10° 该转 20°，不是倒着抡 340°", () => {
  const almostFull = Math.PI * 2 - 0.1;
  upsertRemote(wire("p-1", { heading: almostFull }));
  now += 200;
  pushSample("p-1", transform({ heading: 0.1 }));

  now = 10_300; // 回放点落在两样本之间 90% 处
  const heading = sampleRemoteTransform("p-1")!.heading;

  // 短弧插值的结果应该接近 2π（绕过零点），而不是掉回中间的 π 附近
  expect(Math.abs(heading - Math.PI)).toBeGreaterThan(2);
});

test("离地高度也插值——跳跃弧线靠它平滑", () => {
  upsertRemote(wire("p-1", { liftHeight: 0 }));
  now += 200;
  pushSample("p-1", transform({ liftHeight: 1 }));

  now = 10_200; // 回放点 10080，落在 40%
  expect(sampleRemoteTransform("p-1")?.liftHeight).toBeCloseTo(0.4, 5);
});

test("离散量不插值，取目标端的", () => {
  upsertRemote(wire("p-1", { locomotion: Locomotion.Idle, mapId: "base" }));
  now += 200;
  pushSample("p-1", transform({ locomotion: Locomotion.Run, mapId: "town" }));

  now = 10_300;
  const sampled = sampleRemoteTransform("p-1");
  expect(sampled?.locomotion).toBe(Locomotion.Run);
  expect(sampled?.mapId).toBe("town");
});

// ---- 样本环 ----

test("老样本被裁掉，暂停的标签页不会积一坟场", () => {
  upsertRemote(wire("p-1"));

  for (let i = 0; i < 200; i += 1) {
    now += 80;
    pushSample("p-1", transform({ x: i }));
  }

  const samples = getRemote("p-1")!.samples;
  // 只留最近 2 秒 ≈ 25 个样本，远小于推进去的 200 个
  expect(samples.length).toBeLessThan(40);
  // 但最新那个必须还在
  expect(samples[samples.length - 1].transform.x).toBe(199);
});

test("裁剪永远至少留一个样本（哪怕全都过期了）", () => {
  upsertRemote(wire("p-1", { x: 5 }));
  now += 60_000;
  pushSample("p-1", transform({ x: 6 }));

  expect(getRemote("p-1")!.samples.length).toBeGreaterThanOrEqual(1);
  expect(sampleRemoteTransform("p-1")).not.toBeNull();
});
