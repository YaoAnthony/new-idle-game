import { ItemCategory, findItemDefinition, itemCategoryOrder } from "core";
import { useEffect, useMemo, useState } from "react";
import { emit, on } from "../../Game/EventBus";
import { matchesAction } from "../../Game/Input/bindings";
import {
  HOTBAR_SIZE,
  INVENTORY_SIZE,
  getInventory,
  getSelectedHotbarIndex,
  moveStack,
  sortBackpack,
  type SlotRef,
  type SlotStack,
} from "../../Game/State/inventory";
import { eatInventoryItem } from "../../Game/Systems/itemUse";
import { eatFromWare } from "../../Game/Systems/servedDish";
import { presentedItemId, servedDish } from "../../Game/Systems/servedDish";
import { isTouchMode } from "../../Game/State/touchMode";
import { t } from "../../i18n/t";
import { DragGhost, ItemIcon, SlotCell } from "../Inventory/slots";
import { usePanel } from "../PanelStack/usePanel";

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

/**
 * 页签顺序。`null` = 全部，其余取 Core 的 `itemCategoryOrder`——
 * 和"整理"的排序共用同一份，整理完的结果才和页签从左到右对得上。
 */
const TABS: Array<ItemCategory | null> = [null, ...itemCategoryOrder];

const TAB_KEY: Record<string, string> = {
  all: "ui.category.all",
  [ItemCategory.Material]: "ui.category.material",
  [ItemCategory.Food]: "ui.category.food",
  [ItemCategory.Furniture]: "ui.category.furniture",
  [ItemCategory.Tool]: "ui.category.tool",
  [ItemCategory.Quest]: "ui.category.quest",
};

