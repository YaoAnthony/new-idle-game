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

// ---- 三形态（22）----

type SetPart = (part: string, on: boolean) => void;

function armless() {
  const root = buildStoneGolem();
  const setPart = root.userData.setPartAttached as SetPart;
  setPart("head", true);
  setPart("arm_left", false);
  setPart("arm_right", false);
  const body = root.getObjectByName("body")!;
  const left = root.getObjectByName("arm-left")!;
  const right = root.getObjectByName("arm-right")!;
  const animate = root.userData.animate as (dt: number, r: Idle) => void;
  const play = root.userData.playGesture as (name: string) => void;
  const idle: Idle = { state: "idle", moving: false };
  animate(0.016, idle);
  return { root, setPart, body, left, right, animate, play, idle };
}

test("golemGesture_没手时no_上身往一侧歪一下_手臂不动_播完回正", () => {
  // Arrange
  const { body, left, right, animate, play, idle } = armless();
  const restZ = body.rotation.z;
  const restArms = { l: left.rotation.x, r: right.rotation.x };

  // Act
  play(GESTURES.no);
  let tilt = 0;
  let armMoved = 0;
  for (let i = 0; i < 120; i++) {
    animate(0.02, idle);
    tilt = Math.max(tilt, Math.abs(body.rotation.z - restZ));
    armMoved = Math.max(armMoved, Math.abs(left.rotation.x - restArms.l), Math.abs(right.rotation.x - restArms.r));
  }

  // Assert
  expect(tilt).toBeGreaterThan(0.25);
  expect(armMoved).toBeLessThan(0.05);
  expect(Math.abs(body.rotation.z - restZ)).toBeLessThan(0.01);
});

test("golemGesture_没手时yes_上身往前点两下_播完回正", () => {
  // Arrange
  const { body, animate, play, idle } = armless();
  const restX = body.rotation.x;

  // Act
  play(GESTURES.yes);
  const samples: number[] = [];
  for (let i = 0; i < 130; i++) {
    animate(0.02, idle);
    const t = ((i + 1) * 0.02) / 1.9;
    if (t > 0.25 && t < 0.75) samples.push(body.rotation.x - restX);
  }

  // Assert：顶上那段前后起伏（点了两下），播完回正
  expect(Math.max(...samples)).toBeGreaterThan(0.15);
  expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.1);
  expect(Math.abs(body.rotation.x - restX)).toBeLessThan(0.01);
});

test("golemParts_没装的手不显示也不摆_装上就显示", () => {
  // Arrange
  const { setPart, left, right, animate } = armless();
  expect(left.visible).toBe(false);
  expect(right.visible).toBe(false);

  // Act：走两步，缺着的手不该摆
  const restL = left.rotation.x;
  let swing = 0;
  for (let i = 0; i < 40; i++) {
    animate(0.02, { state: "idle", moving: true });
    swing = Math.max(swing, Math.abs(left.rotation.x - restL));
  }
  expect(swing).toBeLessThan(0.01);

  // 装上左手：显示、走路会摆
  setPart("arm_left", true);
  expect(left.visible).toBe(true);
  swing = 0;
  for (let i = 0; i < 40; i++) {
    animate(0.02, { state: "idle", moving: true });
    swing = Math.max(swing, Math.abs(left.rotation.x - restL));
  }
  expect(swing).toBeGreaterThan(0.1);
  // 右手还缺着，照样不显示
  expect(right.visible).toBe(false);
});

test("golemParts_只剩一只手时no_举那只手_不歪身子", () => {
  const { setPart, body, left, animate, play, idle } = armless();
  setPart("arm_left", true);
  const restZ = body.rotation.z;
  const restL = left.rotation.x;
  play(GESTURES.no);
  let lift = 0;
  let tilt = 0;
  for (let i = 0; i < 120; i++) {
    animate(0.02, idle);
    lift = Math.max(lift, restL - left.rotation.x);
    tilt = Math.max(tilt, Math.abs(body.rotation.z - restZ));
  }
  expect(lift).toBeGreaterThan(2.4);
  expect(tilt).toBeLessThan(0.05);
});
