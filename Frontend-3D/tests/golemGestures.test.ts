import { expect, test } from "vitest";
import { GESTURES, isKnownGesture } from "core";
import { buildStoneGolem } from "../src/Game3D/Visual/recipes/golem";

/**
 * 石傀儡的是 / 不是（2026-09-16）：no = 举一只手（右手），yes = 双手举起、顶上顿两下；
 * 播完回到站姿；名字在手势表里，没实现的不理。
 */
type Idle = { state: string; moving: boolean };

function setup() {
  const root = buildStoneGolem();
  (root.userData.setHeadAttached as (a: boolean) => void)(true);
  const left = root.getObjectByName("arm-left")!;
  const right = root.getObjectByName("arm-right")!;
  const animate = root.userData.animate as (dt: number, r: Idle) => void;
  const play = root.userData.playGesture as (name: string) => void;
  const idle: Idle = { state: "idle", moving: false };
  animate(0.016, idle);
  return { left, right, animate, play, idle };
}

test("golemGesture_no_只举右手_播完放下", () => {
  const { left, right, animate, play, idle } = setup();
  const rest = { l: left.rotation.x, r: right.rotation.x };
  play(GESTURES.no);
  let highRight = 0;
  let highLeft = 0;
  for (let i = 0; i < 120; i++) {
    animate(0.02, idle);
    highRight = Math.max(highRight, rest.r - right.rotation.x);
    highLeft = Math.max(highLeft, rest.l - left.rotation.x);
  }
  expect(highRight).toBeGreaterThan(2.4);
  expect(highLeft).toBeLessThan(0.05);
  expect(Math.abs(right.rotation.x - rest.r)).toBeLessThan(0.01);
});

test("golemGesture_yes_双手都举_顶上顿两下_播完放下", () => {
  const { left, right, animate, play, idle } = setup();
  const rest = { l: left.rotation.x, r: right.rotation.x };
  play(GESTURES.yes);
  let highRight = 0;
  let highLeft = 0;
  const topSamples: number[] = [];
  for (let i = 0; i < 130; i++) {
    animate(0.02, idle);
    highRight = Math.max(highRight, rest.r - right.rotation.x);
    highLeft = Math.max(highLeft, rest.l - left.rotation.x);
    const t = (i + 1) * 0.02 / 1.9;
    if (t > 0.25 && t < 0.75) topSamples.push(rest.r - right.rotation.x);
  }
  expect(highRight).toBeGreaterThan(2.6);
  expect(highLeft).toBeGreaterThan(2.6);
  // 顶上那段有起伏（顿了两下），不是一直停着
  expect(Math.max(...topSamples) - Math.min(...topSamples)).toBeGreaterThan(0.15);
  expect(Math.abs(left.rotation.x - rest.l)).toBeLessThan(0.01);
  expect(Math.abs(right.rotation.x - rest.r)).toBeLessThan(0.01);
});

test("golemGesture_名字都在手势表里_没实现的不理", () => {
  expect(isKnownGesture("yes")).toBe(true);
  expect(isKnownGesture("no")).toBe(true);
  expect(isKnownGesture("raise_hand")).toBe(false);
  const { right, animate, play, idle } = setup();
  const rest = right.rotation.x;
  play("wave_goodbye");
  for (let i = 0; i < 20; i++) animate(0.02, idle);
  expect(Math.abs(right.rotation.x - rest)).toBeLessThan(0.01);
});
