import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Scene } from "three";

import { on } from "../src/Game/EventBus";
import { buildBolt } from "../src/Game3D/Visual/lightningBolt";
import { weatherVisualProfiles } from "../src/Game3D/Visual/weatherProfiles";
import { LightningStorm } from "../src/Game3D/World/LightningStorm";

/** 暴风雨的闪电（2026-09-18）：折线形状、劈一道的三件事、按天气档排节拍 */

function seeded(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

test("lightning_折线_主干从云底到地_越往下越碎_有分叉", () => {
  const branches = buildBolt({ x: 0, y: 40, z: 0 }, { x: 3, y: 0, z: -2 }, seeded(7));
  expect(branches.length).toBe(3);
  const trunk = branches[0].points;
  expect(trunk.length).toBe(33);
  expect(trunk[0]).toEqual({ x: 0, y: 40, z: 0 });
  expect(trunk[trunk.length - 1]).toEqual({ x: 3, y: 0, z: -2 });
  // 大体一路向下（允许局部小抖）
  for (let i = 1; i < trunk.length; i += 1) expect(trunk[i].y).toBeLessThan(trunk[i - 1].y + 1.5);
  // 分叉更细、更短，从主干上岔出去
  for (const branch of branches.slice(1)) {
    expect(branch.width).toBeLessThan(branches[0].width);
    expect(branch.points.length).toBeLessThan(trunk.length);
    expect(trunk.some((p) => p.x === branch.points[0].x && p.y === branch.points[0].y)).toBe(true);
  }
});

test("lightning_只有暴风雨的表现档打雷", () => {
  expect(weatherVisualProfiles.weather_visual_storm.lightning).toEqual({ minMs: 9000, maxMs: 26000 });
  for (const [id, profile] of Object.entries(weatherVisualProfiles)) {
    if (id !== "weather_visual_storm") expect(profile.lightning, id).toBeNull();
  }
});

const flashes: number[] = [];
const stub = { flash: (s: number) => flashes.push(s) };

beforeEach(() => {
  flashes.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

test("lightning_劈一道_场里出折线_两处闪_发事件带距离_活完自己收", () => {
  const scene = new Scene();
  const storm = new LightningStorm(scene, stub, stub, seeded(3));
  const struck: Array<{ distance: number }> = [];
  const off = on("lightning_struck", (e) => struck.push(e));
  storm.setViewer(10, 5);

  const hit = storm.strike();
  expect(scene.getObjectByName("lightning")!.children.length).toBe(1);
  expect(Math.hypot(hit.x - 10, hit.z - 5)).toBeCloseTo(hit.distance, 6);
  expect(hit.distance).toBeGreaterThanOrEqual(16);
  expect(hit.distance).toBeLessThanOrEqual(48);
  expect(flashes).toHaveLength(2);
  expect(flashes[0]).toBeGreaterThan(0.25);
  expect(struck).toEqual([{ x: hit.x, z: hit.z, distance: hit.distance }]);

  for (let i = 0; i < 40; i += 1) storm.update(1 / 60);
  expect(scene.getObjectByName("lightning")!.children.length).toBe(0);
  off();
  storm.dispose();
});

test("lightning_不是暴风雨不排节拍", () => {
  vi.useFakeTimers();
  const scene = new Scene();
  const storm = new LightningStorm(scene, stub, stub, seeded(1));
  vi.advanceTimersByTime(60_000);
  expect(flashes).toEqual([]);
  storm.dispose();
});
