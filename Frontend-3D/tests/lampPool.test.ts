import { afterEach, expect, test, vi } from "vitest";
import { Object3D, PointLight, Scene } from "three";

import {
  acquireLampLight,
  disposeLampPool,
  installLampPool,
  lampPoolStats,
  releaseLampLightsIn,
} from "../src/Game3D/Visual/lampPool";

/**
 * 灯光池（2026-09-19）。存在的理由是性能：three 把"场上有几盏点光"编进每个材质的
 * 着色器，数一变就要把全场材质重编一遍（实测摆一盏灯卡 100~230 ms）。
 * 所以这组用例盯的是**场上的点光总数在借还之间不变**。
 */

function countPointLights(scene: Scene): number {
  let n = 0;
  scene.traverse((node) => {
    if (node instanceof PointLight) n += 1;
  });
  return n;
}

afterEach(() => {
  disposeLampPool();
  vi.useRealTimers();
});

test("灯光池_借还不改变场上的点光总数", () => {
  const scene = new Scene();
  installLampPool(scene);
  const lamp = new Object3D();
  scene.add(lamp);

  const light = acquireLampLight()!;
  expect(light).toBeTruthy();
  const total = countPointLights(scene);

  // 借：换个父节点挂到灯具上——总数不能变，否则就是全场重编
  lamp.add(light);
  expect(countPointLights(scene)).toBe(total);

  // 还：挂回池子，总数还是不变
  releaseLampLightsIn(lamp);
  expect(countPointLights(scene)).toBe(total);
  expect(lampPoolStats().free).toBe(lampPoolStats().created);
});

test("灯光池_借出去的叫lamp-light_停着的叫lamp-slot", () => {
  const scene = new Scene();
  installLampPool(scene);
  const light = acquireLampLight()!;
  // Lighting 按名字扫全场点灯：停在池子里的必须换个名字，否则一池子灯一起亮
  expect(light.name).toBe("lamp-light");
  const holder = new Object3D();
  holder.add(light);
  releaseLampLightsIn(holder);
  expect(light.name).toBe("lamp-slot");
  expect(light.intensity).toBe(0);
});

test("灯光池_空了成批扩容_只在借不着时涨", () => {
  const scene = new Scene();
  installLampPool(scene);
  const first = lampPoolStats().created;
  const borrowed = [];
  for (let i = 0; i < first + 1; i += 1) borrowed.push(acquireLampLight()!);
  // 借光一批之后才扩下一批，而不是一盏一扩
  expect(lampPoolStats().created).toBeGreaterThan(first);
  expect(borrowed.every((light) => light instanceof PointLight)).toBe(true);
});

test("灯光池_没装的时候借不到_调用方自己造", () => {
  // headless 用例、图标渲染这些没有场景的路径：返回 null，调用方退回 new PointLight
  expect(acquireLampLight()).toBeNull();
  expect(lampPoolStats().installed).toBe(false);
});

test("灯光池_空位多了会延迟回收_玩家停手之后才缩", () => {
  vi.useFakeTimers();
  const scene = new Scene();
  installLampPool(scene);
  const holder = new Object3D();
  scene.add(holder);
  const borrowed = [];
  for (let i = 0; i < 12; i += 1) borrowed.push(acquireLampLight()!);
  for (const light of borrowed) holder.add(light);

  releaseLampLightsIn(holder);
  const rightAfter = lampPoolStats().free;
  expect(rightAfter).toBeGreaterThan(4);

  // 还没到点：不缩（玩家可能还在拆）
  vi.advanceTimersByTime(4_000);
  expect(lampPoolStats().free).toBe(rightAfter);

  vi.advanceTimersByTime(2_000);
  expect(lampPoolStats().free).toBeLessThan(rightAfter);
});
