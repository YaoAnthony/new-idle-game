import { useEffect, useState } from "react";
import {
  Archive,
  Armchair,
  ArrowLeftRight,
  Backpack as BackpackIcon,
  ChevronsRight,
  HandCoins,
  Inbox,
  Lock,
  Percent,
  Sunrise,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { findItemDefinition } from "core";

import { emit, on } from "../../Game/EventBus";
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
  boxCapacity,
  boxHint,
  boxInventoryIdFor,
  boxPendingRevenue,
  canConsign,
  claimBoxRevenue,
  consignPrice,
  previewConsignRevenue,
} from "../../Game/Systems/consigning";
import { t } from "../../i18n/t";
import { Modal } from "../Modal/Modal";
import { ChestSeal } from "../Modal/seals";
import { GoldChip } from "../BuildShopPanel/GoldChip";
import { useMirroredPanel } from "../PanelStack/useMirroredPanel";
import { ItemIcon, ItemTooltip, useTooltip } from "../Inventory/slots";

/**
 * 寄售台面板。左背包、右**箱子剖面**，点一下就在两边搬。
 *
 * ## 四件事，四个视觉装置（2026-09-02 重做）
 *
 * 第一版是照货架面板抄的身体：右边一张空纸 + 四个白格 + 底下一行小字。
 * 用户否了："设计引导极差……完全不知道是干嘛的，但你也不能就说用文字直接引导。"
 * 一个没见过它的人，不读一段说明，得看得出四件事：
 *
 * | 该看出什么 | 靠什么 |
 * |---|---|
 * | 这是把家具放进去**卖**的箱子 | 右栏画成箱子：顶上一条"箱盖"色带挂着钱袋徽章和「8折」价签，箱内是暖木色 + 内阴影（往下看进箱子） |
 * | 东西从**左边**搬过来 | 空隔间是虚线椅子剪影（随格子缩放）；箱子全空时中缝那颗箭头往右呼吸 |
 * | 只给 **8 折**、**明早**到账 | 每格角上一枚带币的折后价；底部结算条像小票：标价划掉 → 折后价加粗，旁边一枚日出徽标 |
 * | 卖掉的钱在**这儿领** | 隔间下面常驻一条抽屉：空 / 可领 / 金库满，三态换图标不只换颜色 |
 *
 * 允许的文字只有 2～4 字的短标签。**面板里没有一句解释**。
 *
 * ## 尺寸：隔间是封顶的正方形，不吃满纵向
 *
 * 第二版评审（2026-09-02）在 1440 宽的视口上把病灶指出来了：隔间 `h-full`
 * 无上限，被拉成两块 285×230 的空板，24px 的椅子剪影淹在正中央，整块箱子
 * 读成"一大片橙色空卡片"——和被否的第一版是同一个病，只是换了皮。现在
 * 隔间是 `min(100%, 100cqh)` 的正方形（父容器开了 container-type: size），
 * 宽屏封顶、窄屏贴边，多出来的箱内空间靠内阴影读成"箱子够深"。
 *
 * 待领那条为什么常驻不隐藏：结构常驻、内容态变——玩家的空间记忆不会因为
 * 东西时有时无而重新学一次布局。
 */
