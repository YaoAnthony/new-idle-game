import { ItemCategory, findItemDefinition } from "core";
import { useEffect, useMemo, useState } from "react";
import { emit, on } from "../../Game/EventBus";
import { BACKPACK_SIZE, getBackpack } from "../../Game/State/inventory";
import { useInventoryItem } from "../../Game/Systems/itemUse";
import { t } from "../../i18n/t";
import { DragGhost, ItemIcon, SlotCell } from "../Inventory/slots";

/**
 * 背包面板（B 开关）。
 *
 * 版式是**左格子 / 右详情**的两栏，不是把格子怼进一张书包插图里。
 * 原来那版用 backpack_bg.png 整图当底、内容按百分比定位：一半面积是
 * 画出来的包盖，格子挤在中间的羊皮纸窗口里，换张图就得重排。
 *
 * 现在的取舍（都能在市面上的做法里找到对应）：
 *
 * - **详情卡常驻，取代浮动 tooltip**。悬浮提示一挪鼠标就没，没法比较两件
 *   东西，也放不下按钮。选中 → 右边一直显示，是布置/农场类游戏的通行做法。
 * - **分类页签**而不是一堆散格子。类别直接来自 Core 的 ItemCategory，
 *   加一类物品只用在 i18n 补一行。
 * - **筛选只压暗、不重排**。槽位下标就是拖拽的落点地址，重排会让
 *   "拖到第三格"落到别的地方去。
 * - **点击=选中，动作走详情卡上的按钮**。原来点一下就直接拿到手上，
 *   想看看这是什么都不行；现在看和做分开，动作也从 10px 灰字提示
 *   变成了实体按钮。
 * - 正文字号从 10~11px 提到 12~15px。原来那个尺寸是给装饰用的，不是给读的。
 */

/** 页签顺序。`null` = 全部 */
const TABS: Array<ItemCategory | null> = [
  null,
  ItemCategory.Material,
  ItemCategory.Food,
  ItemCategory.Furniture,
  ItemCategory.Tool,
  ItemCategory.Quest,
];

const TAB_KEY: Record<string, string> = {
  all: "ui.category.all",
  [ItemCategory.Material]: "ui.category.material",
  [ItemCategory.Food]: "ui.category.food",
  [ItemCategory.Furniture]: "ui.category.furniture",
  [ItemCategory.Tool]: "ui.category.tool",
  [ItemCategory.Quest]: "ui.category.quest",
};

type BackpackProps = {
  /** 点了"布置到屋里"。不传就不显示那个按钮 */
  onPlacement?: (itemId: string) => void;
};

