import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, attentionTuning, residentIdOf } from "core";
import { on } from "../src/Game/EventBus";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { getResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { resetEyeContact, tickEyeContact, type PlayerGaze } from "../src/Game/Systems/residents/eyeContact";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 对视（2026-09-16）：两个人互相看着、够近、看满 holdSeconds 才发 resident_eye_contact；
 * 发过之后视线不断不再发，断开再对上再发；睡着 / 藏着 / 木偶不算；做客不发。
 */
const SHUSHU = residentIdOf("shushu");
const HOLD = attentionTuning.eyeContact.holdSeconds;
let signals: string[] = [];
let off: (() => void) | null = null;

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreResidents({});
  resetEyeContact();
  signals = [];
  off = on("story_signal", (signal) => {
    if (signal.kind === "resident_eye_contact") signals.push(signal.subject ?? "");
  });
});

afterEach(() => {
  off?.();
  off = null;
});

/** 舒舒站在 (0, 3) 面朝 −z（对着原点） */
function facingResident() {
  const agent = spawnResident(SHUSHU, "shushu");
  agent.x = 0;
  agent.z = 3;
  agent.heading = Math.PI;
  agent.headYaw = 0;
  return agent;
}

const playerAt = (overrides: Partial<PlayerGaze> = {}): PlayerGaze => ({
  x: 0,
  z: 0,
  heading: 0,
  headYaw: 0,
  attention: null,
  ...overrides,
});

test("eyeContact_面对面看满hold才发_发一次_视线不断不重发", () => {
  facingResident();
  tickEyeContact(HOLD / 2, playerAt());
  expect(signals).toEqual([]);
  tickEyeContact(HOLD, playerAt());
  expect(signals).toEqual(["shushu"]);
  tickEyeContact(1, playerAt());
  tickEyeContact(1, playerAt());
  expect(signals).toEqual(["shushu"]);
});

test("eyeContact_一方没看着就不算_断开再对上再发一次", () => {
  facingResident();
  // 玩家背过身
  tickEyeContact(HOLD * 2, playerAt({ heading: Math.PI }));
  expect(signals).toEqual([]);
  // 转回来
  tickEyeContact(HOLD * 2, playerAt());
  expect(signals).toEqual(["shushu"]);
  // 断开（居民扭头）再对上
  getResident(SHUSHU)!.heading = Math.PI / 2;
  tickEyeContact(0.1, playerAt());
  getResident(SHUSHU)!.heading = Math.PI;
  tickEyeContact(HOLD * 2, playerAt());
  expect(signals).toEqual(["shushu", "shushu"]);
});

test("eyeContact_对话中注意力互指就算_不看几何", () => {
  const agent = facingResident();
  agent.heading = Math.PI / 2; // 身体转开
  agent.attend("dialogue", { kind: "player" });
  tickEyeContact(HOLD * 2, playerAt({ heading: Math.PI, attention: { kind: "resident", residentId: SHUSHU } }));
  expect(signals).toEqual(["shushu"]);
});

test("eyeContact_太远_睡着_做客都不算", () => {
  const agent = facingResident();
  agent.z = attentionTuning.eyeContact.maxDistance + 1;
  tickEyeContact(HOLD * 2, playerAt());
  expect(signals).toEqual([]);
  agent.z = 3;
  agent.fallAsleep();
  tickEyeContact(HOLD * 2, playerAt());
  expect(signals).toEqual([]);
  agent.wakeUp();
  setRemoteWorldActive(true);
  tickEyeContact(HOLD * 2, playerAt());
  expect(signals).toEqual([]);
  setRemoteWorldActive(false);
  tickEyeContact(HOLD * 2, playerAt());
  expect(signals).toEqual(["shushu"]);
});