export function ConsignPanel() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [slots, setSlots] = useState<StorageSlot[]>([]);
  const [backpack, setBackpack] = useState(getInventory());
  // 抽屉没有事件（家具侧抽屉是本地写），领完靠这个数让面板重画
  const [drawerTick, setDrawerTick] = useState(0);
  const { tooltip, show, hide } = useTooltip();
  const reduceMotion = useReducedMotion();

  const [phone, setPhone] = useState(
    () => window.matchMedia("(max-height: 500px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-height: 500px)");
    const onChange = () => setPhone(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const inventoryId = instanceId ? boxInventoryIdFor(instanceId) : null;
  const capacity = boxCapacity();

  useEffect(() => {
    const offOpen = on("consign_open_requested", ({ instanceId: id }) => {
      setInstanceId(id);
      setSlots(getStorage(boxInventoryIdFor(id)));
      setBackpack(getInventory());
    });
    const offInventory = on("inventory_changed", () => setBackpack(getInventory()));
    // 抽屉三态里有一态取决于金库空位：面板开着的时候金库变了（领取、花钱），
    // 按钮得跟着从"金库满了"变回"领取"，不然按钮说的是上一秒的话
    const offGold = on("gold_changed", () => setDrawerTick((n) => n + 1));
    return () => {
      offOpen();
      offInventory();
      offGold();
    };
  }, []);

  useEffect(() => {
    if (!inventoryId) return;
    const off = on("storage_changed", (event) => {
      if (event.inventoryId === inventoryId) setSlots(getStorage(inventoryId));
    });
    return off;
  }, [inventoryId]);

  useMirroredPanel("consign", instanceId !== null, () => setInstanceId(null));

  /** 箱格 → 背包（反悔）。走 placeInFirstFreeSlot，不重算保质期 */
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

  /** 背包 → 箱格（寄售） */
  const putIn = (index: number): void => {
    if (!inventoryId) return;
    const stack = backpack[index];
    if (!stack || isLoadedWare(stack) || !canConsign(stack.itemId)) return;

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

  /** 领货款：先入账再演出，飞的金币只是那笔账的可视化 */
  const claim = (from: HTMLElement): void => {
    if (!instanceId) return;
    const amount = claimBoxRevenue(instanceId);
    setDrawerTick((n) => n + 1);
    if (amount <= 0) return;
    const rect = from.getBoundingClientRect();
    emit("coin_fly_requested", {
      amount,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  };

  const visible = slots.slice(0, capacity);
  const stocked = visible.filter(Boolean).length;
  const priceOf = (itemId: string): number => findItemDefinition(itemId)?.value ?? 0;
  /** 标价合计（未打折）：小票上被划掉的那个数 */
  const rawTotal = visible.reduce(
    (sum, slot) => sum + (slot ? priceOf(slot.itemId) * slot.count : 0),
    0,
  );
  /** 折后合计：和真结算同一个函数算的，不在这里心算八折 */
  const discounted = instanceId ? previewConsignRevenue(instanceId) : 0;
  const pending = instanceId ? boxPendingRevenue(instanceId) : 0;
  const hint = instanceId ? boxHint(instanceId) : "empty";
  void drawerTick;

  return (
    <>
      <Modal
        open={instanceId !== null}
        onClose={() => setInstanceId(null)}
        seal={<ChestSeal />}
        edgeColor="#FFCC80"
        frameColor="#FFB74D"
        paperColor="#FFFFFF"
        aspect={phone ? undefined : 1.7}
        fill={phone ? undefined : 0.92}
        label={t("ui.consign.title")}
      >
        {instanceId && (
          <div
            className="absolute inset-0 flex flex-col p-3 sm:p-4"
            style={{
              fontFamily: '"Nunito", "LXGW WenKai GB", "Kaiti SC", sans-serif',
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage: "radial-gradient(#E0E0E0 2px, transparent 2px)",
                backgroundSize: "24px 24px",
              }}
            />

            {/*
              ---- 主体：左背包 / 右箱子 各占一半 ----
              第二版是 3:5。评审（第二轮）指出隔间被高度卡成正方形之后，
              箱子栏越宽两侧露出的暖木空地越大，读成"没填满"；对半分之后
              格子尺寸不变（高度定的），空地收窄。
            */}
            <div className="relative z-10 flex min-h-0 flex-1 items-stretch gap-2 sm:gap-3">
              {/* 左：背包（配角） */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[20px] border-2 border-[#EEEEEE] bg-white/70 p-2 sm:p-3">
                <div className="mb-2 flex h-9 w-9 items-center justify-center self-center rounded-full bg-[#4DB6AC] shadow-[0_3px_0_#00897B]">
                  <BackpackIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-1.5">
                    {backpack.map((stack, index) => {
                      const blocked =
                        Boolean(stack) &&
                        (isLoadedWare(stack) || !canConsign(stack!.itemId));
                      return (
                        <button
                          key={index}
                          type="button"
                          disabled={blocked}
                          className={`relative grid aspect-square place-items-center rounded-[12px] border-2 bg-white shadow-[0_2px_0_#E0E0E0] transition-colors ${
                            blocked
                              ? "cursor-not-allowed border-[#F5F5F5] opacity-40"
                              : "cursor-pointer border-[#EEEEEE] hover:border-[#FFB74D]"
                          }`}
                          onClick={() => putIn(index)}
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

              {/*
                中缝：箱子全空时往右"点两下"的呼吸箭头——教一次"从左边搬过来"；
                放进第一件就退回中性的双向箭头（事实上任何时候点哪边都通）。
                减少动态时不播，那是无障碍要求不是偏好。
              */}
              <div className="grid shrink-0 place-items-center">
                {stocked === 0 ? (
                  <motion.div
                    className="grid h-9 w-9 place-items-center rounded-full bg-[#FFE0B2] shadow-[inset_0_-2px_0_#FFCC80] lg:h-12 lg:w-12"
                    animate={reduceMotion ? undefined : { x: [0, 4, 0] }}
                    transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <ChevronsRight
                      className="h-5 w-5 text-[#FF9800] lg:h-6 lg:w-6"
                      strokeWidth={3}
                      aria-hidden
                    />
                  </motion.div>
                ) : (
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-[#F5F5F5] shadow-[inset_0_-2px_0_#E0E0E0] lg:h-12 lg:w-12">
                    <ArrowLeftRight
                      className="h-5 w-5 text-[#BCAAA4] lg:h-6 lg:w-6"
                      strokeWidth={3}
                      aria-hidden
                    />
                  </div>
                )}
              </div>

              {/* 右：箱子（箱盖色带 / 箱内 2×2 隔间 / 抽屉条） */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border-2 border-[#FFCC80] bg-[#FFF3E0]/80 p-2 sm:p-3">
                {/*
                  箱盖：通栏色带，比箱身深一档——"有盖子的箱子"这个读法靠这条。
                  盖子上挂着钱袋徽章、旋转的「8折」价签、几格。桌面断点整体放大一档。
                */}
                <div className="-mx-2 -mt-2 mb-2 flex shrink-0 items-center justify-center gap-2 rounded-t-[18px] bg-gradient-to-b from-[#FFDDA8] to-[#FFCC80] px-3 py-2 sm:-mx-3 sm:-mt-3 sm:gap-2.5 lg:gap-3 lg:py-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF9800] shadow-[0_3px_0_#E65100] sm:h-9 sm:w-9 lg:h-11 lg:w-11">
                    <HandCoins className="h-5 w-5 text-white lg:h-6 lg:w-6" strokeWidth={2.5} aria-hidden />
                  </div>
                  <div className="relative -rotate-1 rounded-md bg-white px-2.5 py-1 shadow-[0_2px_0_#E0A050] sm:px-3 sm:py-1.5 lg:px-4 lg:py-2">
                    <span
                      aria-hidden
                      className="absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#BCAAA4]"
                    />
                    <span className="text-[13px] font-black text-[#E65100] lg:text-base">8折</span>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[12px] font-black tabular-nums text-[#E65100] shadow-[inset_0_-2px_0_#FFCC80] sm:px-3 sm:py-1 sm:text-[13px] lg:px-4 lg:py-1.5 lg:text-base">
                    {stocked}/{capacity}
                  </span>
                </div>

                {/*
                  箱内：暖木色 + 内阴影（往下看进箱子）。隔间是 min(100%, 100cqh) 的
                  正方形——宽屏封顶、窄屏贴边，多出来的空间读作"箱子够深"。
                */}
                <div
                  className="flex min-h-0 flex-1 items-center justify-center rounded-[14px] border-2 border-[#F0C48A] bg-[#FFEBD1] p-1.5 shadow-[inset_0_6px_16px_rgba(93,64,55,0.15)] sm:p-2"
                  style={{ containerType: "size" }}
                >
                  <div
                    className="grid aspect-square grid-cols-2 grid-rows-2 gap-1.5 sm:gap-2 lg:gap-3"
                    style={{ width: "min(100%, 100cqh)" }}
                  >
                    {visible.map((slot, index) => (
                      <button
                        key={index}
                        type="button"
                        disabled={!slot}
                        className={`relative grid min-h-0 place-items-center rounded-[10px] border-2 transition-colors ${
                          slot
                            ? "cursor-pointer border-[#FFCC80] bg-white shadow-[0_2px_0_#FFCC80] hover:border-[#FF9800]"
                            : "cursor-default border-dashed border-[#E3AE90]/70 bg-white/40"
                        }`}
                        onClick={() => takeBack(index)}
                        onPointerEnter={(event) => {
                          if (slot) show(slot.itemId, event.currentTarget);
                        }}
                        onPointerLeave={hide}
                      >
                        {slot ? (
                          <>
                            <ItemIcon itemId={slot.itemId} fluid />
                            {slot.count > 1 && (
                              <span className="absolute bottom-0 right-1 text-[10px] font-black text-[#5D4037] lg:text-[12px]">
                                {slot.count}
                              </span>
                            )}
                            {/* 折后价：带币的价签，和结算条上的钱是同一个视觉物种 */}
                            <span className="absolute -left-1 -top-1">
                              <GoldChip amount={consignPrice(slot.itemId)} size="mini" />
                            </span>
                          </>
                        ) : (
                          // 空坑位：虚线椅子剪影，跟着格子缩放——"这里放家具"
                          <Armchair
                            aria-hidden
                            className="h-[42%] w-[42%] text-[#D9A27A] opacity-80 [stroke-dasharray:3_3]"
                            strokeWidth={1.75}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/*
                  抽屉条：三态各配一个图标（关着的箱子 / 打开的收纳篮 / 一把锁），
                  不是只靠背景色分——色弱也分得清。可领时整条都是按钮，触控目标更大。
                */}
                <button
                  type="button"
                  disabled={hint !== "claimable"}
                  onClick={(event) => claim(event.currentTarget)}
                  className={`mt-1.5 flex shrink-0 items-center gap-2 rounded-[10px] border-2 px-2.5 py-1.5 transition-transform lg:mt-2 lg:px-4 lg:py-2.5 ${
                    hint === "claimable"
                      ? "cursor-pointer border-[#FF9800] bg-white shadow-[0_3px_0_#E65100] active:translate-y-[2px] active:shadow-none"
                      : hint === "vault_full"
                        ? "cursor-not-allowed border-[#EFC9C9] bg-[#FFF3F1] shadow-[0_3px_0_#E0E0E0]"
                        : "cursor-not-allowed border-[#E9DAC4] bg-[#F5EDE0]/60 shadow-[0_3px_0_#E0E0E0]"
                  }`}
                >
                  {hint === "empty" && (
                    <>
                      <Archive className="h-4 w-4 text-[#BCAAA4] lg:h-5 lg:w-5" strokeWidth={2.5} aria-hidden />
                      <span className="text-[11px] font-bold text-[#BCAAA4] lg:text-sm">
                        {t("ui.consign.drawer")}
                      </span>
                    </>
                  )}
                  {hint === "claimable" && (
                    <>
                      <Inbox className="h-4 w-4 text-[#FF9800] lg:h-5 lg:w-5" strokeWidth={2.5} aria-hidden />
                      <span className="text-[11px] font-black text-[#8D6E63] lg:text-sm">
                        {t("ui.consign.pending")}
                      </span>
                      <GoldChip amount={pending} size="inline" />
                      <span className="ml-auto rounded-full bg-[#FF9800] px-2.5 py-1 text-[11px] font-black text-white lg:px-4 lg:text-sm">
                        {t("ui.consign.claim")}
                      </span>
                    </>
                  )}
                  {hint === "vault_full" && (
                    <>
                      <Lock className="h-4 w-4 text-[#C97A6E] lg:h-5 lg:w-5" strokeWidth={2.5} aria-hidden />
                      {/* 和可领态一样垫一句"待领"：这个数是同一笔钱，不该换个状态就没了名字 */}
                      <span className="text-[11px] font-bold text-[#C97A6E] lg:text-sm">
                        {t("ui.consign.pending")}
                      </span>
                      <GoldChip amount={pending} size="inline" tone="short" />
                      <span className="ml-auto rounded-full bg-[#BDBDBD] px-2.5 py-1 text-[11px] font-black text-white lg:px-4 lg:text-sm">
                        {t("ui.consign.vault_full")}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/*
              底部结算条：一张小票——虚线撕边、日出徽标（明早）、
              标价合计划掉 → 折后合计加粗。箱子空时只画一枚 0，不画没意义的对比。
            */}
            <div className="relative z-10 mt-2 flex shrink-0 items-center gap-2 rounded-[14px] border-2 border-dashed border-[#E3AE90] bg-white/70 px-3 py-2 sm:mt-3 lg:px-4 lg:py-2.5">
              <div className="flex items-center gap-1.5 lg:gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-b from-[#FFCC80] to-[#FF9800] lg:h-9 lg:w-9">
                  <Sunrise className="h-4 w-4 text-white lg:h-5 lg:w-5" strokeWidth={2.5} aria-hidden />
                </div>
                <span className="text-[12px] font-black text-[#8D6E63] lg:text-sm">
                  {t("ui.consign.forecast")}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {rawTotal > 0 ? (
                  <>
                    <GoldChip amount={rawTotal} size="inline" strike />
                    <Percent className="h-3.5 w-3.5 text-[#BCAAA4]" strokeWidth={3} aria-hidden />
                    <GoldChip amount={discounted} size="chip" />
                  </>
                ) : (
                  <GoldChip amount={0} size="chip" />
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ItemTooltip tooltip={tooltip} />
    </>
  );
}
