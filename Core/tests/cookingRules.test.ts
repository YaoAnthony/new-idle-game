import assert from "node:assert/strict";
import { test } from "node:test";

import { HeatBand, type ContainerContents } from "../src/types/cooking.js";
import { FurnitureCapability, type FurnitureSlot } from "../src/types/furniture.js";
import { ItemQuality } from "../src/types/inventory.js";
import {
  KitchenRejectReason,
  addToContainer,
  combineQuality,
  containerHasRoom,
  containerHoldsDish,
  containerLoad,
  emptyContainer,
  getItemTags,
  heatBandOf,
  heatRatio,
  heatRingFill,
  matchCookingRecipe,
  qualityForBand,
  resolveCookingTarget,
  resolveKitchenInteraction,
  shouldKeepHeating,
  slotAcceptsItem,
  slotHeatsCookware,
  type HeldStack,
  type KitchenTarget,
} from "../src/logic/cookingRules.js";
import { heatTuning, mysteryDish } from "../src/Data/cooking/index.js";

/**
 * 厨房规则。**这一份用真注册表**（和别的 logic 用例相反）——因为这些函数
 * 本身就在查 `findItemDefinition`，喂假数据等于把被测对象换掉了。
 *
 * 三条产品判断最该被用例钉住：
 * 1. 投料时**不判断搭配对不对**（配不上就是一锅乱炖）——拦在投料等于
 *    要求玩家先学会配方才敢下锅；
 * 2. 半成品（煎蛋）**不会烧焦**，停在刚熟的位置等你加番茄；
 * 3. 还没熟时按 F **什么都不消耗**，不做"功亏一篑"的判定。
 */

const burner: FurnitureSlot = {
  slotId: "burner",
  localizationKey: "slot.burner",
  acceptedTags: ["cookware"],
  offset: [0, 1.03, 0],
};

function contents(
  items: Array<[string, number] | [string, number, ItemQuality]>,
  heatSeconds = 0,
): ContainerContents {
  return {
    items: items.map(([itemId, quantity, quality]) => ({
      itemId,
      quantity,
      quality: quality as ItemQuality | undefined,
    })),
    heatSeconds,
  };
}

// ---- 标签与槽位 ----

test("cookware / servingware 标签从能力块推导，不用每口锅手写", () => {
  assert.ok(getItemTags("wok").includes("cookware"));
  assert.ok(getItemTags("plate").includes("servingware"));
  assert.deepEqual(getItemTags("egg"), ["egg"]);
  assert.deepEqual(getItemTags("根本没有这件东西"), []);
});

test("槽位按 acceptedTags 收东西；两个 accepted* 都不填 = 什么都收", () => {
  assert.equal(slotAcceptsItem(burner, "wok"), true);
  assert.equal(slotAcceptsItem(burner, "egg"), false);

  const anySlot: FurnitureSlot = { slotId: "any", localizationKey: "x", offset: [0, 0, 0] };
  assert.equal(slotAcceptsItem(anySlot, "egg"), true);

  const idSlot: FurnitureSlot = { ...anySlot, acceptedItemIds: ["wok"] };
  assert.equal(slotAcceptsItem(idSlot, "wok"), true);
  assert.equal(slotAcceptsItem(idSlot, "tall_pot"), false);
});

// ---- 配方匹配 ----

test("必须完全吻合才算匹配到配方", () => {
  assert.equal(matchCookingRecipe("wok", [{ itemId: "egg", quantity: 1 }])?.id, "fried_egg");
  // 多一样就不是煎蛋了
  assert.equal(
    matchCookingRecipe("wok", [
      { itemId: "egg", quantity: 1 },
      { itemId: "tomato", quantity: 1 },
    ])?.id,
    "fried_tomato_egg",
  );
  // 数量不对也不算
  assert.equal(matchCookingRecipe("wok", [{ itemId: "egg", quantity: 2 }]), undefined);
  assert.equal(matchCookingRecipe("wok", []), undefined);
});

