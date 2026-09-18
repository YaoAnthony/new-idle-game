import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PerspectiveCamera, Scene } from "three";

import { on } from "../src/Game/EventBus";
import { MAX_BOLT_POINTS, randomWalkBolt } from "../src/Game3D/Visual/lightningBolt";
import { weatherVisualProfiles } from "../src/Game3D/Visual/weatherProfiles";
import { LightningStorm } from "../src/Game3D/World/LightningStorm";

/** 暴风雨的闪电（2026-09-18）：随机游走的骨架、一道雷的时间线、按天气档排节拍 */

function seeded(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

test("lightning_随机游走_从落点往上走到画布顶_不出画布_点数有上限", () => {
  const points = randomWalkBolt(40, seeded(7), { halfWidth: 12 });
  expect(points[0]).toEqual({ x: 0, y: 0 });
  expect(points.length).toBeLessThanOrEqual(MAX_BOLT_POINTS);
  expect(points[points.length - 1].y).toBeGreaterThanOrEqual(40);
  for (let i = 1; i < points.length; i += 1) {
    expect(points[i].y).toBeGreaterThan(points[i - 1].y);
    expect(Math.abs(points[i].x)).toBeLessThan(12);
  }
  // 每次掷都不一样
  expect(randomWalkBolt(40, seeded(8))).not.toEqual(points);
});

test("lightning_只有暴风雨的表现档打雷", () => {
  expect(weatherVisualProfiles.weather_visual_storm.lightning).toEqual({ minMs: 9000, maxMs: 26000 });
  for (const [id, profile] of Object.entries(weatherVisualProfiles)) {
    if (id !== "weather_visual_storm") expect(profile.lightning, id).toBeNull();
  }
});

const flashes: number[] = [];
const cuts: number[] = [];
const blooms: Array<number | null> = [];
const flares: Array<[number, number, number]> = [];
const lighting = { flash: (s: number) => flashes.push(s), cutSky: () => cuts.push(1) };
const sky = { flash: (s: number) => flashes.push(s) };
const fx = {
  setLightningBloom: (v: number | null) => blooms.push(v),
  setFlare: (c: number, w: number, f: number) => flares.push([c, w, f]),
};

beforeEach(() => {
  flashes.length = 0;
  cuts.length = 0;
  blooms.length = 0;
  flares.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

const tick = (storm: LightningStorm, seconds: number, dt = 1 / 60): void => {
  for (let t = 0; t < seconds; t += dt) storm.update(dt);
};

test("lightning_时间线_预兆竖带_落地才有画布点光闪光事件_放电跳档_碎掉收场", () => {
  const scene = new Scene();
  const storm = new LightningStorm(scene, lighting, sky, fx, seeded(3));
  const struck: Array<{ distance: number }> = [];
  const off = on("lightning_struck", (e) => struck.push(e));
  storm.setViewer(10, 5);
  const root = () => scene.getObjectByName("lightning")!;

  const hit = storm.strike();
  expect(Math.hypot(hit.x - 10, hit.z - 5)).toBeCloseTo(hit.distance, 6);
  expect(hit.distance).toBeGreaterThanOrEqual(16);
  expect(hit.distance).toBeLessThanOrEqual(48);

  // 预兆：0.5 秒内只有耀斑，没有画布、没有闪光、没有事件
  tick(storm, 0.5);
  expect(root().children).toHaveLength(0);
  expect(flashes).toEqual([]);
  expect(struck).toEqual([]);
  const bands = flares.filter(([, , f]) => f > 0).map(([c]) => c);
  expect(new Set(bands)).toEqual(new Set([0.25, 0.75, 0.5]));

  // 落地：画布 + 点光，两处闪，事件带距离，bloom 跳到第一档
  tick(storm, 0.15);
  expect(root().children).toHaveLength(2);
  expect(flashes).toHaveLength(2);
  expect(struck).toEqual([{ x: hit.x, z: hit.z, distance: hit.distance }]);
  expect([6, 1.5, 4.5, 1]).toContain(blooms[blooms.length - 1]);
  expect(cuts).toEqual([]);

  // 放电完了切天光，然后碎掉、收场，bloom 交还
  tick(storm, 0.3);
  expect(cuts).toEqual([1]);
  tick(storm, 1.5);
  expect(storm.active).toBe(0);
  expect(root().children).toHaveLength(0);
  expect(blooms[blooms.length - 1]).toBeNull();
  expect(flares[flares.length - 1]).toEqual([0.5, 0, 0]);
  off();
  storm.dispose();
});

test("lightning_镜头震_落地后抖_半秒平掉_rig重摆后不累积", () => {
  const scene = new Scene();
  const storm = new LightningStorm(scene, lighting, sky, fx, seeded(5));
  const camera = new PerspectiveCamera();
  storm.strike({ x: 3, z: 3 });
  tick(storm, 0.62);
  camera.rotation.set(0, 0, 0);
  storm.applyShake(camera);
  expect(Math.abs(camera.rotation.x) + Math.abs(camera.rotation.y)).toBeGreaterThan(0);
  tick(storm, 1);
  camera.rotation.set(0, 0, 0);
  storm.applyShake(camera);
  expect(camera.rotation.x).toBe(0);
  storm.dispose();
});

test("lightning_不是暴风雨不排节拍", () => {
  vi.useFakeTimers();
  const scene = new Scene();
  const storm = new LightningStorm(scene, lighting, sky, fx, seeded(1));
  vi.advanceTimersByTime(60_000);
  expect(storm.active).toBe(0);
  storm.dispose();
});
