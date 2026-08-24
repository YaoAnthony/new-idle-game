import { findItemDefinition, isPlaceable } from "core";

/**
 * 手上拿着什么，就自动进什么**预瞄**——选中即预瞄，不用再按一次 F。
 *
 * ## 为什么要有这一层
 *
 * 「拿着家具出虚影」早就是自动的（`held_changed` → 布置模式），而
 * 「拿着图纸选址」当初是挂在 F 上的，于是同样是快捷栏里的一格，
 * 3 号格的家具一选中就有虚影、4 号格的图纸选中却什么都没有，还得再
 * 按一下键才开工。**同一个动作（换一格）在玩家眼里必须有同一种结果。**
 *
 * 所以这里不是"给图纸补一个自动开"，而是把那条推导补全：手持模式由
 * 物品的**能力块**统一推导，一件物品最多进一种。
 *
 * ## 判据是能力块，不是物品 id
 *
 * Core 的物品定义里 `placement` / `blueprint` / `golemPart` / `seed` 是
 * 同一个路数的能力块（见 `types/items.ts` 的注释）。这里认的就是它们——
 * 加一件新图纸、新家具，这个文件一行不用改。**任何时候在这里看到
 * `blueprint_gold_jar` 这种字面量，都说明写错了。**
 *
 * ## 顺序即优先级
 *
 * 今天两种能力块互斥（图纸不是家具），列表顺序还看不出作用；但能力块
 * 本来就不排他（一块蛋糕可以既能吃又能摆），所以先把"最多进一种、谁
 * 优先"写死在这一个函数里，而不是等哪天两个虚影同时冒出来再来查。
 *
 * 以后要加第三种预瞄（比如种子预瞄播种格），是往下面加一个分支 +
 * 在 union 里加一个 kind，不是再去交互层写一条 if。
 */
export type HeldPreview =
  | { kind: "furniture"; itemId: string }
  | { kind: "building"; buildingId: string };

export function heldPreviewOf(itemId: string | null | undefined): HeldPreview | null {
  if (!itemId) return null;

  const definition = findItemDefinition(itemId);
  if (!definition) return null;

  // 图纸 → 建筑选址（虚影跟鼠标 → 点一下选定 → 确认才动工）
  if (definition.blueprint) {
    return { kind: "building", buildingId: definition.blueprint.buildingId };
  }

  // 家具 → 布置虚影（吸附网格，点一下就落地）
  if (isPlaceable(definition)) {
    return { kind: "furniture", itemId: definition.id };
  }

  return null;
}
