import { beforeEach, expect, test } from "vitest";
import { BodyPosture, DEFAULT_MAP_ID, attentionTuning, defaultAvatarConfig } from "core";
import { getLocalParticipant, setLocalTransform } from "../src/Game/State/participants";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { CharacterController } from "../src/Game3D/Interaction/CharacterController";
import { buildCharacter } from "../src/Game3D/World/CharacterView";

/**
 * 玩家这一半的注视（居民系统 21）：对话时你也转过去看他。
 * 站着逐帧转身、坐着只转头、躺着头也不转；头的偏转写进 transform 给远端。
 */

const DT = 1 / 30;

function controllerAt(x: number, z: number): CharacterController {
  setLocalTransform(x, z, 0);
  return new CharacterController(buildCharacter(defaultAvatarConfig()));
}

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
});

test("player_attention_站着_逐帧转身面向目标_转到了头回正_写进transform", () => {
  const controller = controllerAt(0, 0);
  controller.attend({ kind: "point", x: 3, z: 0 });

  controller.update(DT, 0);
  expect(controller.heading).toBeGreaterThan(0);
  expect(controller.heading).toBeLessThan(Math.PI / 2);
  expect(controller.headYaw).toBeGreaterThan(0);

  for (let i = 0; i < 150; i += 1) controller.update(DT, 0);
  expect(controller.heading).toBeCloseTo(Math.PI / 2, 2);
  expect(Math.abs(controller.headYaw)).toBeLessThan(0.05);
  expect(getLocalParticipant().transform.headYaw).toBeCloseTo(controller.headYaw, 6);
});

test("player_attention_坐着_不转身只转头_头夹在限角内", () => {
  const controller = controllerAt(0, 0);
  controller.posture = BodyPosture.Sit;
  controller.attend({ kind: "point", x: 3, z: -3 });

  for (let i = 0; i < 150; i += 1) controller.update(DT, 0);

  expect(controller.heading).toBe(0);
  expect(controller.headYaw).toBeCloseTo(attentionTuning.headClampRad, 2);
  expect(getLocalParticipant().transform.headYaw).toBeCloseTo(controller.headYaw, 6);
});

test("player_attention_躺着_头也不转_不看了头回正", () => {
  const controller = controllerAt(0, 0);
  controller.posture = BodyPosture.Lie;
  controller.attend({ kind: "point", x: 3, z: 0 });
  for (let i = 0; i < 30; i += 1) controller.update(DT, 0);
  expect(controller.headYaw).toBe(0);

  controller.posture = BodyPosture.Sit;
  for (let i = 0; i < 150; i += 1) controller.update(DT, 0);
  expect(controller.headYaw).toBeGreaterThan(0.5);

  controller.unattend();
  for (let i = 0; i < 150; i += 1) controller.update(DT, 0);
  expect(Math.abs(controller.headYaw)).toBeLessThan(1e-6);
});
