import assert from "node:assert/strict";
import { test } from "node:test";

import { auditAvatarContent } from "../src/logic/avatarAudit.js";
import { auditDoorContent } from "../src/logic/doorAudit.js";
import { auditStoryContent } from "../src/logic/storyAudit.js";
import { footprintCells } from "../src/logic/grid.js";
import { Facing } from "../src/types/base.js";
import { FurnitureCapability, PlacementSurface } from "../src/types/furniture.js";
import {
  findItemDefinition,
  isPlaceable,
  itemDefinitions,
  placeableItems,
} from "../src/Data/items/index.js";
import { recipeDefinitions } from "../src/Data/recipes/index.js";
import { cookingRecipeDefinitions, mysteryDish } from "../src/Data/cooking/index.js";
import { lootTableDefinitions } from "../src/Data/loot/index.js";
import { actionDefinitions } from "../src/Data/actions/index.js";
import { petDefinitions, petTastes } from "../src/Data/pets/index.js";
import type { PetDefinition } from "../src/types/pets.js";
import { findDialogueDefinition } from "../src/Data/dialogues/index.js";
import { findEventDefinition } from "../src/Data/events/index.js";
import { findAudioProfileDefinition } from "../src/Data/audio/index.js";
import {
  DEFAULT_WEATHER_ID,
  findWeatherDefinition,
  weatherWeights,
} from "../src/Data/weather/index.js";

/**
 * 内容注册表的完整性。
 *
 * 这一份测的不是算法，是**数据里有没有指向不存在的东西**。注册表里的
 * id 全是 string，写错了编译器一声不吭，运行时表现是「静默地永远不触发」
 * ——已经出过一次：教程第二步的 subject 停在 V0.4 之前的 id，教程永远
 * 卡在 2/6，而它看起来只是"还没做到那一步"。
 *
 * `main.tsx` 已经在 DEV 开机时跑三个 audit，但那只在有人真的启动客户端
 * 时才会看到，而且只是 console.warn。放进测试才拦得住 CI。
 *
 * **文案键不在这里查**：i18n 表住在 Frontend，Core 不该知道它长什么样。
 * 那一半由 Frontend-3D 的 content.test.ts 补（它能把真表传进同一个 audit）。
 */

const itemIds = new Set(itemDefinitions.map((item) => item.id));

// ---- 三个现成的 audit ----

/**
 * 已知未修的内容问题，逐条钉住。
 *
 * 不用"允许有 N 条问题"那种松口子——那样再多出一条一样是绿的。逐条列出
 * 之后，**新问题立刻变红，修好了旧的也会变红**（提醒把这一行删掉）。
 *
 * 2026-08-13 清空：唯一那条（`mom_first_call` 的 m4 节点发
 * `mom_promised_machine` 但没人监听）随旧剧情一起删掉了。
 * 新剧情写出来之后，这个数组仍然是"暂时不修但不许忘"的登记处。
 */
const KNOWN_STORY_PROBLEMS: string[] = [];

test("剧情注册表没有指向不存在的东西（已知项之外）", () => {
  const problems = auditStoryContent();

  const unexpected = problems.filter((problem) => !KNOWN_STORY_PROBLEMS.includes(problem));
  assert.deepEqual(unexpected, [], `剧情数据多出 ${unexpected.length} 处新问题`);

  const fixed = KNOWN_STORY_PROBLEMS.filter((known) => !problems.includes(known));
  assert.deepEqual(fixed, [], "这些已知问题已经修好了，把它们从 KNOWN_STORY_PROBLEMS 里删掉");
});

test("捏人注册表没有指向不存在的东西", () => {
  const problems = auditAvatarContent();
  assert.deepEqual(problems, [], `捏人数据有 ${problems.length} 处对不上`);
});

test("门注册表没有指向不存在的东西", () => {
  const problems = auditDoorContent();
  assert.deepEqual(problems, [], `门数据有 ${problems.length} 处对不上`);
});

// ---- 物品表本身 ----

test("物品 id 不重复", () => {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const item of itemDefinitions) {
    if (seen.has(item.id)) duplicates.push(item.id);
    seen.add(item.id);
  }
  assert.deepEqual(duplicates, []);
});

