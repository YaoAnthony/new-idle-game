import { findItemDefinition } from "core";
import { useEffect, useState } from "react";
import { ArrowLeftRight, Backpack as BackpackIcon, Store } from "lucide-react";

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
  canShelve,
  previewTodayRevenue,
  shelfCapacityOf,
  shelfIdFor,
} from "../../Game/Systems/shopkeeping";
import { t } from "../../i18n/t";
import { Modal } from "../Modal/Modal";
import { ShelfSeal } from "../Modal/seals";
import { GoldChip } from "../BuildShopPanel/GoldChip";
import { useMirroredPanel } from "../PanelStack/useMirroredPanel";
import { ItemIcon, ItemTooltip, useTooltip } from "../Inventory/slots";

/**
 * 上架面板（期 5）：左边背包、右边货架，点一下就在两边搬。
 *
 * ---- 2026-08-30 大整改（用户点名的三条）----
 *
 * 1. **外壳换 Modal**（绽开转场那套）：旧版是 `ui-book` 木书皮的裸 div，
 *    点外面关不掉、和其他面板行为都不一样。皮走家具小店家族的绿封面
 *    （和建筑管理面板同一组：浅绿描边/封面绿/白纸+圆点纹）。
 *
 * 2. **左背包、右货架**（旧版是反的）。方向感和阅读顺序一致：东西从
 *    左手边的包里，搬到右手边的架子上。
 *
 * 3. **文字大减。** 旧版底部三行说明（"架上这些值 X · 今天客人带了 Y"
 *    "点一下在货架和背包之间搬""比客人钱包还贵的留给水獭"）全删——
 *    玩家在游戏里不读句子，读图标和数字（GoldChip 那条注释的道理）。
 *    两栏各一枚圆徽章图标当身份（背包青绿/货架琥珀），中间一枚双向
 *    箭头说"点了会互搬"，货架徽章旁一粒 n/6 计数。**预计收入**收成
 *    左下角一个词 + 一枚金币 + 一个数。
 *
 * 搬运逻辑一行没动：货架直接复用储物库存（为什么复用、prune 活名单
 * 的代价，见 Systems/shopkeeping 的文件头）。
 */
