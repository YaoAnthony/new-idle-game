import assert from "node:assert/strict";
import { test } from "node:test";

import { auditAvatarContent } from "../src/logic/avatarAudit.js";
import { auditDoorContent } from "../src/logic/doorAudit.js";
import { auditStoryContent } from "../src/logic/storyAudit.js";
import { footprintCells } from "../src/logic/grid.js";
import { Facing } from "../src/types/base.js";
import { FurnitureCapability, PlacementSurface } from "../src/types/furniture.js";
import { ItemOrigin } from "../src/types/items.js";
import { ActionCategory } from "../src/types/actions.js";
import type { RewardDefinition } from "../src/types/events.js";
import { dailyBoardDefinition } from "../src/Data/dailyTasks/index.js";
import { merchantDefinitions } from "../src/Data/merchants/index.js";
import { storyRules } from "../src/Data/story/index.js";
import {
  findItemDefinition,
  isPlaceable,
  itemDefinitions,
  placeableItems,
  untradableItemIds,
  findBlueprintForBuilding,
} from "../src/Data/items/index.js";
import { chestExcludedItemIds } from "../src/Data/actionChains/index.js";
import { recipeDefinitions } from "../src/Data/recipes/index.js";
import { cookingRecipeDefinitions, mysteryDish } from "../src/Data/cooking/index.js";
import { lootTableDefinitions } from "../src/Data/loot/index.js";
import { actionDefinitions } from "../src/Data/actions/index.js";
import { residentDefinitions, residentTastes } from "../src/Data/residents/index.js";
import { findPersonality, personalityDefinitions } from "../src/Data/residents/personalities.js";
import { SPOT_KINDS } from "../src/Data/residents/spots.js";
import type { ResidentDefinition } from "../src/types/residents.js";
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
    /*
     * 期 2 之后四条基础行动的 rewards 全空（走开箱），所以这个循环
     * **今天一次都不进**——`satisfies` 保留的字面量类型会把元素收成
     * `never`，得显式放宽才编得过。
     *
     * 那为什么还留着：`rewards` 那条路没有废，特殊行动（剧情任务、
     * 教程步骤）仍然会写死奖励，而那时候"指向一件不存在的物品"依旧是
     * 静默失效。留着比等出事再补便宜。
     */
    for (const reward of action.rewards as RewardDefinition[]) {
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
  for (const [residentId, taste] of Object.entries(residentTastes)) {
    const seen = new Map<string, string>();

    for (const [tier, list] of Object.entries({
      loved: taste.loved,
      liked: taste.liked,
      disliked: taste.disliked,
      inedible: taste.inedible,
    })) {
      for (const id of list) {
        assert.ok(itemIds.has(id), `宠物 ${residentId} 的喜好里有不存在的 ${id}`);
        // 同一件东西同时列在两档里 → baseTier 只会命中先查的那一档，
        // 另一档写了等于没写，而作者多半以为自己改的是生效的那条
        const previous = seen.get(id);
        assert.equal(previous, undefined, `宠物 ${residentId} 把 ${id} 同时列进了 ${previous} 和 ${tier}`);
        seen.set(id, tier);
      }
    }
  }
});

test("喜好表的每个键都对得上一只真实宠物", () => {
  const petIds = new Set(residentDefinitions.map((resident) => resident.id));
  for (const residentId of Object.keys(residentTastes)) {
    assert.ok(petIds.has(residentId), `喜好表里的 ${residentId} 不是任何一只宠物`);
  }
});

test("宠物的对话和事件都指向真实数据", () => {
  // 显式标注：注册表是字面量数组，推断出的联合类型上没有可选字段
  for (const resident of residentDefinitions as readonly ResidentDefinition[]) {
    for (const dialogueId of Object.values(resident.dialogues ?? {})) {
      assert.ok(
        findDialogueDefinition(dialogueId),
        `宠物 ${resident.id} 引用了不存在的对话 ${dialogueId}`,
      );
    }
    if (resident.bondEventId) {
      assert.ok(
        findEventDefinition(resident.bondEventId),
        `宠物 ${resident.id} 引用了不存在的事件 ${resident.bondEventId}`,
      );
    }
  }
});

