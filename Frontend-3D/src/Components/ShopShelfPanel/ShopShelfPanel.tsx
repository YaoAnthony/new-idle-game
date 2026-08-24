import { findItemDefinition } from "core";
import { useEffect, useState } from "react";

import { on } from "../../Game/EventBus";
import {
  getInventory,
  isLoadedWare,
  placeInFirstFreeSlot,
  setStackAt,
} from "../../Game/State/inventory";
import {
  addToStorage,
  getStorage,
  setStorageSlot,
  type StorageSlot,
} from "../../Game/State/storage";
import {
  budgetToday,
  canShelve,
  shelfCapacityOf,
  shelfIdFor,
} from "../../Game/Systems/shopkeeping";
import { t } from "../../i18n/t";
import { useMirroredPanel } from "../PanelStack/useMirroredPanel";
import { ItemIcon, ItemTooltip, useTooltip } from "../Inventory/slots";

/**
 * 上架面板（期 5）：左边货架、右边背包，点一下就在两边搬。
 *
 * 形状照 `StoragePanel`（那也是"背包 ↔ 格子"的双向搬运，两边的踩坑记录
 * 直接适用），只多两处：
 *
 * 1. **每格标价**。这是货架和箱子唯一真正的区别——玩家摆货时要能一眼
 *    看出"摆哪件更划算"，否则"经营"就退化成"把东西倒进去"。
 * 2. **只收家具**（`canShelve`）。往货架上塞食材会让隔夜结算把菜卖掉，
 *    那是餐厅的事，不是这间店的。拒绝做成**格子压暗**而不是弹提示：
 *    一屏几十格，每点错一次弹一次会很吵。
 *
 * ## 摆在屋里的家具卖不掉
 *
 * 上架的是**背包里的**。屋里正在用的桌子要先收回背包才能上架——不然
 * 玩家会误把坐着的椅子卖掉，而且 `ownedCountFn`（开箱的"已经有了"判据）
 * 会跟着乱。这一条不用额外写代码：面板右页读的本来就是背包。
 */