test("每件物品都有 visual、文案键和正数堆叠上限", () => {
  for (const item of itemDefinitions) {
    assert.ok(item.visual?.id, `${item.id} 没有 visual.id——表现层只能蒙，蒙不中就静默不画`);
    assert.ok(item.localizationKey, `${item.id} 没有文案键`);
    assert.ok(item.stackLimit >= 1, `${item.id} 的堆叠上限是 ${item.stackLimit}`);
  }
});

test("能摆的东西占地是正数，遮罩落在占地矩形内", () => {
  for (const item of placeableItems()) {
    const { footprint, footprintMask } = item.placement;
    assert.ok(footprint.width >= 1 && footprint.height >= 1, `${item.id} 的占地不合法`);

    for (const [mx, my] of footprintMask ?? []) {
      assert.ok(
        mx >= 0 && mx < footprint.width && my >= 0 && my < footprint.height,
        `${item.id} 的遮罩格 (${mx},${my}) 跑到 ${footprint.width}×${footprint.height} 的占地外面了`,
      );
    }
  }
});

test("遮罩转四个朝向都不会跑出占地包围盒", () => {
  for (const item of placeableItems()) {
    const { footprint, footprintMask } = item.placement;
    if (!footprintMask?.length) continue;

    const span = Math.max(footprint.width, footprint.height);
    for (const facing of [Facing.North, Facing.East, Facing.South, Facing.West]) {
      for (const cell of footprintCells({ x: 0, y: 0 }, footprint, facing, footprintMask)) {
        assert.ok(
          cell.x >= 0 && cell.y >= 0 && cell.x < span && cell.y < span,
          `${item.id} 朝 ${facing} 时遮罩格 (${cell.x},${cell.y}) 越出包围盒`,
        );
      }
    }
  }
});

test("台面网格 = 占地 × 2（半格制），声明了就得对上", () => {
  for (const item of placeableItems()) {
    const { footprint, surfaceGrid } = item.placement;
    if (!surfaceGrid) continue;

    assert.equal(
      surfaceGrid.width,
      footprint.width * 2,
      `${item.id} 的台面宽度和占地对不上（半格制要求 ×2）`,
    );
    assert.equal(surfaceGrid.height, footprint.height * 2, `${item.id} 的台面进深对不上`);
  }
});

test("台面黑名单落在台面网格内", () => {
  for (const item of placeableItems()) {
    const { surfaceGrid, surfaceBlocked } = item.placement;
    if (!surfaceBlocked?.length) continue;

    assert.ok(surfaceGrid, `${item.id} 声明了 surfaceBlocked 却没有台面网格`);
    for (const [x, y] of surfaceBlocked) {
      assert.ok(
        x >= 0 && x < surfaceGrid.width && y >= 0 && y < surfaceGrid.height,
        `${item.id} 的黑名单格 (${x},${y}) 在台面之外`,
      );
    }
  }
});

test("有台面高度的必须挡路——不挡路的家具东西直接落地，台面高度没有意义", () => {
  for (const item of placeableItems()) {
    if (item.placement.surfaceHeight === undefined) continue;
    assert.equal(
      item.placement.blocksMovement,
      true,
      `${item.id} 声明了台面高度却不挡路`,
    );
    assert.ok(item.placement.surfaceHeight > 0, `${item.id} 的台面高度不是正数`);
  }
});

test("能坐能躺的家具必须有对应锚点，否则那件事没有落脚点", () => {
  for (const item of placeableItems()) {
    const { capabilities, anchors } = item.placement;
    const needsAnchor =
      capabilities.includes(FurnitureCapability.Sitting) ||
      capabilities.includes(FurnitureCapability.Sleep);
    if (!needsAnchor) continue;

    assert.ok(anchors?.length, `${item.id} 声明了能坐/能睡，却一个锚点都没有`);
  }
});

test("墙饰不声明台面网格，台面件不摆在墙上", () => {
  for (const item of placeableItems()) {
    if (item.placement.surface !== PlacementSurface.Wall) continue;
    assert.equal(item.placement.surfaceGrid, undefined, `${item.id} 是墙饰却声明了台面`);
  }
});