export function ShopShelfPanel() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [slots, setSlots] = useState<StorageSlot[]>([]);
  const [backpack, setBackpack] = useState(getInventory());
  const { tooltip, show, hide } = useTooltip();

  /*
   * 矮屏不给 aspect：背包面板踩过的坑——323px 的内胆按比例再收，
   * 格子会被压成碎屑。手机上铺满是唯一可行解。
   */
  const [phone, setPhone] = useState(
    () => window.matchMedia("(max-height: 500px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-height: 500px)");
    const onChange = () => setPhone(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

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

  /** 货架 → 背包。同 StoragePanel：走 placeInFirstFreeSlot，不重算保质期 */
  const takeBack = (index: number): void => {
    if (!inventoryId) return;
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
    if (!inventoryId) return;
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
  const stocked = slots.slice(0, capacity).filter(Boolean).length;

  return (
    <>
      <Modal
        open={instanceId !== null}
        onClose={() => setInstanceId(null)}
        seal={<ShelfSeal />}
        edgeColor="#A5D6A7"
        frameColor="#81C784"
        paperColor="#FFFFFF"
        aspect={phone ? undefined : 1.7}
        fill={phone ? undefined : 0.92}
        label={t("ui.shelf.title")}
      >
        {instanceId && (
          <div
            className="absolute inset-0 flex flex-col p-3 sm:p-4"
            style={{
              fontFamily: '"Nunito", "LXGW WenKai GB", "Kaiti SC", sans-serif',
            }}
          >
            {/* 书页的纸纹 */}
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage: "radial-gradient(#E0E0E0 2px, transparent 2px)",
                backgroundSize: "24px 24px",
              }}
            />

            {/* ---- 主体：左背包 → 右货架 ---- */}
            <div className="relative z-10 flex min-h-0 flex-1 items-stretch gap-2 sm:gap-3">
              {/* 左：背包 */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[20px] border-2 border-[#EEEEEE] bg-white/70 p-2 sm:p-3">
                <div className="mb-2 flex h-9 w-9 items-center justify-center self-center rounded-full bg-[#4DB6AC] shadow-[0_3px_0_#00897B]">
                  <BackpackIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(46px,1fr))] gap-1.5">
                    {backpack.map((stack, index) => {
                      const blocked =
                        Boolean(stack) &&
                        (isLoadedWare(stack) || !canShelve(stack!.itemId));
                      return (
                        <button
                          key={index}
                          type="button"
                          disabled={blocked}
                          className={`relative grid aspect-square place-items-center rounded-[12px] border-2 bg-white shadow-[0_2px_0_#E0E0E0] transition-colors ${
                            blocked
                              ? "cursor-not-allowed border-[#F5F5F5] opacity-40"
                              : "cursor-pointer border-[#EEEEEE] hover:border-[#81C784]"
                          }`}
                          onClick={() => putUp(index)}
                          onPointerEnter={(event) => {
                            if (stack) show(stack.itemId, event.currentTarget);
                          }}
                          onPointerLeave={hide}
                        >
                          {stack && (
                            <>
                              <ItemIcon itemId={stack.itemId} size={30} />
                              {stack.count > 1 && (
                                <span className="absolute bottom-0 right-1 text-[10px] font-black text-[#5D4037]">
                                  {stack.count}
                                </span>
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 中缝：点了会互搬（唯一的"说明"，一个符号讲完） */}
              <div className="grid shrink-0 place-items-center">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-[#F5F5F5] shadow-[inset_0_-2px_0_#E0E0E0]">
                  <ArrowLeftRight className="h-4 w-4 text-[#BCAAA4]" strokeWidth={3} />
                </div>
              </div>

              {/* 右：货架 */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[20px] border-2 border-[#FFE082] bg-[#FFF8E1]/80 p-2 sm:p-3">
                <div className="mb-2 flex items-center justify-center gap-2 self-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFCA28] shadow-[0_3px_0_#FF8F00]">
                    <Store className="h-5 w-5 text-white" strokeWidth={2.5} />
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[12px] font-black tabular-nums text-[#F57F17] shadow-[inset_0_-2px_0_#FFE082]">
                    {stocked}/{capacity}
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5 sm:gap-2">
                    {slots.slice(0, capacity).map((slot, index) => (
                      <button
                        key={index}
                        type="button"
                        className="relative grid aspect-square cursor-pointer place-items-center rounded-[12px] border-2 border-[#FFE082] bg-white shadow-[0_2px_0_#FFE082] transition-colors hover:border-[#FFB300]"
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
                              <span className="absolute bottom-0 right-1 text-[10px] font-black text-[#5D4037]">
                                {slot.count}
                              </span>
                            )}
                            {/* 标价：货架和箱子唯一真正的区别 */}
                            <span className="absolute -left-1 -top-1 rounded-full bg-[#FFCA28] px-1.5 text-[10px] font-black text-white shadow-[0_2px_0_#FF8F00]">
                              {priceOf(slot.itemId)}
                            </span>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/*
              底栏只剩一件事：预计今日收入。词 + 币 + 数——不再解释它是
              怎么算的（dry-run 真结算，见 previewTodayRevenue），玩家试
              两次就懂：摆贵货数字不动 = 今天没人买得起。
            */}
            <div className="relative z-10 mt-2 flex items-center gap-2 sm:mt-3">
              <span className="text-[13px] font-black text-[#8D6E63]">
                {t("ui.shelf.forecast")}
              </span>
              <GoldChip amount={previewTodayRevenue(instanceId)} size="inline" />
            </div>
          </div>
        )}
      </Modal>

      <ItemTooltip tooltip={tooltip} />
    </>
  );
}
