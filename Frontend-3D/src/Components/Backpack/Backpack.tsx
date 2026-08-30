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
import { Modal } from "../Modal/Modal";
import { BagSeal } from "../Modal/seals";
import { DragGhost, ItemIcon, SlotCell } from "../Inventory/slots";
import { Bubble } from "../Bubble/Bubble";
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
  /**
   * 小屏（横屏手机）模式。判**高度**不判宽度——这游戏只做横屏，
   * "手机"意味着矮，宽反而可能不小（667×375）。和白噪音台的
   * `@media (max-height: 500px)` 同一条线。
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

  /**
   * 小屏详情气泡的锚点（被点那一格的屏幕矩形）。
   *
   * 手机上右侧详情栏整个藏掉（2026-08-30 用户定的）：格子已经只有
   * 30px，再切 230px 给常驻侧栏，格子就没法看了。点一格 → 详情以
   * **漂浮气泡**的形式出现在格子旁边，内容和大屏侧栏是同一个
   * `ItemDetail`——一份组件两种容器，不是两套详情。
   */
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

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

  // 选中没了（用掉/清空/关面板）气泡跟着收，别留一张挂在半空的详情
  useEffect(() => {
    if (picked === null) setAnchor(null);
  }, [picked]);

  /** 选中格子里的东西。格子被清空（拿到手上、整理重排）后自动松开选中 */
  const pickedStack = picked === null ? null : items[picked] ?? null;

  const matchesTab = useMemo(() => {
    return (itemId: string): boolean => {
      if (tab === null) return true;
      return findItemDefinition(itemId)?.category === tab;
    };
  }, [tab]);

  const tabHasAny = visible.some((stack) => stack && matchesTab(stack.itemId));

  /*
   * **不能在这儿早退。** 原来关着就只渲染 DragGhost，而现在挂载与否归
   * Modal 管（它要留着播 exit 动画）。这里早退的话 Modal 连 open=false
   * 都收不到，关闭动画一帧也不会有。DragGhost 本来就在下面渲染着。
   */

  return (
    <>
      {/*
        外壳交给 `Modal`（同心厚框 + 印章绽开），和行动、每日任务同一套。
        原来那层遮罩、z-40 分层、点空白关闭全部搬进 `.modal-stage`。
        **`instant`：背包一局要开几十次**，1.8 秒的绽开仪式在这儿会从
        "有质感"变成"卡"。仪式留给不常开的面板。
      */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        seal={<BagSeal />}
        frameColor="#7a5aa8"
        paperColor="#fdfbf7"
        label={t("ui.backpack")}
        /*
         * 收到内容该有的大小，别铺满整屏（2026-08-30，用户："背包的 UI
         * 太大了"）。没有 aspect 时 Modal 四边只留 --modal-outer，宽屏上
         * 面板 1900px 宽、格子被列数均分撑成 180px 的大方块——尺寸是
         * 屏幕给的，不是内容要的。1.9 是"格子区 + 侧详情"这个横排版式
         * 自己的比例；fill 再收一成，面板读起来是"摆在桌上的包"。
         * **手机（矮屏）不收**：323px 的内胆再打九折，格子会被压成
         * 4px 的碎屑——小屏本来就一寸都不多，铺满是唯一可行解。
         */
        aspect={phone ? undefined : 1.9}
        fill={phone ? undefined : 0.9}
        instant
      >
        {/*
          `min-h-0` 不能省：外层是 grid 居中，而 grid 项的 `min-height` 默认是
          `auto`——意思是"不许收缩到内容最小高度以下"，它会**直接顶掉
          `max-h-full`**。横屏手机（高 414）上实测面板撑到 603px，底部整排
          格子被裁在屏幕外，而且因为面板自己没超出，内层的 overflow 也不触发。
        */}
        {/*
          尺寸交给外壳。原来这里自己写死 `w-[min(1100px,96vw)]` + `max-h-full`
          ——那是"自己就是最外层"时的算法，现在它装在 Modal 的内胆里，
          按视口算出来的宽度比内胆还宽，右边的 ✕ 和容量数字直接被裁掉。
          `.ui-pack` 那层奶油渐变底也去掉：内胆已经是底了，两层叠着是脏色。
        */}
        <div className="flex h-full min-h-0 w-full flex-col p-3">
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
                className="ui-wood-btn grid h-11 w-11 shrink-0 place-items-center text-[16px] font-bold sm:hidden"
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
              className="ui-wood-btn hidden h-11 w-11 shrink-0 place-items-center text-[16px] font-bold sm:grid"
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
          <div
            className="pack-body flex min-h-0 flex-1 flex-col gap-3 md:flex-row"
            /*
             * 小屏气泡的锚点在**捕获阶段**顺手记下：被点的格子按钮的
             * 屏幕矩形。不改 SlotCell 的 onClick 签名——它被五个面板
             * 共用，为一个气泡加参数会让其他调用点全跟着改。
             */
            onClickCapture={(event) => {
              if (!phone) return;
              // SlotCell 的根是带 .ui-slot 的 div（拖拽要 pointer 事件），
              // 不是 button——closest 认类名不认标签
              const cell = (event.target as HTMLElement).closest(".ui-slot");
              if (!cell) return;
              const rect = cell.getBoundingClientRect();
              setAnchor({ x: rect.left + rect.width / 2, y: rect.top });
            }}
          >
            {/*
              左列 = 背包格子 + 快捷栏，**共享同一条 10 列轨道**（2026-08-30
              用户定的端游版式）。两块各画各的 grid 但列数、max-w、gap 全同，
              格子因此严格等大、左边缘对齐——快捷栏就是"背包的第 0 行"
              这个事实终于长在版式上（数据上它本来就是前 8 格）。
            */}
            <div className="flex min-h-0 min-w-0 flex-col gap-3 md:flex-1">
            {/*
              滚动只发生在格子区内部：快捷栏钉在列底**永远可见**——
              它是"手上有什么"，被滚出视野的话拖拽就变成盲拖。
              列宽两块共享（同 max-w 同列数），滚动行为不必共享。
            */}
            <div className="pack-grid ui-parchment min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
              {/*
                **固定 10 格一行、起步 5 行**（2026-08-30 用户定的）。
                中间试过一版 auto-fill 自适应列数，被否了——背包的格局
                该是玩家背下来的一张脸："第三行最右是我的锤子"这种空间
                记忆，列数随窗口变就没了。行数是以后的扩容轴（"一开始
                只有 5 行"），列数不是。格宽 = 列宽 ÷ 10 再由 max-w-[720px]
                封顶（一格 ~64px 到头）——大屏上面板可以大，格子的
                手感不变。
              */}
              <div className="mx-auto grid w-full max-w-[720px] grid-cols-10 gap-1.5 sm:gap-2">
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

            {/*
              快捷栏（就是背包前 8 格的同一份数据，不是复制品）。
              和上面用**同一条 10 列轨道**：8 格占前 8 轨、后两轨留空，
              列宽因此和背包格完全一致——"双方格子大小一样"靠共享轨道
              保证，不靠两边各调一个数。拖拽全程在面板内完成。
            */}
            <div className="ui-parchment shrink-0 p-2 sm:p-3">
              <div className="mx-auto grid w-full max-w-[720px] grid-cols-10 gap-1.5 sm:gap-2">
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
            </div>

            {/*
              详情是**固定宽侧栏**不再按比例分（flex-[2] 在宽屏上摊出
              600px 的空白卡）。230px 装得下图标+名字+两个按钮，多一寸
              都是留白；省下的全让给 10 列的格子区。
              **小屏整个不渲染**：详情走下面的漂浮气泡。
            */}
            {!phone && (
              <div className="pack-detail md:w-[230px] md:flex-none">
                <ItemDetail
                  stack={pickedStack ?? null}
                  count={pickedStack?.count ?? 0}
                  slotRef={pickedStack ? picked : null}
                  onUsed={() => setPicked(null)}
                />
              </div>
            )}
          </div>

          {/*
            小屏的详情气泡：通用 `Bubble`（带尾巴、自动上下翻、点外面关）
            + 手机专用的紧凑详情。第一版直接把大屏侧栏的 ItemDetail 塞进来
            ——被用户打回：那套是给 230px 常驻栏画的（大图标、大段落、
            ui-pack-action 旧皮大按钮），压进 248px 的浮层里既丑又点不准。
          */}
          {phone && anchor && pickedStack && (
            <Bubble anchor={anchor} onDismiss={() => setPicked(null)}>
              <ItemDetailCompact
                stack={pickedStack}
                count={pickedStack.count}
                slotRef={picked}
                onUsed={() => setPicked(null)}
              />
            </Bubble>
          )}


          {/* ---- 底栏：操作提示 + 容量 ---- */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px] text-[var(--ink-soft)]">
            <span>{t(isTouchMode() ? "ui.backpack.hint_touch" : "ui.backpack.hint")}</span>
            <span className="font-bold">
              {t("ui.backpack.capacity")} {used} / {INVENTORY_SIZE}
            </span>
          </div>
        </div>
      </Modal>

      <DragGhost />
    </>
  );
}