test("槽位接受的物品 id 都存在", () => {
  for (const item of placeableItems()) {
    for (const slot of item.placement.slots ?? []) {
      assert.ok(slot.slotId, `${item.id} 有个槽位没有 id`);
      for (const accepted of slot.acceptedItemIds ?? []) {
        assert.ok(itemIds.has(accepted), `${item.id}/${slot.slotId} 收的 ${accepted} 不存在`);
      }
    }
  }
});

// ---- 制作 / 烹饪 ----

test("制作配方的材料和产出都指向真实物品", () => {
  for (const recipe of recipeDefinitions) {
    assert.ok(recipe.ingredients.length > 0, `配方 ${recipe.id} 一样材料都没有`);
    for (const entry of [...recipe.ingredients, ...recipe.outputs]) {
      assert.ok(itemIds.has(entry.itemId), `配方 ${recipe.id} 引用了不存在的 ${entry.itemId}`);
      assert.ok(entry.quantity > 0, `配方 ${recipe.id} 的 ${entry.itemId} 数量不是正数`);
    }
  }
});

test("制作配方 id 不重复", () => {
  const ids = recipeDefinitions.map((recipe) => recipe.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("菜谱绑的厨具是真厨具，且支持那种加工方式", () => {
  for (const recipe of cookingRecipeDefinitions) {
    const cookware = findItemDefinition(recipe.cookwareId)?.cookware;
    assert.ok(cookware, `菜谱 ${recipe.id} 的 ${recipe.cookwareId} 不是厨具`);
    assert.ok(
      cookware.methods.includes(recipe.method),
      `菜谱 ${recipe.id} 要 ${recipe.method}，而 ${recipe.cookwareId} 只会 ${cookware.methods.join("/")}`,
    );
  }
});

test("菜谱的材料存在，产出是能吃的东西", () => {
  for (const recipe of cookingRecipeDefinitions) {
    for (const input of recipe.inputs) {
      assert.ok(itemIds.has(input.itemId), `菜谱 ${recipe.id} 的材料 ${input.itemId} 不存在`);
      assert.ok(input.quantity > 0);
    }
    const output = findItemDefinition(recipe.output);
    assert.ok(output, `菜谱 ${recipe.id} 的产出 ${recipe.output} 不存在`);
    assert.ok(output.food, `菜谱 ${recipe.id} 做出来的 ${recipe.output} 不能吃`);
    assert.ok(recipe.durationSeconds > 0, `菜谱 ${recipe.id} 的时长不是正数`);
  }
});

test("乱炖那道兜底菜必须真的存在——它是锅永远有结果的保证", () => {
  const dish = findItemDefinition(mysteryDish.itemId);
  assert.ok(dish, `兜底菜 ${mysteryDish.itemId} 不在物品表里`);
  assert.ok(dish.food, "兜底菜得能吃");
});

test("同一口锅上不存在材料完全相同的两条菜谱（否则永远只能匹配到第一条）", () => {
  const signatures = new Map<string, string>();

  for (const recipe of cookingRecipeDefinitions) {
    const signature = [
      recipe.cookwareId,
      ...recipe.inputs
        .map((input) => `${input.itemId}×${input.quantity}`)
        .sort(),
    ].join("|");

    const previous = signatures.get(signature);
    assert.equal(previous, undefined, `${recipe.id} 和 ${previous} 的材料完全一样`);
    signatures.set(signature, recipe.id);
  }
});

// ---- 其余注册表 ----

test("战利品表里的东西都存在", () => {
  for (const table of lootTableDefinitions) {
    assert.ok(table.entries.length > 0, `战利品表 ${table.id} 是空的`);
    for (const entry of table.entries) {
      assert.ok(itemIds.has(entry.itemId), `战利品表 ${table.id} 给的 ${entry.itemId} 不存在`);
      assert.ok(entry.quantity > 0);
    }
  }
});

test("行动的奖励物品存在，声音档案存在，时长区间合法", () => {
  for (const action of actionDefinitions) {
    for (const reward of action.rewards ?? []) {
      if (reward.type !== "item") continue;
      assert.ok(itemIds.has(reward.itemId), `行动 ${action.id} 奖励了不存在的 ${reward.itemId}`);
    }
    if (action.audioProfileId) {
      assert.ok(
        findAudioProfileDefinition(action.audioProfileId),
        `行动 ${action.id} 的声音档案 ${action.audioProfileId} 不存在`,
      );
    }
    assert.ok(
      action.durationMinutes.min > 0 && action.durationMinutes.min <= action.durationMinutes.max,
      `行动 ${action.id} 的时长区间不合法`,
    );
  }
});

test("喜好表只列真实物品，且每只宠物的四档不互相打架", () => {
  for (const [petId, taste] of Object.entries(petTastes)) {
    const seen = new Map<string, string>();

    for (const [tier, list] of Object.entries({
      loved: taste.loved,
      liked: taste.liked,
      disliked: taste.disliked,
      inedible: taste.inedible,
    })) {
      for (const id of list) {
        assert.ok(itemIds.has(id), `宠物 ${petId} 的喜好里有不存在的 ${id}`);
        // 同一件东西同时列在两档里 → baseTier 只会命中先查的那一档，
        // 另一档写了等于没写，而作者多半以为自己改的是生效的那条
        const previous = seen.get(id);
        assert.equal(previous, undefined, `宠物 ${petId} 把 ${id} 同时列进了 ${previous} 和 ${tier}`);
        seen.set(id, tier);
      }
    }
  }
});

test("喜好表的每个键都对得上一只真实宠物", () => {
  const petIds = new Set(petDefinitions.map((pet) => pet.id));
  for (const petId of Object.keys(petTastes)) {
    assert.ok(petIds.has(petId), `喜好表里的 ${petId} 不是任何一只宠物`);
  }
});

test("宠物的对话和事件都指向真实数据", () => {
  // 显式标注：注册表是字面量数组，推断出的联合类型上没有可选字段
  for (const pet of petDefinitions as readonly PetDefinition[]) {
    for (const dialogueId of Object.values(pet.dialogues ?? {})) {
      assert.ok(
        findDialogueDefinition(dialogueId),
        `宠物 ${pet.id} 引用了不存在的对话 ${dialogueId}`,
      );
    }
    if (pet.bondEventId) {
      assert.ok(
        findEventDefinition(pet.bondEventId),
        `宠物 ${pet.id} 引用了不存在的事件 ${pet.bondEventId}`,
      );
    }
  }
});

test("宠物 id 和造型 id 都不为空且不重复", () => {
  const ids = petDefinitions.map((pet) => pet.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const pet of petDefinitions) {
    assert.ok(pet.visualId, `宠物 ${pet.id} 没有造型 id`);
  }
});

test("天气权重表只引用注册过的天气，默认天气存在", () => {
  for (const entry of weatherWeights) {
    assert.ok(
      findWeatherDefinition(entry.weatherId),
      `权重表里的 ${entry.weatherId} 没有定义`,
    );
    assert.ok(entry.weight > 0, `${entry.weatherId} 的权重不是正数`);
  }
  assert.ok(findWeatherDefinition(DEFAULT_WEATHER_ID));
});

test("唱片机出厂自带的唱片存在，而且真的是一张唱片", () => {
  for (const item of itemDefinitions) {
    if (!item.musicPlayer) continue;

    const record = findItemDefinition(item.musicPlayer.defaultRecordItemId);
    assert.ok(record, `${item.id} 出厂唱片 ${item.musicPlayer.defaultRecordItemId} 不存在`);
    assert.ok(record.record, `${item.id} 出厂装的 ${record.id} 不是唱片`);
  }
});

test("唱片都指到某个专辑", () => {
  for (const item of itemDefinitions) {
    if (!item.record) continue;
    assert.ok(item.record.albumId, `唱片 ${item.id} 没有 albumId`);
  }
});

test("物品声明的声音档案都存在", () => {
  for (const item of itemDefinitions) {
    for (const profileId of Object.values(item.audio ?? {})) {
      if (!profileId) continue;
      assert.ok(
        findAudioProfileDefinition(profileId),
        `${item.id} 的声音档案 ${profileId} 不存在`,
      );
    }
  }
});

test("isPlaceable 和 placement 字段是同一个判据", () => {
  for (const item of itemDefinitions) {
    assert.equal(isPlaceable(item), Boolean(item.placement), `${item.id} 的两个判据不一致`);
  }
  assert.equal(placeableItems().length, itemDefinitions.filter((i) => i.placement).length);
});