test("配方绑厨具，也绑厨具支持的加工方式", () => {
  // 米饭是 tall_pot 煮的，扔进炒锅匹配不上
  assert.equal(matchCookingRecipe("wok", [{ itemId: "rice", quantity: 1 }]), undefined);
  assert.equal(
    matchCookingRecipe("tall_pot", [{ itemId: "rice", quantity: 1 }])?.id,
    "cooked_rice",
  );
  // 不是厨具的东西不能匹配任何配方
  assert.equal(matchCookingRecipe("plate", [{ itemId: "egg", quantity: 1 }]), undefined);
});

test("锅里永远有个结果：配不上就是一锅乱炖", () => {
  const target = resolveCookingTarget("wok", contents([["egg", 1], ["rice", 3]]));

  assert.equal(target?.output, mysteryDish.itemId);
  assert.equal(target?.recipeId, undefined);
  assert.equal(target?.durationSeconds, mysteryDish.durationSeconds);
});

test("空锅没有在做的东西", () => {
  assert.equal(resolveCookingTarget("wok", emptyContainer()), null);
});

test("锅里已经是做好的菜 → 停火等装盘，不会自己烧成乱炖", () => {
  // 少了这一条，做好一盘番茄炒蛋转身去干别的，回来锅里是一坨乱炖
  assert.equal(resolveCookingTarget("wok", contents([["fried_tomato_egg", 1]])), null);
});

test("配方是每次按内容重算的：中途加番茄，目标当场从煎蛋变成番茄炒蛋", () => {
  const before = resolveCookingTarget("wok", contents([["egg", 1]]));
  assert.equal(before?.recipeId, "fried_egg");

  const after = resolveCookingTarget("wok", contents([["egg", 1], ["tomato", 1]]));
  assert.equal(after?.recipeId, "fried_tomato_egg");
  assert.notEqual(after?.durationSeconds, before?.durationSeconds);
});

// ---- 火候 ----

const tomatoEgg = resolveCookingTarget("wok", contents([["egg", 1], ["tomato", 1]]))!;
const friedEgg = resolveCookingTarget("wok", contents([["egg", 1]]))!;

test("火候比例 = 已加热 / 这道菜需要多久", () => {
  assert.equal(heatRatio(contents([["egg", 1], ["tomato", 1]], 6), tomatoEgg), 0.5);
  assert.equal(heatRatio(contents([["egg", 1], ["tomato", 1]], 12), tomatoEgg), 1);
});

test("四色分档，黄色窗口刻意宽容（不做功亏一篑的判定）", () => {
  assert.equal(heatBandOf(0), HeatBand.Raw);
  assert.equal(heatBandOf(heatTuning.undercookedAt), HeatBand.Undercooked);
  assert.equal(heatBandOf(heatTuning.perfectAt), HeatBand.Perfect);
  assert.equal(heatBandOf(heatTuning.overcookedAt - 0.01), HeatBand.Perfect);
  assert.equal(heatBandOf(heatTuning.overcookedAt), HeatBand.Overcooked);
  // 黄色窗口至少 40%
  assert.ok(heatTuning.overcookedAt - heatTuning.perfectAt >= 0.4);
});

test("会焦的菜封顶在 ringFullAt，不会焦的封顶在刚熟", () => {
  // 不封顶的话，鸡蛋放十分钟后加个番茄，比例会一下变成 50
  const longHeat = contents([["egg", 1], ["tomato", 1]], 10_000);
  assert.ok(Math.abs(heatRatio(longHeat, tomatoEgg) - heatTuning.ringFullAt) < 1e-9);

  const eggForever = contents([["egg", 1]], 10_000);
  assert.equal(heatRatio(eggForever, friedEgg), heatTuning.perfectAt);
  assert.equal(friedEgg.overcookable, false);
});

test("到顶就停止加热，heatSeconds 不会无限涨", () => {
  assert.equal(shouldKeepHeating(contents([["egg", 1]], 1), friedEgg), true);
  // 煎蛋走完就停住等你加番茄，而不是自己烧糊
  assert.equal(shouldKeepHeating(contents([["egg", 1]], 8), friedEgg), false);
  assert.equal(shouldKeepHeating(contents([["egg", 1], ["tomato", 1]], 12), tomatoEgg), true);
});