/**
 * 一件物品在详情里能做的动作。**大屏侧栏和手机气泡共用这一份**——
 * "吃掉"到底吃盘里的菜还是背包里的存货，这类判断只许存在一处，
 * 两版 UI 各写一遍的话迟早一边吃盘子一边吃菜。
 */
function useItemActions(
  stack: SlotStack,
  slotRef: SlotRef | null,
  onUsed: () => void,
) {
  const dish = servedDish(stack);
  const itemId = presentedItemId(stack);
  const item = itemId ? findItemDefinition(itemId) : null;
  const eatsFromWare = Boolean(dish) && slotRef !== null;

  return {
    itemId,
    item,
    edible: Boolean(item?.food),
    // 已经在快捷栏里的东西不给"拿到手上"——它本来就够得着
    canTake: slotRef !== null && slotRef !== undefined && slotRef >= HOTBAR_SIZE,
    eat: () => {
      if (!itemId) return;
      if (eatsFromWare && slotRef !== null) eatFromWare(slotRef);
      else eatInventoryItem(itemId);
      onUsed();
    },
    take: () => {
      if (slotRef === null || slotRef === undefined) return;
      moveStack(slotRef, getSelectedHotbarIndex());
      onUsed();
    },
  };
}

/**
 * 手机气泡里的紧凑详情（2026-08-30 重写）。
 *
 * 大屏那版 `ItemDetail` 是给 230px **常驻侧栏**画的：64px 图标、整段
 * 描述、旧皮大按钮——塞进 248px 的浮层里"吃掉"按钮比格子还占地方。
 * 这版按"手机上一眼一拇指"重排：一行头（小图标+名字+数量）、小胶囊
 * 标签、两行截断的描述、**通宽的胶囊按钮**（高 36px，拇指目标；皮是
 * 日记本语言的实心+硬投影：吃掉琥珀、拿到手上青绿，按下沉 3px）。
 */