export function ShopShelfPanel() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [slots, setSlots] = useState<StorageSlot[]>([]);
  const [backpack, setBackpack] = useState(getInventory());
  const { tooltip, show, hide } = useTooltip();

  const inventoryId = instanceId ? shelfIdFor(instanceId) : null;
  const capacity = instanceId ? shelfCapacityOf(instanceId) : 0;

  useEffect(() => {
    const offOpen = on("shelf_open_requested", ({ instanceId: id }) => {
      setInstanceId(id);
      setSlots(getStorage(shelfIdFor(id)));
      setBackpack(getInventory());
    });
    const offInventory = on("inventory_changed", () => setBackpack(getInventory()));
    return () => {
      offOpen();
      offInventory();
    };
  }, []);

  useEffect(() => {
    if (!inventoryId) return;
    const off = on("storage_changed", (event) => {
      if (event.inventoryId === inventoryId) setSlots(getStorage(inventoryId));
    });
    return off;
  }, [inventoryId]);

  useMirroredPanel("shopShelf", instanceId !== null, () => setInstanceId(null));

  if (!instanceId || !inventoryId) return null;

  /** 货架 → 背包。同 StoragePanel：走 placeInFirstFreeSlot，不重算保质期 */
  const takeBack = (index: number): void => {
    const slot = slots[index];
    if (!slot) return;
    const placed = placeInFirstFreeSlot({
      itemId: slot.itemId,
      count: slot.count,
      quality: slot.quality,
      expiresAtUtc: slot.expiresAtUtc,
    });
    if (placed) setStorageSlot(inventoryId, index, null);
  };

  /** 背包 → 货架 */
  const putUp = (index: number): void => {
    const stack = backpack[index];
    if (!stack || isLoadedWare(stack) || !canShelve(stack.itemId)) return;

    const leftover = addToStorage(
      inventoryId,
      stack.itemId,
      stack.count,
      stack.quality,
      stack.expiresAtUtc,
    );
    if (leftover === stack.count) return;
    setStackAt(index, leftover > 0 ? { ...stack, count: leftover } : null);
  };

  const priceOf = (itemId: string): number => findItemDefinition(itemId)?.value ?? 0;

  /** 摆着的这些明天最多能换多少（按单价 × 件数，不算客人预算） */
  const shelfWorth = slots
    .slice(0, capacity)
    .reduce((sum, slot) => sum + (slot ? priceOf(slot.itemId) * slot.count : 0), 0);

  return (
    <>
      <div className="ui-book absolute left-1/2 top-1/2 z-30 w-[min(940px,94vw)] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-1/2 top-[8%] -translate-x-1/2 text-[19px] font-bold tracking-[0.3em] text-[#f4e6c0] [text-shadow:0_2px_2px_rgb(0_0_0_/_0.75)]">
          {t("ui.shelf.title")}
        </div>
        <button
          type="button"
          className="ui-wood-btn absolute right-[7.5%] top-[10%] z-10 grid h-10 w-10 place-items-center text-[16px] font-bold"
          onClick={() => setInstanceId(null)}
        >
          ×
        </button>

        {/* 左页：货架。只画这一级的货位数 */}
        <div className="absolute left-[10%] top-[20%] h-[58%] w-[35%] overflow-y-auto">
          <div className="mb-1.5 text-center text-[11px] text-[#8a6a48]">
            {t("ui.shelf.shelf")} {slots.slice(0, capacity).filter(Boolean).length}/
            {capacity}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {slots.slice(0, capacity).map((slot, index) => (
              <button
                key={index}
                type="button"
                className="ui-slot relative grid h-[52px] w-[52px] place-items-center"
                onClick={() => takeBack(index)}
                onPointerEnter={(event) => {
                  if (slot) show(slot.itemId, event.currentTarget);
                }}
                onPointerLeave={hide}
              >
                {slot && (
                  <>
                    <ItemIcon itemId={slot.itemId} size={34} />
                    {slot.count > 1 && (
                      <span className="absolute bottom-0.5 right-1 text-[11px] font-bold text-[#3d2817]">
                        {slot.count}
                      </span>
                    )}
                    {/* 标价：货架和箱子唯一真正的区别 */}
                    <span className="absolute left-0.5 top-0.5 rounded bg-[#c9a227] px-1 text-[10px] font-bold text-[#3d2817]">
                      {priceOf(slot.itemId)}
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 右页：背包。不是家具的格子压暗 */}
        <div className="absolute left-[55%] top-[20%] h-[58%] w-[35%] overflow-y-auto">
          <div className="mb-1.5 text-center text-[11px] text-[#8a6a48]">
            {t("ui.backpack")}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {backpack.map((stack, index) => (
              <button
                key={index}
                type="button"
                disabled={
                  Boolean(stack) &&
                  (isLoadedWare(stack) || !canShelve(stack!.itemId))
                }
                className="ui-slot relative grid h-[46px] w-[46px] place-items-center disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => putUp(index)}
                onPointerEnter={(event) => {
                  if (stack) show(stack.itemId, event.currentTarget);
                }}
                onPointerLeave={hide}
              >
                {stack && (
                  <>
                    <ItemIcon itemId={stack.itemId} size={34} />
                    {stack.count > 1 && (
                      <span className="absolute bottom-0.5 right-1 text-[11px] font-bold text-[#3d2817]">
                        {stack.count}
                      </span>
                    )}
                  </>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="absolute bottom-[9%] left-1/2 -translate-x-1/2 text-center text-[11px] text-[#8a6a48]">
          <div>
            {t("ui.shelf.worth")} {shelfWorth} · {t("ui.shelf.budget")}{" "}
            {budgetToday()}
          </div>
          {/*
            * 两个数并排是有意的：贵过右边那个数的货**今天谁都买不起**，
            * 会一直挂在架上。实测时一张 60 的唱片挂了五天，光看标价
            * 看不出为什么——把客人的钱包也摆出来，玩家一眼就明白
            * "这件该留给水獭"。
            */}
          <div className="mt-0.5">{t("ui.shelf.hint")}</div>
        </div>
      </div>

      <ItemTooltip tooltip={tooltip} />
    </>
  );
}
