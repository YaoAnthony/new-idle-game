import assert from "node:assert/strict";
import { test } from "node:test";

import type { CropDefinition } from "../src/types/farming.js";
import { cropDefinitions } from "../src/Data/crops/index.js";
import { itemDefinitions } from "../src/Data/items/index.js";
import { auditCrops } from "../src/logic/farmingAudit.js";

/** 作物表体检。真表要干净；坏一处就报一处 */

const options = { hasVisual: () => true, hasLocalizationKey: () => true };

test("farmingAudit_真表干净", () => {
  assert.deepEqual(auditCrops(cropDefinitions, itemDefinitions, options), []);
});

function tomato(): CropDefinition {
  return JSON.parse(JSON.stringify(cropDefinitions.find((crop) => crop.cropId === "tomato")));
}

test("farmingAudit_stages首项不是0_报", () => {
  const crop = tomato();
  (crop.stages as unknown as { at: number }[])[0].at = 0.1;
  assert.ok(auditCrops([crop], itemDefinitions, options).some((p) => p.includes("首项")));
});

test("farmingAudit_种子不指回作物_报", () => {
  const crop = tomato();
  crop.seedItemId = "tomato"; // 番茄不是种子
  assert.ok(auditCrops([crop], itemDefinitions, options).some((p) => p.includes("没指回来")));
});

test("farmingAudit_作物改了id_种子那头也报_反向对表", () => {
  const crop = tomato();
  crop.cropId = "cherry"; // tomato_seed 的 seed.cropId 仍是 tomato
  const problems = auditCrops([crop], itemDefinitions, options);
  assert.ok(problems.some((p) => p.includes("没指回来")));
  assert.ok(problems.some((p) => p.startsWith("种子 tomato_seed")), "反向：tomato_seed 指的作物不在表里");
});

test("farmingAudit_收获物不存在_没有水_造型没登记_各报一条", () => {
  const crop = tomato();
  crop.harvest = { ...crop.harvest, itemId: "nope" };
  crop.needs = [];
  const problems = auditCrops([crop], itemDefinitions, { ...options, hasVisual: () => false });
  assert.ok(problems.some((p) => p.includes("收获物 nope")));
  assert.ok(problems.some((p) => p.includes("没有水")));
  assert.ok(problems.filter((p) => p.includes("没登记")).length >= 4, "四段 + 巨大各一条");
});
