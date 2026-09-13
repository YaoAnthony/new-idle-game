import { expect, test } from "vitest";
import { buildFishTrader } from "../src/Game3D/Visual/recipes/fishTrader";

/**
 * 小鱼人的跺脚（居民系统 20，门口那段"（跺了跺脚）"那一句挂的 residentGesture）。
 *
 * 真游戏走查的特写帧里，光抬脚几乎看不出来（腿短、被圆身子挡住），所以这条钉住的是
 * 看得见的那几样：抬脚时身子往上提、落地往下一顿并压扁；播完回到站姿；没实现的手势不理。
 */

type Idle = { state: string; moving: boolean };

test("fishTrader_跺脚_抬脚时身子上提_落地下顿压扁_播完回到站姿_没实现的手势不理", () => {
  const root = buildFishTrader();
  const body = root.getObjectByName("body")!;
  // 蹼脚是 body 最先挂上的两个子节点；跺的是后一只
  const stompingLeg = body.children[1];
  const idle: Idle = { state: "idle", moving: false };
  const animate = root.userData.animate as (dt: number, resident: Idle) => void;
  const playGesture = root.userData.playGesture as (name: string) => void;

  animate(0.016, idle);
  playGesture("stomp");

  let highestLift = 0;
  let highestBody = 0;
  let lowestBody = 0;
  let flattest = 1;
  for (let i = 0; i < 40; i += 1) {
    animate(0.015, idle);
    highestLift = Math.max(highestLift, -stompingLeg.rotation.x);
    highestBody = Math.max(highestBody, body.position.y);
    lowestBody = Math.min(lowestBody, body.position.y);
    flattest = Math.min(flattest, body.scale.y);
  }

  expect(highestLift).toBeGreaterThan(0.8);
  expect(highestBody).toBeGreaterThan(0.015);
  expect(lowestBody).toBeLessThan(-0.025);
  // 站着呼吸只有 ±0.02，压扁要明显比它扁
  expect(flattest).toBeLessThan(0.93);

  for (let i = 0; i < 10; i += 1) animate(0.016, idle);
  expect(stompingLeg.rotation.x).toBe(0);
  expect(body.position.y).toBe(0);
  expect(body.rotation.z).toBe(0);

  playGesture("no_such_gesture");
  animate(0.016, idle);
  expect(stompingLeg.rotation.x).toBe(0);
});
