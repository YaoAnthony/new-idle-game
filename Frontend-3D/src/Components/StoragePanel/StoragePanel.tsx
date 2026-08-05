import { findPlaceableItem } from "core";
import { useEffect, useState } from "react";
import { emit, on } from "../../Game/EventBus";
import {
  getBackpack,
  isLoadedWare,
  placeInFirstFreeSlot,
  setStackAt,
} from "../../Game/State/inventory";
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
    findPlaceableItem(target.furnitureId)?.localizationKey ??
    "item.furniture_storage_chest";

  /**
   * 箱子 → 背包。
   *
   * 走 `placeInFirstFreeSlot` 而不是 `addItem`：后者会拿今天的世界日
   * **重算保质期**，等于把一盘快馊的菜放进箱子再拿出来就变新鲜了。
   * 箱子不是冰箱，存进去多久出来还是多久。
   */
  const takeOut = (index: number): void => {
    const slot = slots[index];
    if (!slot) return;

    const placed = placeInFirstFreeSlot({
      itemId: slot.itemId,
      count: slot.count,
      quality: slot.quality,
      expiresAtUtc: slot.expiresAtUtc,
    });
    // 背包满了就留在箱子里。先清槽再发现放不下的话东西就没了
    if (placed) setStorageSlot(inventoryId, index, null);
  };

  /**
   * 背包 → 箱子。
   *
   * **按格子搬，不按 itemId 搬**。原来是 `removeItem(itemId, moved)`，
   * 而 removeItem 会跳过装着东西的容器（那是背包那边的保护），
   * 于是点一口煮着蛋的锅：箱子里多一口空锅，背包里那口原样还在——
   * 一次点击凭空变出一口锅。改成直接改写点中的那一格，
   * "搬走的"和"扣掉的"从此不可能是两件东西。
   *
   * 装着东西的容器**直接不让进**（和背包合堆规则一致）：箱子按 itemId
   * 合堆，要支持容器就得把整套合堆规则重写一遍，代价和收益不成比例。
   */
  const putIn = (index: number): void => {
    const stack = backpack[index];
    if (!stack || isLoadedWare(stack)) return;

    const leftover = addToStorage(
      inventoryId,
      stack.itemId,
      stack.count,
      stack.quality,
      stack.expiresAtUtc,
    );
    if (leftover === stack.count) return;

    setStackAt(
      { container: "backpack", index },
      leftover > 0 ? { ...stack, count: leftover } : null,
    );
  };

  return (
    <>
      <div className="ui-book absolute left-1/2 top-1/2 z-30 w-[min(940px,94vw)] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-1/2 top-[8%] -translate-x-1/2 text-[19px] font-bold tracking-[0.3em] text-[#f4e6c0] [text-shadow:0_2px_2px_rgb(0_0_0_/_0.75)]">
          {t(furnitureName)}
        </div>
        <button
          type="button"
          className="ui-wood-btn absolute right-[7.5%] top-[10%] z-10 grid h-10 w-10 place-items-center text-[16px] font-bold"
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
                /*
                 * 装着东西的容器点了没反应，所以让它**看起来**就点不动。
                 * 不弹提示——盛着菜的盘子长什么样玩家自己看得见，
                 * 一个压暗的格子已经把"这个不行"说完了。
                 */
                disabled={isLoadedWare(stack)}
                className="ui-slot relative grid h-[46px] w-[46px] place-items-center disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => putIn(index)}
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