test("居民的住处指向一张真实存在的图纸，且只有居民档才有住处", () => {
  for (const resident of residentDefinitions as readonly ResidentDefinition[]) {
    if (!resident.residence) continue;
    assert.equal(
      resident.role,
      "resident",
      `${resident.id} 填了 residence 却不是居民档——搬入判定只认居民`,
    );
    assert.ok(
      findBlueprintForBuilding(resident.residence.buildingId),
      `${resident.id} 的房型 ${resident.residence.buildingId} 没有对应的图纸物品，/npc join 发不出东西`,
    );
  }
  // 同一栋房型不能有两位住户：完工信号只会让一个人搬进来
  const houses = (residentDefinitions as readonly ResidentDefinition[])
    .map((resident) => resident.residence?.buildingId)
    .filter(Boolean);
  assert.equal(new Set(houses).size, houses.length, "两位居民认领了同一种房子");
});

test("居民的性格都在性格表里，性格表里的场所都在场所表里", () => {
  for (const pet of residentDefinitions as readonly ResidentDefinition[]) {
    if (!pet.residence) continue;
    assert.ok(pet.personalityId, `${pet.id} 有房子却没有性格，routine 会永远不作声`);
    assert.ok(findPersonality(pet.personalityId!), `${pet.id} 的性格 ${pet.personalityId} 不在性格表里`);
  }
  for (const personality of personalityDefinitions) {
    for (const segment of personality.routine) {
      if (segment.do === "visit") {
        assert.ok(segment.spot && SPOT_KINDS.includes(segment.spot), `${personality.id} 的 visit 段指向未知场所 ${segment.spot}`);
      }
      assert.match(segment.from, /^\d{2}:\d{2}$/, `${personality.id} 时段格式 ${segment.from}`);
      assert.match(segment.to, /^\d{2}:\d{2}$/, `${personality.id} 时段格式 ${segment.to}`);
    }
  }
});