function ItemDetailCompact({
  stack,
  count,
  slotRef,
  onUsed,
}: {
  stack: SlotStack;
  count: number;
  slotRef: SlotRef | null;
  onUsed: () => void;
}) {
  const { itemId, item, edible, canTake, eat, take } = useItemActions(
    stack,
    slotRef,
    onUsed,
  );
  if (!itemId || !item) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <div className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-[10px] border-2 border-[#EEEEEE] bg-[#FAFAFA]">
          <ItemIcon itemId={itemId} size={30} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-black leading-tight text-[#5D4037]">
            {t(item.localizationKey)}
            {count > 1 && (
              <span className="ml-1.5 text-[12px] font-bold text-[#8D6E63]">
                ×{count}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            <span className="rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[10px] font-bold text-[#8D6E63] shadow-[inset_0_-1px_0_#E0E0E0]">
              {t(TAB_KEY[item.category] ?? item.category)}
            </span>
            <span className="rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[10px] font-bold text-[#8D6E63] shadow-[inset_0_-1px_0_#E0E0E0]">
              {t(`ui.rarity.${item.rarity}`)}
            </span>
          </div>
        </div>
      </div>

      <p className="line-clamp-2 text-[12px] leading-snug text-[#8D6E63]">
        {t(`${item.localizationKey}.desc`)}
      </p>

      {(edible || canTake) && (
        <div className="flex gap-2">
          {edible && (
            <button
              type="button"
              className="h-[36px] flex-1 cursor-pointer rounded-full bg-[#FFCA28] text-[13px] font-black tracking-wide text-white shadow-[0_3px_0_#FF8F00] transition-all hover:bg-[#FFB300] active:translate-y-[3px] active:shadow-none"
              onClick={eat}
            >
              {t("ui.backpack.eat")}
            </button>
          )}
          {canTake && (
            <button
              type="button"
              className="h-[36px] flex-1 cursor-pointer rounded-full bg-[#4DB6AC] text-[13px] font-black tracking-wide text-white shadow-[0_3px_0_#00897B] transition-all hover:bg-[#26A69A] active:translate-y-[3px] active:shadow-none"
              onClick={take}
            >
              {t("ui.backpack.take")}
            </button>
          )}
        </div>
      )}
    </div>
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
  const { itemId, item, edible, canTake, eat, take } = useItemActions(
    stack,
    slotRef,
    onUsed,
  );

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
            onClick={eat}
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
        {canTake && (
          <button
            type="button"
            className="ui-pack-action px-3 py-1.5 text-[13px] font-bold"
            onClick={take}
          >
            {t("ui.backpack.take")}
          </button>
        )}
      </div>
    </div>
  );
}
