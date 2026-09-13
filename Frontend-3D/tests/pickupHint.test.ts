import { expect, test } from "vitest";
import { FurnitureCapability, findPlaceableItem, itemDefinitions } from "core";

import { labelForHintAction, labelsForAction } from "../src/Game/Input/bindings";
import { stationCapabilityOf } from "../src/Game/Systems/stationCapability";

/**
 * 气泡上印的键 = F 真正会做的事。
 *
 * 起因（2026-09-13）：石傀儡的头气泡印"右键 捡起来"，而 F 的分派链里没有
 * 捡这一支——它是开场唯一的谜题道具，别的交互全是 F，只有它要右键，玩家
 * 对着它按 F 毫无反应。两半都要钉：键印对了但 F 不捡，比印错还糟。
 */

test("石傀儡的头：走近按 F 就是捡起来", () => {
  // Arrange
  const head = findPlaceableItem("golem_head")!;

  // Act
  const capability = stationCapabilityOf(head.placement);

  // Assert
  expect(capability).toBe("pickup");
});

test("捡东西的气泡印的是交互键，不是右键", () => {
  // Act
  const label = labelForHintAction("pickup");

  // Assert：跟着交互键的绑定走，不写死 "F"——玩家改了键位这里同步变
  expect(label).toBe(labelsForAction("interact")[0]);
  expect(label).not.toBe("右键");
});

test("气泡写着 pickup 的家具，F 一律是捡（不止那颗头）", () => {
  // Arrange
  const pickups = itemDefinitions.filter(
    (item) => item.placement?.interactHint?.action === "pickup",
  );
  expect(pickups.length, "注册表里一件 pickup 都没有，这条用例就空转了").toBeGreaterThan(0);

  // Act + Assert
  for (const item of pickups) {
    expect(stationCapabilityOf(item.placement!), item.id).toBe("pickup");
  }
});

test("搬出来的分派链保持原优先级：床是躺、储物箱是开箱、灯是开关", () => {
  // Arrange + Act + Assert：抽几件有代表性的，钉住"搬家没搬错顺序"
  expect(stationCapabilityOf(findPlaceableItem("furniture_bed")!.placement)).toBe("sleep");
  expect(
    stationCapabilityOf(findPlaceableItem("furniture_storage_chest")!.placement),
  ).toBe("storage");
  expect(
    stationCapabilityOf(findPlaceableItem("furniture_floor_lamp")!.placement),
  ).toBe("lighting");
});

test("没有 pickup 气泡的家具不会被 F 顺手收走", () => {
  // Arrange：只有能力、没有气泡的一件（Ambience 不在分派链里）
  const fireplace = findPlaceableItem("furniture_fireplace")!;
  expect(fireplace.placement.capabilities).toContain(FurnitureCapability.Ambience);

  // Act + Assert
  expect(stationCapabilityOf(fireplace.placement)).not.toBe("pickup");
});