export function Backpack({ onPlacement }: BackpackProps) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState(getBackpack());
  const [tab, setTab] = useState<ItemCategory | null>(null);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);

  useEffect(() => {
    const off = on("inventory_changed", () => setSlots(getBackpack()));

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (event.key.toLowerCase() === "b") setOpen((current) => !current);
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      off();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // 副作用不能写在 setOpen 的 updater 里——updater 必须是纯函数，
  // 在渲染期发信号会去改别的组件（TutorialGuide），StrictMode 下还会发两次
  useEffect(() => {
    if (open) emit("story_signal", { kind: "backpack_opened" });
  }, [open]);

  const visible = slots.slice(0, BACKPACK_SIZE);
  const used = visible.filter(Boolean).length;

  /** 选中的那一格。格子被清空（拿到手上）后自动松开选中 */
  const picked = pickedIndex === null ? null : visible[pickedIndex] ?? null;

  const matchesTab = useMemo(() => {
    return (itemId: string): boolean => {
      if (tab === null) return true;
      return findItemDefinition(itemId)?.category === tab;
    };
  }, [tab]);

  const tabHasAny = visible.some((stack) => stack && matchesTab(stack.itemId));

  if (!open) return <DragGhost />;

  return (
    <>
      <div className="ui-pack absolute right-6 top-1/2 z-20 w-[min(760px,60vw)] -translate-y-1/2 p-4">
        {/* ---- 标题行：名字 + 分类页签 + 关闭 ---- */}
        <div className="mb-3 flex items-center gap-3">
          <h2 className="shrink-0 text-[20px] font-bold tracking-[0.2em] text-[#f7e6c4] [text-shadow:0_2px_0_rgb(74_44_26)]">
            {t("ui.backpack")}
          </h2>

          <div className="flex flex-1 flex-wrap gap-1.5">
            {TABS.map((category) => {
              const key = category ?? "all";
              return (
                <button
                  key={key}
                  type="button"
                  className={`ui-tab px-2.5 py-1 text-[13px] font-bold ${
                    tab === category ? "ui-tab--active" : ""
                  }`}
                  onClick={() => setTab(category)}
                >
                  {t(TAB_KEY[key])}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border-2 border-[#4a2c1a] bg-[#c0392b] text-[16px] font-bold text-white shadow hover:brightness-110"
            aria-label={t("ui.close")}
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>

        {/* ---- 主体：左格子 / 右详情 ---- */}
        <div className="flex gap-3">
          <div className="ui-parchment p-3">
            <div className="grid grid-cols-6 gap-2">
              {visible.map((stack, index) => {
                const dimmed = Boolean(stack) && !matchesTab(stack!.itemId);
                return (
                  <SlotCell
                    key={index}
                    slotRef={{ container: "backpack", index }}
                    stack={stack}
                    size={54}
                    dimmed={dimmed}
                    picked={pickedIndex === index && Boolean(stack)}
                    // 点击只**选中**，动作交给右边的按钮——
                    // 原来点一下直接拿到手上，想看看这是什么都做不到
                    onClick={() => setPickedIndex(stack ? index : null)}
                  />
                );
              })}
            </div>

            {!tabHasAny && (
              <div className="mt-2 text-center text-[12px] text-[#9a7a52]">
                {t("ui.backpack.filter_empty")}
              </div>
            )}
          </div>

          <ItemDetail
            itemId={picked?.itemId ?? null}
            count={picked?.count ?? 0}
            onPlacement={onPlacement}
            onUsed={() => setPickedIndex(null)}
          />
        </div>

        {/* ---- 底栏：操作提示 + 容量 ---- */}
        <div className="mt-3 flex items-center justify-between text-[12px] text-[#e6d2ac]">
          <span>{t("ui.backpack.hint")}</span>
          <span className="font-bold">
            {t("ui.backpack.capacity")} {used} / {BACKPACK_SIZE}
          </span>
        </div>
      </div>

      <DragGhost />
    </>
  );
}

/**
 * 右侧详情卡。空选中时不留一块空白——写一句"点一下格子看看"，
 * 让那块面积在没选中时也在说话。
 */
function ItemDetail({
  itemId,
  count,
  onPlacement,
  onUsed,
}: {
  itemId: string | null;
  count: number;
  onPlacement?: (itemId: string) => void;
  onUsed: () => void;
}) {
  const item = itemId ? findItemDefinition(itemId) : null;

  if (!itemId || !item) {
    return (
      <div className="ui-parchment grid flex-1 place-items-center p-4 text-center">
        <div>
          <div className="text-[14px] font-bold text-[#8a6a48]">
            {t("ui.backpack.empty_title")}
          </div>
          <div className="mt-1 text-[12px] text-[#a08560]">
            {t("ui.backpack.empty_hint")}
          </div>
        </div>
      </div>
    );
  }

  const placeable = Boolean(item.placeableFurnitureId);
  const edible = Boolean(item.food);

  return (
    <div className="ui-parchment flex flex-1 flex-col p-4">
      <div className="flex items-start gap-3">
        <div className="ui-slot grid h-[64px] w-[64px] shrink-0 place-items-center">
          <ItemIcon itemId={itemId} size={50} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold leading-tight text-[#3d2817]">
            {t(item.localizationKey)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded border border-[#c2a97c] bg-[#e8d7b2] px-1.5 py-0.5 font-bold text-[#6b4a30]">
              {t(TAB_KEY[item.category] ?? item.category)}
            </span>
            <span className="rounded border border-[#c2a97c] bg-[#e8d7b2] px-1.5 py-0.5 font-bold text-[#6b4a30]">
              {t(`ui.rarity.${item.rarity}`)}
            </span>
            {count > 1 && (
              <span className="font-bold text-[#6b4a30]">×{count}</span>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 flex-1 text-[13px] leading-relaxed text-[#5b4028]">
        {t(`${item.localizationKey}.desc`)}
      </p>

      {/* 动作按钮。能做什么由物品能力决定，和 itemUse 的分派顺序一致 */}
      <div className="mt-3 flex flex-wrap gap-2">
        {placeable && onPlacement && (
          <button
            type="button"
            className="ui-pack-action px-3 py-1.5 text-[13px] font-bold"
            onClick={() => {
              useInventoryItem(itemId, { onPlacement });
              onUsed();
            }}
          >
            {t("ui.backpack.place")}
          </button>
        )}
        {!placeable && (
          <button
            type="button"
            className="ui-pack-action px-3 py-1.5 text-[13px] font-bold"
            onClick={() => {
              useInventoryItem(itemId);
              onUsed();
            }}
          >
            {edible ? t("ui.backpack.eat") : t("ui.backpack.take")}
          </button>
        )}
      </div>
    </div>
  );
}