export function Backpack() {
  // 开关挂在全局面板栈上（见 usePanel）：谁开着、ESC 该退哪一层，全场一份账
  const [open, setOpen] = usePanel("backpack");

  // ESC 菜单里那一格也能开背包——B 键之外的第二个入口，开关仍归这里管
  useEffect(
    () => on("ui_panel_requested", ({ panel }) => {
      if (panel === "backpack") setOpen(true);
    }),
    [setOpen],
  );
  // 一份数据。面板把它切成两片渲染（背包网格 + 底下那行快捷栏），
  // 但槽位号是同一套，所以跨片拖拽不需要任何换算
  const [items, setItems] = useState(getInventory());
  const [tab, setTab] = useState<ItemCategory | null>(null);
  /** 详情卡在看哪一格（绝对槽位号）。快捷栏那行也在面板里，点它也要能看 */
  const [picked, setPicked] = useState<SlotRef | null>(null);

  useEffect(() => {
    const off = on("inventory_changed", () => setItems(getInventory()));

    const onKeyDown = (event: KeyboardEvent) => {
      /*
       * 这里不再管 Esc。关闭统一归 [EscArbiter]：它按面板栈退最上面那一层，
       * 顺带保住了原来这条注释讲的事——"焦点在输入框里 Esc 也得能关面板"。
       * 每块面板各挂一个 Esc 监听正是那个"一次按键被处理两遍"的来源。
       */
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (matchesAction(event, "backpack")) setOpen((current) => !current);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      off();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [setOpen]);

  // 副作用不能写在 setOpen 的 updater 里——updater 必须是纯函数，
  // 在渲染期发信号会去改别的组件（TutorialGuide），StrictMode 下还会发两次
  useEffect(() => {
    if (open) emit("story_signal", { kind: "backpack_opened" });
  }, [open]);

  /** 背包段。**下标要 +HOTBAR_SIZE 才是槽位号**，见下面 map 里的 slot */
  const visible = items.slice(HOTBAR_SIZE);
  const hotbarVisible = items.slice(0, HOTBAR_SIZE);
  // 容量算整份：快捷栏就是背包的前 8 格，不该从容量里漏掉
  const used = items.filter(Boolean).length;

  /** 选中格子里的东西。格子被清空（拿到手上、整理重排）后自动松开选中 */
  const pickedStack = picked === null ? null : items[picked] ?? null;

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
      {/*
       * 压暗背景：面板占住正中间，暗一层才看得出焦点在面板上。
       * 点空白处也能关——和 Esc 一样是兜底出口。
       *
       * z-40 而不是 20：这是**全屏遮罩式模态**，按仓库既有分层
       * （HUD 和侧栏 z-30、全屏覆盖 z-40、拖拽幽灵 z-50）该压过 HUD。
       * 原来 z-20 会被右上角的设置按钮（z-30）盖住关闭按钮——
       * 窄屏上两者正好重叠，点不到 ×。
       */}
      <div
        className="absolute inset-0 z-40 grid place-items-center bg-black/40 p-3"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        {/*
          `min-h-0` 不能省：外层是 grid 居中，而 grid 项的 `min-height` 默认是
          `auto`——意思是"不许收缩到内容最小高度以下"，它会**直接顶掉
          `max-h-full`**。横屏手机（高 414）上实测面板撑到 603px，底部整排
          格子被裁在屏幕外，而且因为面板自己没超出，内层的 overflow 也不触发。
        */}
        <div className="ui-pack flex max-h-full min-h-0 w-[min(1100px,96vw)] flex-col p-3 sm:p-4">
          {/*
           * 标题行。**窄屏拆成两行**：标题+关闭一行、页签自己一行。
           * 挤在一行的话页签会换行，把标题顶得上下不着边。
           */}
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex items-center justify-between gap-3">
              {/*
                浅奶油字 + 深描边是给旧版深棕皮革面板配的。面板换成奶油底
                之后那套是浅底浅字，标题直接看不见——换成深可可实心字。
              */}
              <h2 className="shrink-0 text-[17px] font-bold tracking-[0.2em] text-[var(--ink)] sm:text-[20px]">
                {t("ui.backpack")}
              </h2>

              {/* 窄屏时关闭按钮跟着标题走，宽屏时排到最右 */}
              <button
                type="button"
                className="ui-wood-btn grid h-8 w-8 shrink-0 place-items-center text-[16px] font-bold sm:hidden"
                aria-label={t("ui.close")}
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-1 sm:gap-1.5">
              {TABS.map((category) => {
                const key = category ?? "all";
                return (
                  <button
                    key={key}
                    type="button"
                    className={`ui-tab px-2 py-1 text-[12px] font-bold sm:px-2.5 sm:text-[13px] ${
                      tab === category ? "ui-tab--active" : ""
                    }`}
                    onClick={() => setTab(category)}
                  >
                    {t(TAB_KEY[key])}
                  </button>
                );
              })}

              {/*
               * 整理。和页签隔开一点——它是**动作**不是筛选，
               * 混在页签里会被当成"第七个分类"。
               * 整理会重排格子，选中的下标就不再指向原来那件东西了，
               * 所以顺手清掉选中。
               */}
              <button
                type="button"
                className="ui-tab ml-1 px-2 py-1 text-[12px] font-bold sm:px-2.5 sm:text-[13px]"
                onClick={() => {
                  sortBackpack();
                  setPicked(null);
                }}
              >
                {t("ui.backpack.sort")}
              </button>
            </div>

            <button
              type="button"
              className="ui-wood-btn hidden h-8 w-8 shrink-0 place-items-center text-[16px] font-bold sm:grid"
              aria-label={t("ui.close")}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          {/*
           * 主体。**窄屏竖排、宽屏并排**：手机上并排会把两边都压成条，
           * 格子小到点不准；竖排则是格子在上、详情在下，各自拿满宽度。
           * 只有一个滚动条（整块主体），格子和详情各自不再单独滚。
           */}
          <div className="pack-body flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto md:flex-row">
            <div className="pack-grid ui-parchment p-2 sm:p-3 md:flex-[3]">
              {/* 手机 4 列、平板以上 6 列。格子是流体的，跟着列宽走 */}
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2">
                {visible.map((stack, index) => {
                  const dimmed = Boolean(stack) && !matchesTab(stack!.itemId);
                  const slot = HOTBAR_SIZE + index;
                  return (
                    <SlotCell
                      key={slot}
                      slotRef={slot}
                      stack={stack}
                      fluid
                      dimmed={dimmed}
                      picked={picked === slot && Boolean(stack)}
                      // 点击只**选中**，动作交给详情卡上的按钮——
                      // 原来点一下直接拿到手上，想看看这是什么都做不到
                      onClick={() => setPicked(stack ? slot : null)}
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

            <div className="pack-detail md:flex-[2]">
              <ItemDetail
                stack={pickedStack ?? null}
                count={pickedStack?.count ?? 0}
                slotRef={pickedStack ? picked : null}
                onUsed={() => setPicked(null)}
              />
            </div>
          </div>

          {/*
           * 快捷栏那一行**搬进面板里**。
           *
           * 面板现在是全屏遮罩式的，屏幕底部真正的快捷栏被压在遮罩下面，
           * 拖不过去——底栏还写着"拖到下方快捷栏"，等于骗人。
           * 把它放进面板是这类游戏的通行结构（Minecraft 起就是这样）：
           * 拖拽全程在面板内部完成，不需要穿透遮罩。
           *
           * 它和屏幕底部那一行是**同一份数据**（都是背包的前 8 格），
           * 不是复制品——改一边另一边跟着变。
           */}
          <div className="ui-parchment mt-3 p-2">
            <div className="grid grid-cols-8 gap-1.5 sm:gap-2">
              {hotbarVisible.map((stack, index) => (
                <SlotCell
                  key={index}
                  // 快捷栏就是前 HOTBAR_SIZE 格，段内序号 = 槽位号
                  slotRef={index}
                  stack={stack}
                  fluid
                  label={String(index + 1)}
                  picked={picked === index && Boolean(stack)}
                  onClick={() => setPicked(stack ? index : null)}
                />
              ))}
            </div>
          </div>

          {/* ---- 底栏：操作提示 + 容量 ---- */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px] text-[var(--ink-soft)]">
            <span>{t(isTouchMode() ? "ui.backpack.hint_touch" : "ui.backpack.hint")}</span>
            <span className="font-bold">
              {t("ui.backpack.capacity")} {used} / {INVENTORY_SIZE}
            </span>
          </div>
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
  stack,
  count,
  slotRef,
  onUsed,
}: {
  /**
   * 收整个 stack 而不是光一个 itemId：**盛着菜的盘子，itemId 还是 plate**，
   * 只看 id 就会把"一盘番茄炒蛋"显示成"干净的盘子"。
   */
  stack: SlotStack;
  count: number;
  /** 这件东西在哪一格。"拿到手上"要靠它做槽位移动 */
  slotRef: SlotRef | null;
  onUsed: () => void;
}) {
  // 盘子里盛着菜就按那道菜显示；空盘还是盘子
  const dish = servedDish(stack);
  const itemId = presentedItemId(stack);
  const item = itemId ? findItemDefinition(itemId) : null;

  if (!itemId || !item) {
    return (
      // 窄屏上空详情卡不该占掉半屏高度，给个下限就够了
      <div className="ui-parchment grid h-full min-h-[92px] place-items-center p-4 text-center">
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

  const edible = Boolean(item.food);
  /** 盛在盘里的菜要连盘一起处理：吃掉菜、盘子留下 */
  const eatsFromWare = Boolean(dish) && slotRef !== null;

  return (
    <div className="ui-parchment flex h-full flex-col p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="ui-slot grid h-[56px] w-[56px] shrink-0 place-items-center sm:h-[64px] sm:w-[64px]">
          <ItemIcon itemId={itemId} size={44} />
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

      <p className="mt-3 flex-1 text-[13px] leading-relaxed text-[#5b4028] sm:text-[14px]">
        {t(`${item.localizationKey}.desc`)}
      </p>

      {/*
       * 动作按钮。能做什么由物品能力决定。
       *
       * **没有"放置"按钮了**：拿到手上就是在摆（虚影直接跟着鼠标），
       * 再给一个"放置"就等于同一件事有两个入口，而两个入口迟早会
       * 各自维护一套"现在在不在摆"的状态。
       */}
      <div className="mt-3 flex flex-wrap gap-2">
        {edible && (
          <button
            type="button"
            className="ui-pack-action px-3 py-1.5 text-[13px] font-bold"
            onClick={() => {
              if (eatsFromWare && slotRef) eatFromWare(slotRef);
              else eatInventoryItem(itemId);
              onUsed();
            }}
          >
            {t("ui.backpack.eat")}
          </button>
        )}

        {/*
         * "拿到手上" = 挪进**选中的快捷栏格子**。
         *
         * 手上拿的就是选中那一格，所以这个动作是一次普通的槽位移动，
         * 不再是"从背包扣掉、塞进一个叫手的地方"。
         * 已经在快捷栏里的东西不显示这个按钮——它本来就够得着。
         *
         * 家具也走这个按钮：拿到手上，虚影就出来了。
         */}
        {slotRef !== null && slotRef !== undefined && slotRef >= HOTBAR_SIZE && (
          <button
            type="button"
            className="ui-pack-action px-3 py-1.5 text-[13px] font-bold"
            onClick={() => {
              moveStack(slotRef, getSelectedHotbarIndex());
              onUsed();
            }}
          >
            {t("ui.backpack.take")}
          </button>
        )}
      </div>
    </div>
  );
}