test("进度环把红色段也画得出来，且封顶在 1", () => {
  assert.equal(heatRingFill(0), 0);
  assert.ok(heatRingFill(1) < 1, "刚熟时环还没画满，红色段才有地方画");
  assert.equal(heatRingFill(heatTuning.ringFullAt), 1);
  assert.equal(heatRingFill(99), 1);
});

test("起锅那一刻的颜色定品质：黄=上乘，红=焦了但还能吃，绿白=还不能起", () => {
  assert.equal(qualityForBand(HeatBand.Perfect), ItemQuality.Excellent);
  assert.equal(qualityForBand(HeatBand.Overcooked), ItemQuality.Poor);
  assert.equal(qualityForBand(HeatBand.Raw), undefined);
  assert.equal(qualityForBand(HeatBand.Undercooked), undefined);
});

test("材料里最差的那样决定上限", () => {
  // 用过火的煎鸡蛋做不出上乘的番茄炒蛋
  assert.equal(
    combineQuality(ItemQuality.Excellent, [
      { itemId: "fried_egg", quantity: 1, quality: ItemQuality.Poor },
    ]),
    ItemQuality.Poor,
  );
  // 没标品质的材料不参与拉低
  assert.equal(
    combineQuality(ItemQuality.Excellent, [{ itemId: "tomato", quantity: 1 }]),
    ItemQuality.Excellent,
  );
});

// ---- 容器 ----

test("投料不清零加热秒数——玩家感受到的是这锅一直在烧", () => {
  const before = contents([["egg", 1]], 5);
  const after = addToContainer("wok", before, "tomato");

  assert.equal(after.heatSeconds, 5);
  assert.equal(after.recipeId, "fried_tomato_egg");
  assert.equal(before.items.length, 1, "入参不能被改");
});

test("同物同质合堆，不同品质分开记", () => {
  const once = addToContainer("wok", emptyContainer(), "egg");
  const twice = addToContainer("wok", once, "egg");
  assert.deepEqual(twice.items, [{ itemId: "egg", quantity: 2, quality: undefined }]);

  const mixed = addToContainer("wok", once, "egg", ItemQuality.Poor);
  assert.equal(mixed.items.length, 2);
});

test("容量按 cookware / servingWare 的 capacity 判", () => {
  assert.equal(containerLoad(contents([["egg", 2], ["tomato", 1]])), 3);
  assert.equal(containerHasRoom("wok", contents([["egg", 2]])), true);
  assert.equal(containerHasRoom("wok", contents([["egg", 3]])), false);
  assert.equal(containerHasRoom("plate", contents([["fried_egg", 2]])), false);
  // 不是容器的东西一格都装不下
  assert.equal(containerHasRoom("egg", emptyContainer()), false);
});

test("containerHoldsDish：全是成品才算装着菜", () => {
  assert.equal(containerHoldsDish(contents([["fried_egg", 1]])), true);
  assert.equal(containerHoldsDish(contents([["egg", 1]])), false);
  assert.equal(containerHoldsDish(contents([["fried_egg", 1], ["egg", 1]])), false);
  assert.equal(containerHoldsDish(emptyContainer()), false);
});

// ---- 交互解析 ----

function target(content: HeldStack | null): KitchenTarget {
  return { slot: burner, content, capabilities: [FurnitureCapability.Cooking] };
}

const wokOnBurner = (c: ContainerContents): HeldStack => ({ itemId: "wok", container: c });

test("空手对空槽位 → 没有可做的操作", () => {
  assert.deepEqual(resolveKitchenInteraction(null, target(null)), {
    kind: "reject",
    reason: KitchenRejectReason.Nothing,
  });
});

test("手持锅对空槽位 → 放下；槽位不收的东西 → slot_refuses", () => {
  assert.deepEqual(resolveKitchenInteraction({ itemId: "wok" }, target(null)), {
    kind: "place_in_slot",
  });
  assert.deepEqual(resolveKitchenInteraction({ itemId: "egg" }, target(null)), {
    kind: "reject",
    reason: KitchenRejectReason.SlotRefuses,
  });
});

