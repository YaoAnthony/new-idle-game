import {
  ItemCategory,
  ItemQuality,
  Rarity,
  type ContainerContents,
  findItemDefinition,
  isExpired,
  itemCategoryOrder,
  resolveExpiry,
  type InventoryStack,
  type ItemCounts,
} from "core";
import { emit } from "../EventBus";
import { t } from "../../i18n/t";
import { getClock } from "./clock";

/**
 * 槽位式背包（MC / 泰拉瑞亚式）：8 格快捷栏 + 24 格背包。
 * 物品可以在任意槽位间拖动：空位移入、同物合堆（受 stackLimit）、异物互换。
 *
 * 其他系统（制作/烹饪/送礼）仍通过 getCounts/removeItem 的聚合接口访问，
 * 不感知槽位——接存档时序列化为 PlayerSave.character.inventory。
 */

/**
 * 一格里的东西。`quality` 只有做出来的菜才有（起锅那一刻定下的），
 * **品质不同的同名菜不合堆**——否则一盘上乘的番茄炒蛋和一盘焦的合成一堆，
 * 送礼时"过火降一档"就无从判断了。
 */
export type SlotStack = {
  itemId: string;
  count: number;
  quality?: ItemQuality;
  /**
   * 保质期限，**已对齐到世界日的末尾**（见 Core 的 resolveExpiry）。
   * 对齐是为了合堆：存精确到秒的话，前后隔几分钟做的两盘同样的菜
   * 就永远合不到一起，背包会被碎片塞满。
   */
  expiresAtUtc?: string;
  /**
   * 容器内容（锅里装着什么、煮到几分）。
   *
   * **格子本身装得下容器**，所以端着的锅不需要离开快捷栏。
   * 原来这一块只存在于"手上"那个独立变量里，格子存不下，于是
   * 拿起锅就得把它从格子里删掉——这正是"东西一拿在手里就消失"的根因。
   *
   * 形状直接对上 Core 的 ItemStackState.container，存档不用另造结构。
   */
  container?: ContainerContents;
} | null;

/**
 * 稳定序列化：对象按键名排序后再展开，所以**字段的书写顺序不影响结果**。
 *
 * 直接 JSON.stringify 不行——它按插入顺序输出，两个内容相同但构造顺序
 * 不同的容器会得到不同的字符串，于是本该合堆的两份被判成不同。
 */