test("宠物 id 和造型 id 都不为空且不重复", () => {
  const ids = residentDefinitions.map((resident) => resident.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const resident of residentDefinitions) {
    assert.ok(resident.visualId, `宠物 ${resident.id} 没有造型 id`);
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

// ---- 价格（期 1 · 小动物经济圈）----

/**
 * 可交易的东西必须有价。
 *
 * 漏写的后果不是崩溃，是**它在商人那儿卖 0 金币**——玩家点了卖、东西没了、
 * 钱没多，看起来像 bug 而且没人报得清。这类"静默地不对"正是这份文件
 * 存在的理由。
 *
 * 豁免的是**结构上就不该交易**的三类：
 * 图纸（商店发的凭证，能倒卖就是套现口子）、
 * `untradableItemIds` 点名的（卖了会坏事，**各有各的理由，写在那张表上**）、
 * `chestExcludedItemIds` 里的场景道具（本来就进不了背包）。
 *
 * **没有按 `ItemCategory.Quest` 整类豁免**：注册表里今天一件 Quest 物品
 * 都没有（`typecheck:tests` 会把那种恒假的比较当错误报出来），而且
 * 整类豁免不如点名表——点名逼作者写下"为什么这件不能卖"，
 * 而那句话正是三个月后唯一有用的东西。以后真加了 Quest 物品，
 * 这条用例会要它给个价，作者要么给、要么进点名表，两条路都对。
 */
test("可交易的物品都有价——漏写的会静默地卖 0 金币", () => {
  for (const item of itemDefinitions) {
    if (item.blueprint) continue;
    if (untradableItemIds.has(item.id)) continue;
    if (chestExcludedItemIds.has(item.id)) continue;

    assert.equal(
      typeof item.value,
      "number",
      `${item.id}（${item.category}）没写 value——它会在商人那儿卖 0 金币`,
    );
    assert.ok(item.value! > 0, `${item.id} 的 value 应该大于 0`);
  }
});

test("不该交易的东西没有价——有价就说明它能被卖掉", () => {
  for (const item of itemDefinitions) {
    if (item.blueprint) {
      assert.equal(item.value, undefined, `图纸 ${item.id} 不该有价：能倒卖就是套现口子`);
    }
    if (untradableItemIds.has(item.id)) {
      assert.equal(item.value, undefined, `${item.id} 在不可交易名单里，不该有价`);
    }
  }
});

test("不可交易名单里的 id 都是真物品——写错了等于没拦住", () => {
  for (const id of untradableItemIds) {
    assert.ok(findItemDefinition(id), `不可交易名单里的 "${id}" 不是任何物品 id`);
  }
});

/**
 * 熟食必须比材料之和贵。
 *
 * 不然做饭在经济上是**赔本**的：玩家会把生食材直接卖掉，厨房那套
 * 火候玩法连带作废。这条比"价格好不好看"重要得多，所以钉成用例。
 */
test("熟食比它的材料之和贵——否则做饭是赔本买卖", () => {
  for (const recipe of cookingRecipeDefinitions) {
    const output = findItemDefinition(recipe.output);
    if (!output?.value) continue;
    const inputSum = recipe.inputs.reduce((sum, input) => {
      const item = findItemDefinition(input.itemId);
      return sum + (item?.value ?? 0) * input.quantity;
    }, 0);
    assert.ok(
      output.value > inputSum,
      `${recipe.output} 卖 ${output.value}，材料值 ${inputSum}——做饭反而亏钱`,
    );
  }
});

// ---- 行动开箱（期 2 · 小动物经济圈）----

/**
 * 行动的奖励**默认走开箱**。
 *
 * 钉这一条是因为"空数组=开箱"是个约定，而约定最容易在某次
 * "顺手把奖励填回去"的改动里被破坏——填回去之后行动就不开箱了，
 * 而且不会报错，只会安静地变回旧玩法。
 */
test("四条行动要么开箱要么显式关掉，没有第三种", () => {
  for (const action of actionDefinitions) {
    if (action.noChest) {
      assert.equal(
        action.rewards.length,
        0,
        `${action.id} 既写了 noChest 又写了奖励——两个意思打架`,
      );
      continue;
    }
    assert.equal(
      action.rewards.length,
      0,
      `${action.id} 写死了奖励，不会开箱。特殊行动可以这样，但四条基础行动不该`,
    );
  }
});

test("休息不掉东西——它是唯一不耗精力的行动，白开箱就是无限刷货", () => {
  const rest = actionDefinitions.find((a) => a.category === ActionCategory.Rest);
  assert.ok(rest, "找不到休息这条行动");
  assert.equal(rest!.noChest, true);
  assert.ok(rest!.fatigueCost < 0, "休息应该是回精力的");
});

test("每日任务满格只给金币——两条产出线各出一种，读得懂才记得住", () => {
  for (const reward of dailyBoardDefinition.rewards) {
    assert.equal(
      reward.type,
      "gold",
      `满格奖里混进了 ${reward.type}：行动出家具、任务出金币，别串线`,
    );
  }
});

/**
 * `origin` 的分工（决策 28）：工作台造得出来的是这边的，其余是那边来的。
 *
 * 它同时是**定价的依据**（那边来的贵，水獭稀罕）和**说法**（他没货源，
 * 所以只收不卖）。分工错了两头都跟着错，而且不会有任何报错。
 */
test("工作台造得出来的家具都是 Otherworld——本地木头敲的，商人见得多", () => {
  const crafted = new Set(
    recipeDefinitions.flatMap((recipe) => recipe.outputs.map((o) => o.itemId)),
  );
  for (const itemId of crafted) {
    const item = findItemDefinition(itemId);
    if (!item?.placement) continue;
    assert.notEqual(
      item.origin,
      ItemOrigin.Real,
      `${itemId} 工作台造得出来，却标成了"那边来的"——定价和商人的说法都会跟着错`,
    );
  }
});

test("开箱池里两种 origin 都有——池子不按 origin 筛（决策 12/17）", () => {
  const pool = itemDefinitions.filter(
    (item) => item.placement && !item.record && !chestExcludedItemIds.has(item.id),
  );
  assert.ok(pool.some((i) => i.origin === ItemOrigin.Real), "池里没有'那边来的'");
  assert.ok(
    pool.some((i) => i.origin === ItemOrigin.Otherworld),
    "池里没有'这边造的'",
  );
});

// ---- 商人与偷窃（期 3 · 小动物经济圈）----

test("商人货架上的东西都存在、都有价——漏一样就是卖空气", () => {
  for (const merchant of merchantDefinitions) {
    for (const itemId of merchant.stock) {
      const item = findItemDefinition(itemId);
      assert.ok(item, `商人 ${merchant.merchantId} 的货架上有不存在的 "${itemId}"`);
      assert.ok(
        typeof item!.value === "number" && item!.value > 0,
        `货架上的 ${itemId} 没有价——买它等于白拿`,
      );
    }
  }
});

test("水獭不卖家具——他只收不卖（决策 12），货架上出现家具就是打脸", () => {
  const otter = merchantDefinitions.find((m) => m.merchantId === "otter_trader");
  assert.ok(otter);
  for (const itemId of otter!.stock) {
    assert.ok(
      !findItemDefinition(itemId)?.placement,
      `水獭货架上出现了家具 ${itemId}——"他没货源"这个说法就塌了`,
    );
  }
});

test("失窃链的金额是同一个数进出——第一次全额追回，净损失恒零", () => {
  // 从规则数据里挖出 adjust_gold 的两笔，防止有人只改了一头
  const amounts = storyRules
    .flatMap((rule) => rule.effects)
    .filter((effect) => effect.kind === "adjust_gold")
    .map((effect) => (effect.kind === "adjust_gold" ? effect.amount : 0));
  assert.equal(amounts.length, 2, "失窃链该有恰好两笔金币变动（偷、还）");
  assert.equal(amounts[0] + amounts[1], 0, "偷和还不是同一个数——净损失不为零");
});

test("放弃追讨那条也解锁交易——那是唯一能把玩家锁死的路径", () => {
  const waive = storyRules.find((rule) => rule.id === "theft_waived");
  assert.ok(waive);
  assert.ok(
    waive!.effects.some(
      (effect) => effect.kind === "unlock_feature" && effect.featureId === "merchant_trading",
    ),
    "拒绝抓贼把销路一起拒掉了——卖货是主要收入，玩家会被锁死",
  );
});

test("剧情注册表整体过审（现在有真数据了，不再是空数组的假绿）", () => {
  assert.deepEqual(auditStoryContent(), []);
});

// ---- 居民（期 4 · 小动物经济圈）----

test("三条到来规则共享同一个抽签池——同一天最多来一位靠它", () => {
  const arrivals = storyRules.filter((rule) => rule.id.startsWith("resident_"));
  assert.equal(arrivals.length, 3);
  for (const rule of arrivals) {
    for (const trigger of rule.triggers) {
      assert.equal(
        trigger.poolId,
        "resident_arrival",
        `${rule.id} 没走 resident_arrival 池——三位会在同一天挤进门`,
      );
      // 现在纯随机（用户定），不该有门槛。以后加 requiresFeature 时删掉这两行
      assert.equal(trigger.requiresFeature, undefined, `${rule.id} 提前加了门槛`);
    }
  }
});

test("每条到来规则给的图纸指向一栋真实存在于物品注册表的房子", () => {
  const arrivals = storyRules.filter((rule) => rule.id.startsWith("resident_"));
  for (const rule of arrivals) {
    const gift = rule.effects.find((effect) => effect.kind === "give_item");
    assert.ok(gift, `${rule.id} 没送图纸`);
    const item = findItemDefinition(gift!.kind === "give_item" ? gift!.itemId : "");
    assert.ok(item?.blueprint, `${rule.id} 送的不是图纸`);
  }
});

test("居民的图纸没有价——邻居送的凭证能卖钱就是白得的钱", () => {
  for (const id of ["blueprint_slime_house", "blueprint_fox_house", "blueprint_spirit_house"]) {
    assert.equal(findItemDefinition(id)?.value, undefined, `${id} 不该有 value`);
  }
});
