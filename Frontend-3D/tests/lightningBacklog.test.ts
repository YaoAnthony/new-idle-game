import { afterEach, expect, test, vi } from "vitest";
import { Scene } from "three";

import { on } from "../src/Game/EventBus";
import { debugClearWeather, debugForceWeather } from "../src/Game/State/weather";
import { LightningStorm } from "../src/Game3D/World/LightningStorm";

/**
 * 回归：挂后台三十分钟回来，不许一次炸一堆雷（2026-09-19 用户报的）。
 *
 * 老实现的节拍是一条 setTimeout 链。标签页切到后台之后 rAF 停了、`update`
 * 一帧都不跑，可 setTimeout 照样响——`strikes` 只进不出，攒了一百多道，
 * 回到前台同一帧里全部 land()：一百多次 `lightning_struck`（雷声一起炸）、
 * 一百多份材质和点光一次性进场（点光数一变 three 要给全场材质重编着色器）。
 */

afterEach(() => {
  vi.useRealTimers();
  debugClearWeather();
});

const noop = { flash: () => {}, cutSky: () => {} };
const fx = { setLightningBloom: () => {}, setFlare: () => {} };
/** 固定骰子：节拍取区间正中（9~26 秒 → 17.5 秒），落点也固定 */
const half = () => 0.5;

function makeStorm(): { storm: LightningStorm; struck: number[]; off: () => void } {
  const storm = new LightningStorm(new Scene(), noop, noop, fx, half);
  const struck: number[] = [];
  const off = on("lightning_struck", () => struck.push(1));
  return { storm, struck, off };
}

test("闪电_后台三十分钟不跑帧_不攒雷_回来也不炸一堆", () => {
  vi.useFakeTimers();
  debugForceWeather("storm");
  const { storm, struck, off } = makeStorm();

  // 后台：墙钟过了半小时，但一帧 update 都没有
  vi.advanceTimersByTime(30 * 60 * 1000);
  expect(storm.active).toBe(0);
  expect(struck).toHaveLength(0);

  // 回到前台跑两秒帧：节拍是从回来这一刻才开始数的，一道都不该到
  for (let i = 0; i < 120; i += 1) storm.update(1 / 60);
  expect(struck).toHaveLength(0);

  off();
  storm.dispose();
});

test("闪电_节拍按帧走_跑够时间照样打_而且一次只有一道", () => {
  vi.useFakeTimers();
  debugForceWeather("storm");
  const { storm, struck, off } = makeStorm();

  // 骰子恒 0.5 → 每 17.5 秒一道。跑 60 秒帧：第 17.5/35/52.5 秒各一道
  let mostInOneFrame = 0;
  for (let i = 0; i < 60 * 60; i += 1) {
    const before = struck.length;
    storm.update(1 / 60);
    mostInOneFrame = Math.max(mostInOneFrame, struck.length - before);
  }
  expect(struck).toHaveLength(3);
  expect(mostInOneFrame).toBe(1);

  off();
  storm.dispose();
});

test("闪电_并发有上限_连敲也只排得下四道", () => {
  debugForceWeather("storm");
  const { storm, off } = makeStorm();

  const hits = Array.from({ length: 20 }, () => storm.strike());
  expect(hits.filter(Boolean)).toHaveLength(4);
  expect(storm.active).toBe(4);

  off();
  storm.dispose();
});

test("闪电_天气一走就停拍_换回来重新起拍", () => {
  vi.useFakeTimers();
  debugForceWeather("storm");
  const { storm, struck, off } = makeStorm();

  debugForceWeather("sunny");
  for (let i = 0; i < 60 * 60; i += 1) storm.update(1 / 60);
  expect(struck).toHaveLength(0);

  debugForceWeather("storm");
  for (let i = 0; i < 60 * 20; i += 1) storm.update(1 / 60);
  expect(struck).toHaveLength(1);

  off();
  storm.dispose();
});
