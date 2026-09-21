import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PerspectiveCamera, PointLight, Scene } from "three";

import { on } from "../src/Game/EventBus";
import {
  acquireLampLight,
  disposeLampPool,
  installLampPool,
  lampPoolStats,
  releaseLampLightsIn,
} from "../src/Game3D/Visual/lampPool";
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
  disposeLampPool();
});

function countPointLights(scene: Scene): number {
  let n = 0;
  scene.traverse((node) => {
    if (node instanceof PointLight) n += 1;
  });
  return n;
}

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
  // 没给镜头时闪电算在屏幕正中：竖带在它左、右、中各闪一下
  const bands = flares.filter(([, , f]) => f > 0).map(([c]) => c);
  expect(new Set(bands)).toEqual(new Set([0.3, 0.7, 0.5]));

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

test("lightning_闪电在镜头背后就没有耀斑_在镜头里竖带跟着它的屏幕位置", () => {
  const scene = new Scene();
  const storm = new LightningStorm(scene, lighting, sky, fx, seeded(9));
  const camera = new PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(0, 8, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  storm.setCamera(camera);
  // 背后：+z 方向 40 米
  storm.strike({ x: 0, z: 60 });
  tick(storm, 0.3);
  expect(flares.filter(([, , f]) => f > 0)).toHaveLength(0);
  storm.dispose();

  flares.length = 0;
  const storm2 = new LightningStorm(scene, lighting, sky, fx, seeded(9));
  storm2.setCamera(camera);
  // 前方偏左
  storm2.strike({ x: -12, z: -20 });
  tick(storm2, 0.3);
  const lit = flares.filter(([, , f]) => f > 0);
  expect(lit.length).toBeGreaterThan(0);
  expect(lit.every(([c]) => c < 0.5)).toBe(true);
  storm2.dispose();
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

/**
 * 落地那盏光从灯光池借，不自己 new（2026-09-21）。
 *
 * three 把"场上有几盏点光"编进每个材质的着色器，数一变就要重编全场：
 * 隔离量过，本场第一次变化 432 ms / 多编 10 个程序（软渲染），之后每次加撤
 * 也要 6~26 ms 对着 3 ms 的空帧。所以这条盯的是**一道雷从头到尾，
 * 场上的点光总数一动不动**。
 */
test("lightning_落地的光从池子借还_一道雷下来点光总数不变", () => {
  const scene = new Scene();
  installLampPool(scene);
  /*
   * 先借还一次把池子催起来。真游戏里 `warmLampPoolWith` 在渲染器就位时就备了货；
   * 用例里不催的话，第一次借正好撞上"空池扩容"，那一下本来就该改变总数。
   */
  releaseLampLightsIn(acquireLampLight()!);
  const baseline = countPointLights(scene);
  const freeBefore = lampPoolStats().free;

  const storm = new LightningStorm(scene, lighting, sky, fx, seeded(3));
  storm.strike();
  tick(storm, 0.8);
  // 落地了：画布 + 一盏光挂在 lightning 下面，但场上的点光总数没变——是借的
  expect(scene.getObjectByName("lightning")!.children).toHaveLength(2);
  expect(countPointLights(scene)).toBe(baseline);
  expect(lampPoolStats().free).toBe(freeBefore - 1);
  // 名字不能是 lamp-light，否则 Lighting 会按昼夜表拨它的亮度
  expect(scene.getObjectByName("lightning-light")).toBeTruthy();

  // 演完收场：光还回池子（既没被摘走、也没留在场上发光）
  tick(storm, 2.5);
  expect(storm.active).toBe(0);
  expect(scene.getObjectByName("lightning")!.children).toHaveLength(0);
  expect(countPointLights(scene)).toBe(baseline);
  expect(lampPoolStats().free).toBe(freeBefore);
  expect(scene.getObjectByName("lightning-light")).toBeUndefined();

  storm.dispose();
});

test("lightning_没装池子也能打_退回自己造一盏_收场时清干净", () => {
  const scene = new Scene();
  const storm = new LightningStorm(scene, lighting, sky, fx, seeded(3));
  storm.strike();
  tick(storm, 0.8);
  expect(countPointLights(scene)).toBe(1);
  tick(storm, 2.5);
  expect(countPointLights(scene)).toBe(0);
  storm.dispose();
});