test("手持食材对着锅 → 投入，且不判断搭配对不对", () => {
  const onBurner = target(wokOnBurner(emptyContainer()));

  assert.deepEqual(resolveKitchenInteraction({ itemId: "egg" }, onBurner), {
    kind: "add_ingredient",
  });
  // 米和炒锅配不出任何菜，照样让投——出来是一锅乱炖，这正是设计
  assert.deepEqual(resolveKitchenInteraction({ itemId: "rice" }, onBurner), {
    kind: "add_ingredient",
  });
});

test("锅里只收食材：铅笔和铁块不该能炖", () => {
  const onBurner = target(wokOnBurner(emptyContainer()));

  assert.deepEqual(resolveKitchenInteraction({ itemId: "pencil" }, onBurner), {
    kind: "reject",
    reason: KitchenRejectReason.NotAnIngredient,
  });
  // 端着另一口锅也不能倒进去
  assert.deepEqual(
    resolveKitchenInteraction({ itemId: "tall_pot", container: emptyContainer() }, onBurner),
    { kind: "reject", reason: KitchenRejectReason.NotAnIngredient },
  );
});

test("锅满了 → container_full", () => {
  const full = target(wokOnBurner(contents([["egg", 3]])));
  assert.deepEqual(resolveKitchenInteraction({ itemId: "tomato" }, full), {
    kind: "reject",
    reason: KitchenRejectReason.ContainerFull,
  });
});

test("空手 + 熟了 → 起锅，品质由那一刻的颜色定", () => {
  const ready = target(wokOnBurner(contents([["egg", 1], ["tomato", 1]], 12)));
  const action = resolveKitchenInteraction(null, ready);

  assert.equal(action.kind, "take_out_dish");
  assert.equal((action as { output: string }).output, "fried_tomato_egg");
  assert.equal((action as { quality: ItemQuality }).quality, ItemQuality.Excellent);
});

test("空手 + 还没熟 → 只提示，什么都不消耗", () => {
  const raw = target(wokOnBurner(contents([["egg", 1], ["tomato", 1]], 2)));
  assert.deepEqual(resolveKitchenInteraction(null, raw), {
    kind: "reject",
    reason: KitchenRejectReason.NotReady,
  });
});

test("空手 + 锅是空的 → 连锅端起来", () => {
  assert.deepEqual(resolveKitchenInteraction(null, target(wokOnBurner(emptyContainer()))), {
    kind: "pick_up_from_slot",
  });
});

test("端着盘子对熟锅 → 直接接菜（不必先空手起一次锅）", () => {
  const ready = target(wokOnBurner(contents([["egg", 1], ["tomato", 1]], 12)));
  const action = resolveKitchenInteraction({ itemId: "plate" }, ready);

  assert.equal(action.kind, "serve_onto_plate");
  assert.deepEqual((action as { items: Array<{ itemId: string }> }).items.map((i) => i.itemId), [
    "fried_tomato_egg",
  ]);
});

test("端着盘子对没熟的锅 → 说再等等，而不是这个不能下锅", () => {
  const raw = target(wokOnBurner(contents([["egg", 1]], 1)));
  assert.deepEqual(resolveKitchenInteraction({ itemId: "plate" }, raw), {
    kind: "reject",
    reason: KitchenRejectReason.NotReady,
  });
});

test("盘子满了 → container_full", () => {
  const ready = target(wokOnBurner(contents([["egg", 1], ["tomato", 1]], 12)));
  const fullPlate: HeldStack = { itemId: "plate", container: contents([["fried_egg", 2]]) };

  assert.deepEqual(resolveKitchenInteraction(fullPlate, ready), {
    kind: "reject",
    reason: KitchenRejectReason.ContainerFull,
  });
});

test("锅端到普通台面就停火：进度暂停是玩家的控制权，不是惩罚", () => {
  assert.equal(slotHeatsCookware([FurnitureCapability.Cooking], "wok"), true);
  assert.equal(slotHeatsCookware([FurnitureCapability.Crafting], "wok"), false);
  // 不需要火的容器放哪都能用
  assert.equal(slotHeatsCookware([], "plate"), true);
});
