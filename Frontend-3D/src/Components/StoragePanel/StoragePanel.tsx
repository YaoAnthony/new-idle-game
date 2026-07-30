import { findFurnitureDefinition } from "core";
import { useEffect, useState } from "react";
import { emit, on } from "../../Game/EventBus";
import { addItem, getBackpack, removeItem } from "../../Game/State/inventory";
import {
  STORAGE_SIZE,
  addToStorage,
  getStorage,
  setStorageSlot,
  storageIdFor,
  type StorageSlot,
} from "../../Game/State/storage";
import { t } from "../../i18n/t";
import { ItemIcon, ItemTooltip, useTooltip } from "../Inventory/slots";

/**
 * 储物面板：左边箱子、右边背包，点一下就在两边搬。
 *
 * 没做拖拽——背包那套拖拽是按 `data-slot` 找落点的，跨两个不同的容器
 * 要重写一遍落点解析。点击搬运在这个场景里其实更快（不用瞄准），
 * 真要拖拽再说。
 */

type OpenStorage = {
  instanceId: string;
  furnitureId: string;
};

export function StoragePanel() {
  const [target, setTarget] = useState<OpenStorage | null>(null);
  const [slots, setSlots] = useState<StorageSlot[]>([]);
  const [backpack, setBackpack] = useState(getBackpack());
  const { tooltip, show, hide } = useTooltip();

  const inventoryId = target ? storageIdFor(target.instanceId) : null;

  const refresh = (id: string | null): void => {
    setSlots(id ? getStorage(id) : []);
    setBackpack(getBackpack());
  };

  useEffect(() => {
    const offOpen = on("storage_open_requested", (request) => {
      setTarget(request);
      refresh(storageIdFor(request.instanceId));
    });

    const offInventory = on("inventory_changed", () =>
      setBackpack(getBackpack()),
    );

    // 走远了自动关掉，和工作台一致
    const offLeave = on("interact_target_changed", (next) => {
      const stillNear = next?.kind === "station" ? next.instanceId : null;
      setTarget((current) =>
        current && stillNear !== current.instanceId ? null : current,
      );
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTarget(null);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      offOpen();
      offInventory();
      offLeave();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // 箱子内容变化后重新拉一次（监听器里不做副作用，见 Backpack 的同类注释）
  useEffect(() => {
    if (!inventoryId) return;
    const off = on("storage_changed", (event) => {
      if (event.inventoryId === inventoryId) setSlots(getStorage(inventoryId));
    });
    return off;
  }, [inventoryId]);

  useEffect(() => {
    emit("blocking_panel_changed", { open: target !== null });
  }, [target]);

  if (!target || !inventoryId) return null;

  const furnitureName =
    findFurnitureDefinition(target.furnitureId)?.localizationKey ??
    "furniture.storage_chest";

  /** 箱子 → 背包 */
  const takeOut = (index: number): void => {
    const slot = slots[index];
    if (!slot) return;

    addItem(slot.itemId, slot.count, slot.quality);
    setStorageSlot(inventoryId, index, null);
  };

  /** 背包 → 箱子 */
  const putIn = (itemId: string, count: number): void => {
    const leftover = addToStorage(inventoryId, itemId, count);
    const moved = count - leftover;
    if (moved > 0) removeItem(itemId, moved);
  };

  return (
    <>
      <div className="ui-book absolute left-1/2 top-1/2 z-30 w-[min(940px,94vw)] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-1/2 top-[8%] -translate-x-1/2 text-[19px] font-bold tracking-[0.3em] text-[#f4e6c0] [text-shadow:0_2px_2px_rgb(0_0_0_/_0.75)]">
          {t(furnitureName)}
        </div>
        <button
          type="button"
          className="absolute right-[7.5%] top-[10%] z-10 grid h-10 w-10 place-items-center rounded-md border-2 border-[#4a2c1a] bg-[#c0392b] text-[16px] font-bold text-white hover:brightness-110"
          onClick={() => setTarget(null)}
        >
          ×
        </button>

        {/* 左页：箱子 */}
        <div className="absolute left-[10%] top-[20%] h-[58%] w-[35%] overflow-y-auto">
          <div className="mb-1.5 text-center text-[11px] text-[#8a6a48]">
            {t("ui.storage.chest")}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {slots.slice(0, STORAGE_SIZE).map((slot, index) => (
              <button
                key={index}
                type="button"
                className="ui-slot relative grid h-[46px] w-[46px] place-items-center"
                onClick={() => takeOut(index)}
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
                  </>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 右页：背包 */}
        <div className="absolute left-[55%] top-[20%] h-[58%] w-[35%] overflow-y-auto">
          <div className="mb-1.5 text-center text-[11px] text-[#8a6a48]">
            {t("ui.backpack")}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {backpack.map((stack, index) => (
              <button
                key={index}
                type="button"
                className="ui-slot relative grid h-[46px] w-[46px] place-items-center"
                onClick={() => {
                  if (stack) putIn(stack.itemId, stack.count);
                }}
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

        <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 text-[11px] text-[#8a6a48]">
          {t("ui.storage.hint")}
        </div>
      </div>

      <ItemTooltip tooltip={tooltip} />
    </>
  );
}