function stableKey(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableKey(v)}`);
  return `{${entries.join(",")}}`;
}

/**
 * 两堆东西能不能合并：**同一件物品、且实例状态完全一样**。
 *
 * 规则是通用的，不列举字段——**一件东西身上带的状态就是它的身份**。
 * 锅尤其明显：它其实是个状态机（空锅 / 装着 A 菜 / 装着 B 菜 / 煮到几分），
 * 每个状态都是不同的东西，凭什么合到一格里去？
 *
 * 这样写的好处是加字段零改动：以后给斧头加耐久、给装备加词条，
 * 磨损不同的两把斧头自动不合堆，不需要有人记得回来改这里。
 * 之前那版是手写一张"哪些字段要比"的清单——清单和数据结构迟早走散，
 * 而走散的后果是**静默吞数据**（两把磨损不同的斧头合成一把，还不报错）。
 * Core 的 ItemStackState 里 durability / customDataId 已经躺着了，
 * 哪天启用就会踩到。
 *
 * 反过来"同一天做的两盘同样的菜要能合堆"也仍然成立：保质期特意
 * 对齐到世界日末尾（见 SlotStack.expiresAtUtc），所以它们的状态真的相等。
 */
function sameKind(a: NonNullable<SlotStack>, b: NonNullable<SlotStack>): boolean {
  if (a.itemId !== b.itemId) return false;

  const { itemId: _ai, count: _ac, ...stateA } = a;
  const { itemId: _bi, count: _bc, ...stateB } = b;
  return stableKey(stateA) === stableKey(stateB);
}

export const HOTBAR_SIZE = 8;
export const BACKPACK_SIZE = 24;

export type SlotContainer = "hotbar" | "backpack";
export type SlotRef = { container: SlotContainer; index: number };

let hotbar: SlotStack[] = Array.from({ length: HOTBAR_SIZE }, () => null);
let backpack: SlotStack[] = Array.from({ length: BACKPACK_SIZE }, () => null);

/**
 * 选中的快捷栏格子 = **手上拿着的那一格**。
 *
 * 这是本作里"手上"的全部定义，没有另一个存放地。切换快捷栏只改这个
 * 下标，东西一步都不动——所以不会从格子里消失、不会被放回到别的格子、
 * 存档也不用多存一份。Minecraft / 泰拉瑞亚 / 星露谷都是这个模型。
 *
 * 放在这里而不是 Hotbar 组件的 useState 里：它是**游戏状态**，
 * 厨房交互、角色动画、手持物渲染都要读，不是某个组件的局部显示状态。
 */
let selectedHotbarIndex = 0;

function slots(container: SlotContainer): SlotStack[] {
  return container === "hotbar" ? hotbar : backpack;
}

// ---- 变更广播 ----

/**
 * 手上那一格现在长什么样。整份实例状态参与比较（和 sameKind 同一个路子），
 * 所以以后往 SlotStack 上加字段这里零改动。
 */
function heldSignature(): string {
  return stableKey(hotbar[selectedHotbarIndex] ?? null);
}

/** 上一次广播出去的样子 */
let lastHeld = "null";

/**
 * 手上那一格真的变了才广播。
 *
 * **"手上拿的就是选中那一格"是个派生事实，所以通知也必须是派生的。**
 * 原来 held_changed 靠各个函数自己记得发：selectHotbarSlot、setSelectedStack、
 * consumeSelectedOne 发了，removeItem / moveStack / sortBackpack /
 * restoreInventory / replaceCounts 全都没发。于是背包里最后一件家具摆下去
 * 之后，状态上手已经空了，手上那个模型和右下角那张卡还挂着——
 * 因为扣物品的是 removeItem，而它只喊了一声 inventory_changed。
 *
 * 谁改到了选中格由这里算，不由调用方记得。
 */
function syncHeld(): void {
  const signature = heldSignature();
  if (signature === lastHeld) return;

  lastHeld = signature;
  emit("held_changed", {});
}

/** 库存变了走这里，**不要直接 emit** ——直接 emit 就绕过了上面那条推导 */
function announce(reason: string): void {
  emit("inventory_changed", { reason });
  syncHeld();
}

export function getHotbar(): SlotStack[] {
  return hotbar.map((stack) => (stack ? { ...stack } : null));
}

export function getBackpack(): SlotStack[] {
  return backpack.map((stack) => (stack ? { ...stack } : null));
}

// ---- 选中格（= 手上） ----

export function getSelectedHotbarIndex(): number {
  return selectedHotbarIndex;
}

/** 换一格。**只改下标**，一件东西都不搬 */
export function selectHotbarSlot(index: number): void {
  if (index < 0 || index >= HOTBAR_SIZE) return;
  if (index === selectedHotbarIndex) return;

  selectedHotbarIndex = index;
  // 无条件发：快捷栏的选中高亮听的就是这一条，而两格恰好装着一模一样的
  // 东西时签名不变，靠推导就漏掉了。记账是为了下一次 announce 不重复发
  lastHeld = heldSignature();
  emit("held_changed", {});
}

export function getSelectedStack(): SlotStack {
  const stack = hotbar[selectedHotbarIndex];
  return stack ? { ...stack } : null;
}

/**
 * 放进第一个空位（快捷栏优先，和 addItem 一致）。
 * 读旧存档时补救用——那时候要连容器一起塞回去，addItem 带不了容器。
 */
export function placeInFirstFreeSlot(stack: NonNullable<SlotStack>): boolean {
  for (const list of [hotbar, backpack]) {
    for (let i = 0; i < list.length; i += 1) {
      if (list[i]) continue;
      list[i] = { ...stack };
      announce("restore");
      return true;
    }
  }
  return false;
}

/** 直接改写选中格。厨房交互用（把锅端起来、把锅放下） */
export function setSelectedStack(next: SlotStack): void {
  hotbar[selectedHotbarIndex] = next;
  announce("selected");
}

/**
 * 选中格扣掉一个。
 *
 * "手上这一份被用掉了"要走这条，不能直接把整格清空——
 * 手里拿着 5 个番茄下锅一个，另外 4 个不该跟着消失。
 */
export function consumeSelectedOne(): void {
  const stack = hotbar[selectedHotbarIndex];
  if (!stack) return;

  if (stack.count > 1) {
    hotbar[selectedHotbarIndex] = { ...stack, count: stack.count - 1 };
  } else {
    hotbar[selectedHotbarIndex] = null;
  }

  announce("consumed");
}

function stackLimit(itemId: string): number {
  return findItemDefinition(itemId)?.stackLimit ?? 99;
}

// ---- 聚合接口（制作/烹饪/送礼用，不感知槽位） ----

export function getCounts(): ItemCounts {
  const counts: ItemCounts = {};
  for (const stack of [...hotbar, ...backpack]) {
    if (!stack) continue;
    counts[stack.itemId] = (counts[stack.itemId] ?? 0) + stack.count;
  }
  return counts;
}

export function getCount(itemId: string): number {
  return getCounts()[itemId] ?? 0;
}

/** 合并进已有堆 → 快捷栏空位 → 背包空位（MC 习惯） */
export function addItem(
  itemId: string,
  quantity = 1,
  quality?: ItemQuality,
): void {
  const definition = findItemDefinition(itemId);
  if (!definition || quantity <= 0) return;

  let remaining = quantity;
  const limit = stackLimit(itemId);

  // 食物进背包时就把保质期算好。对齐到世界日末尾，所以同一天做的能合堆
  const expiresAtUtc = resolveExpiry(
    definition.food?.shelfLifeSeconds,
    getClock().worldDayId,
  );
  const incoming = { itemId, count: 0, quality, expiresAtUtc };

  for (const list of [hotbar, backpack]) {
    for (const stack of list) {
      if (remaining <= 0) break;
      if (!stack || !sameKind(stack, incoming)) continue;
      const take = Math.min(limit - stack.count, remaining);
      stack.count += take;
      remaining -= take;
    }
  }

  for (const list of [hotbar, backpack]) {
    for (let i = 0; i < list.length && remaining > 0; i += 1) {
      if (list[i]) continue;
      const take = Math.min(limit, remaining);
      list[i] = { itemId, count: take, quality, expiresAtUtc };
      remaining -= take;
    }
  }

  announce("add");
}

/**
 * 跨天时把过期食物降成"不新鲜"。
 *
 * **不删除**——和厨房那条"火候只影响品质，不会烧毁稀有材料"是同一条原则：
 * 让玩家攒的东西凭空消失会制造焦虑。过期只是变难吃（恢复量按品质缩放），
 * 小动物也会更不爱吃。
 */
export function spoilExpiredFood(worldDayId: string): number {
  let spoiled = 0;

  for (const list of [hotbar, backpack]) {
    for (const stack of list) {
      if (!stack || !isExpired(stack.expiresAtUtc, worldDayId)) continue;

      spoiled += stack.count;
      stack.quality = ItemQuality.Poor;
      // 清掉期限，避免每天重复触发
      stack.expiresAtUtc = undefined;
    }
  }

  if (spoiled > 0) announce("spoiled");
  return spoiled;
}

/**
 * 下一次 removeItem 会先吃掉哪一堆的品质。
 *
 * 必须和 removeItem 的遍历顺序一致（背包优先），否则会出现
 * "吃的是那盘焦的、算的却是这盘上乘的"。
 */
export function peekConsumeQuality(itemId: string): ItemQuality | undefined {
  for (const list of [backpack, hotbar]) {
    for (const stack of list) {
      if (stack?.itemId === itemId) return stack.quality;
    }
  }
  return undefined;
}

/** 从背包侧优先扣除（把快捷栏留给玩家的常用摆放） */
export function removeItem(itemId: string, quantity = 1): boolean {
  if (getCount(itemId) < quantity) return false;

  let remaining = quantity;
  for (const list of [backpack, hotbar]) {
    for (let i = 0; i < list.length && remaining > 0; i += 1) {
      const stack = list[i];
      if (!stack || stack.itemId !== itemId) continue;
      const take = Math.min(stack.count, remaining);
      stack.count -= take;
      remaining -= take;
      if (stack.count <= 0) list[i] = null;
    }
  }

  announce("remove");
  return true;
}

/**
 * 从**指定的那一格**扣除。送礼用这个而不是 removeItem——
 * 玩家拖进放入框的是某一格具体的东西，品质已经参与过判定了，
 * 按 itemId 去扣有可能扣掉另一格同名但品质不同的那一堆。
 */
export function removeFromSlot(ref: SlotRef, quantity = 1): boolean {
  const list = slots(ref.container);
  const stack = list[ref.index];
  if (!stack || stack.count < quantity) return false;

  stack.count -= quantity;
  if (stack.count <= 0) list[ref.index] = null;

  announce("remove");
  return true;
}

/** 批量替换（制作消耗+产出）。把差值落到槽位上 */
export function replaceCounts(next: ItemCounts): void {
  const current = getCounts();
  const touched = new Set([...Object.keys(current), ...Object.keys(next)]);

  for (const itemId of touched) {
    const delta = (next[itemId] ?? 0) - (current[itemId] ?? 0);
    if (delta > 0) addItemSilent(itemId, delta);
    else if (delta < 0) removeItemSilent(itemId, -delta);
  }

  announce("replace");
}

function addItemSilent(itemId: string, quantity: number): void {
  const limit = stackLimit(itemId);
  let remaining = quantity;

  for (const list of [hotbar, backpack]) {
    for (const stack of list) {
      if (remaining <= 0) return;
      if (!stack || stack.itemId !== itemId) continue;
      const take = Math.min(limit - stack.count, remaining);
      stack.count += take;
      remaining -= take;
    }
  }
  for (const list of [hotbar, backpack]) {
    for (let i = 0; i < list.length && remaining > 0; i += 1) {
      if (list[i]) continue;
      const take = Math.min(limit, remaining);
      list[i] = { itemId, count: take };
      remaining -= take;
    }
  }
}

function removeItemSilent(itemId: string, quantity: number): void {
  let remaining = quantity;
  for (const list of [backpack, hotbar]) {
    for (let i = 0; i < list.length && remaining > 0; i += 1) {
      const stack = list[i];
      if (!stack || stack.itemId !== itemId) continue;
      const take = Math.min(stack.count, remaining);
      stack.count -= take;
      remaining -= take;
      if (stack.count <= 0) list[i] = null;
    }
  }
}

// ---- 拖拽移动（背包 UI 用） ----

export function getStackAt(ref: SlotRef): SlotStack {
  const stack = slots(ref.container)[ref.index];
  return stack ? { ...stack } : null;
}

/** 拖拽落点逻辑：空位移入 / 同物合堆（溢出留在原格） / 异物互换 */
export function moveStack(from: SlotRef, to: SlotRef): void {
  if (from.container === to.container && from.index === to.index) return;

  const fromList = slots(from.container);
  const toList = slots(to.container);
  const source = fromList[from.index];
  if (!source) return;

  const target = toList[to.index];

  if (!target) {
    toList[to.index] = source;
    fromList[from.index] = null;
  } else if (sameKind(target, source)) {
    const limit = stackLimit(source.itemId);
    const take = Math.min(limit - target.count, source.count);
    target.count += take;
    source.count -= take;
    if (source.count <= 0) fromList[from.index] = null;
  } else {
    toList[to.index] = source;
    fromList[from.index] = target;
  }

  announce("move");
}

// ---- 存档 ----
//
// 槽位位置必须保留（玩家把常用的东西摆在固定格子里，读档后乱掉很出戏），
// 所以 stackId 编码成 "hotbar:3" / "backpack:12"，而不是丢进一个无序数组。

const SLOT_ID = (container: SlotContainer, index: number): string =>
  `${container}:${index}`;

export function snapshotInventory(): InventoryStack[] {
  const stacks: InventoryStack[] = [];

  for (const container of ["hotbar", "backpack"] as const) {
    slots(container).forEach((stack, index) => {
      if (!stack) return;
      stacks.push({
        stackId: SLOT_ID(container, index),
        itemId: stack.itemId,
        quantity: stack.count,
        state:
          stack.quality || stack.expiresAtUtc || stack.container
            ? {
                quality: stack.quality,
                expiresAtUtc: stack.expiresAtUtc,
                // 锅里煮着的东西跟着格子一起进存档
                container: stack.container,
              }
            : undefined,
      });
    });
  }

  return stacks;
}

export function restoreInventory(stacks: InventoryStack[]): void {
  hotbar = Array.from({ length: HOTBAR_SIZE }, () => null);
  backpack = Array.from({ length: BACKPACK_SIZE }, () => null);

  for (const stack of stacks) {
    const [container, rawIndex] = stack.stackId.split(":");
    const index = Number(rawIndex);
    const list = container === "hotbar" ? hotbar : backpack;

    // 越界或残缺的槽位直接丢弃，不让一条坏记录带崩整份存档
    if (!Number.isInteger(index) || index < 0 || index >= list.length) continue;
    if (!findItemDefinition(stack.itemId)) continue;

    list[index] = {
      itemId: stack.itemId,
      count: stack.quantity,
      quality: stack.state?.quality,
      expiresAtUtc: stack.state?.expiresAtUtc,
      container: stack.state?.container,
    };
  }

  announce("restore");
}

// ---- 整理 ----

/**
 * 把背包收拾一遍：同类合堆 → 按分类/稀有度/名字排 → 一路顶到最前面。
 *
 * **只动背包，不碰快捷栏**：快捷栏是玩家自己摆的顺序（几号键放什么
 * 是肌肉记忆），替他重排等于把手感洗掉。这也是这类游戏的通行做法。
 *
 * 合堆放在排序前面：不先合的话，两堆各 3 个的木头会被当成两格排出来，
 * "整理完还是散的"就成了 bug 观感。合堆只合 sameKind（同物同品质同保质期），
 * 混堆会把"一盘上乘的菜和一盘焦的"搅在一起，那是数据损坏不是整理。
 */
export function sortBackpack(): void {
  const stacks = backpack.filter(
    (stack): stack is NonNullable<SlotStack> => stack !== null,
  );

  // 1. 合堆
  const merged: Array<NonNullable<SlotStack>> = [];
  for (const stack of stacks) {
    const limit = stackLimit(stack.itemId);
    let remaining = stack.count;

    for (const target of merged) {
      if (remaining <= 0) break;
      if (!sameKind(target, stack)) continue;
      const take = Math.min(limit - target.count, remaining);
      target.count += take;
      remaining -= take;
    }

    // 超过一堆上限的部分自己另起一堆，别把 count 撑破 stackLimit
    while (remaining > 0) {
      const take = Math.min(limit, remaining);
      merged.push({ ...stack, count: take });
      remaining -= take;
    }
  }

  // 2. 排序
  merged.sort(compareForSort);

  // 3. 顶到最前面，后面补空
  for (let i = 0; i < backpack.length; i += 1) {
    backpack[i] = merged[i] ?? null;
  }

  announce("sort");
}

/**
 * 排序依据：分类 → 稀有度（稀的在前）→ 名字。
 *
 * 分类顺序取 Core 的 `itemCategoryOrder`，和背包页签是同一份，
 * 整理完的结果才和页签从左到右对得上。
 * 名字按**本地化之后**的字面比，中文走拼音——按 itemId 排的话
 * 玩家看到的是一串没规律的顺序。
 */
function compareForSort(
  a: NonNullable<SlotStack>,
  b: NonNullable<SlotStack>,
): number {
  const da = findItemDefinition(a.itemId);
  const db = findItemDefinition(b.itemId);

  const categoryDelta = categoryRank(da?.category) - categoryRank(db?.category);
  if (categoryDelta !== 0) return categoryDelta;

  const rarityDelta = rarityRank(db?.rarity) - rarityRank(da?.rarity);
  if (rarityDelta !== 0) return rarityDelta;

  const nameDelta = t(da?.localizationKey ?? a.itemId).localeCompare(
    t(db?.localizationKey ?? b.itemId),
    "zh-Hans-CN",
  );
  if (nameDelta !== 0) return nameDelta;

  // 兜底：同名不同品质的菜也要有稳定顺序，不然每次整理位置都在跳
  return a.itemId.localeCompare(b.itemId);
}

/** 查不到分类的排最后，不要插在中间打乱分组 */
function categoryRank(category: ItemCategory | undefined): number {
  const index = category
    ? (itemCategoryOrder as readonly ItemCategory[]).indexOf(category)
    : -1;
  return index < 0 ? itemCategoryOrder.length : index;
}

function rarityRank(rarity: Rarity | undefined): number {
  return rarity ? RARITY_ORDER.indexOf(rarity) : -1;
}

const RARITY_ORDER: Rarity[] = [
  Rarity.Common,
  Rarity.Uncommon,
  Rarity.Rare,
  Rarity.Epic,
  Rarity.Legendary,
  Rarity.Mythic,
];

/** 搬进新家时的行李。家具放快捷栏（马上要用），材料进背包 */
export function seedInitialInventory(): void {
  const empty = [...hotbar, ...backpack].every((stack) => stack === null);
  if (!empty) return;

  /**
   * 2026-07-30 定稿：**背包开局是空的**，行李全在门口那两个纸箱里。
   *
   * 以前直接把工作台、炒锅、地铺塞满快捷栏——那等于替玩家把箱子拆了，
   * 开局第一眼就是一排看不懂的图标。现在东西得自己拆出来，
   * 「打开箱子拿到工具」这一下才有分量（见 Core 的 Data/loot）。
   *
   * 只留地铺和一点食材：地铺是第一天必须能睡觉的兜底（不在箱子里，
   * 是背着来的），食材是为了第一天能做饭见苔苔。
   */
  hotbar[0] = { itemId: "bedroll", count: 1 };

  const materials: Array<[string, number]> = [
    ["tomato", 2],
    ["egg", 2],
    ["rice", 2],
  ];
  materials.forEach(([itemId, count], index) => {
    backpack[index] = { itemId, count };
  });

  announce("seed");
}

