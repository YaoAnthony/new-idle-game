import { findItemDefinition } from "core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  getStackAt,
  moveStack,
  type SlotRef,
  type SlotStack,
} from "../../Game/State/inventory";
import { t } from "../../i18n/t";
import { recordCoverUrl } from "../../Data/music/albums";
import { blueprintIconUrl } from "../../Buildings/index";
import { presentedItemId } from "../../Game/Systems/servedDish";

/**
 * 槽位式背包的共享件：物品图标（生成图 + 文字兜底）、
 * 单个格子、指针式拖拽（跨快捷栏/背包）、悬浮介绍。
 */

/**
 * `fluid` = 尺寸交给格子撑（占父容器的百分比），不写死像素。
 * 自适应布局下格子本身会随屏幕变大变小，图标必须跟着走。
 */
export function ItemIcon({
  itemId,
  size = 44,
  fluid = false,
}: {
  itemId: string;
  size?: number;
  fluid?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const item = findItemDefinition(itemId);
  const sizing = fluid ? undefined : { width: size, height: size };
  /*
   * 有两类物品的图**不在 `/icons/<id>.png`，而是从它指向的东西那儿借的**：
   * 唱片借专辑封面（文件夹里的 curver.png），图纸借那栋楼初始等级的图。
   * 都是"加一个自动就有图标"，不用为每一件再画一张。
   */
  const src =
    recordCoverUrl(itemId) ?? blueprintIconUrl(itemId) ?? `/icons/${itemId}.png`;

  if (broken || !item) {
    return (
      <span
        className={`grid place-items-center text-center leading-tight text-[#4a3020] ${
          fluid ? "h-[74%] w-[74%] text-[clamp(9px,1.4vw,12px)]" : "text-[11px]"
        }`}
        style={sizing}
      >
        {item ? t(item.localizationKey) : itemId}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={t(item.localizationKey)}
      draggable={false}
      className={`pointer-events-none select-none object-contain ${
        fluid ? "h-[74%] w-[74%]" : ""
      }`}
      style={sizing}
      onError={() => setBroken(true)}
    />
  );
}

// ---- 拖拽状态（模块级，Hotbar 和 Backpack 共享同一次拖拽） ----

type DragState = {
  from: SlotRef;
  stack: NonNullable<SlotStack>;
  x: number;
  y: number;
};

let listeners: Array<(state: DragState | null) => void> = [];
let current: DragState | null = null;

function setDrag(state: DragState | null): void {
  current = state;
  for (const listener of listeners) listener(state);
}

export function useDragState(): DragState | null {
  const [state, setState] = useState<DragState | null>(current);
  useEffect(() => {
    listeners.push(setState);
    return () => {
      listeners = listeners.filter((entry) => entry !== setState);
    };
  }, []);
  return state;
}

/**
 * 非槽位的落点（送礼的放入框这类）。
 *
 * 拖拽本身不认识送礼——落点自己登记一个 id，拖到 `data-dropzone="<id>"`
 * 上就把来源槽位交给它。这样以后加"扔进壁炉""喂给宠物"都不用回来改拖拽。
 */
export type DropZoneHandler = (from: SlotRef) => void;

const dropZones = new Map<string, DropZoneHandler>();

export function registerDropZone(id: string, handler: DropZoneHandler): () => void {
  dropZones.set(id, handler);
  return () => {
    if (dropZones.get(id) === handler) dropZones.delete(id);
  };
}

/**
 * 移动没超过这么多像素就算一次点击，不算拖拽。
 *
 * 只用来区分"点"和"拖"，**不用来推迟幽灵出现**——按下就该看见东西
 * 跟着手走，等移够 4px 才冒出来会像凭空跳一下。
 */
const DRAG_THRESHOLD_PX = 4;

/**
 * 按下一个格子。返回后由 pointerup 决定这是拖拽还是点击。
 *
 * `onTap` 是**点击的正规出口**，不要指望 DOM 的 click 事件：
 * 这里必须 `preventDefault()`，否则浏览器会把按住不放当成原生拖拽接管过去，
 * pointermove 随之停发——幽灵会卡在第一次移动的位置不动，松手时物品
 * 直接出现在目标格，看着就是"瞬移"。而 preventDefault 又会**连带取消
 * 后续的 click**（规范如此）。两件事只能一起解决：原生行为全挡掉，
 * 点击自己从 pointerup 派发。
 */
export function beginDrag(
  event: ReactPointerEvent,
  from: SlotRef,
  onTap?: () => void,
): void {
  const stack = getStackAt(from);
  if (!stack) return;

  event.preventDefault();

  const originX = event.clientX;
  const originY = event.clientY;
  let moved = false;

  // 按下就出幽灵，和改动之前一样——手感差别全在这一下
  setDrag({ from, stack, x: originX, y: originY });

  const onMove = (move: globalThis.PointerEvent) => {
    if (
      !moved &&
      Math.hypot(move.clientX - originX, move.clientY - originY) >=
        DRAG_THRESHOLD_PX
    ) {
      moved = true;
    }
    if (current) setDrag({ ...current, x: move.clientX, y: move.clientY });
  };

  const onUp = (up: globalThis.PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);

    // 几乎没动 = 这是一次点击，不做投放
    if (!moved) {
      setDrag(null);
      onTap?.();
      return;
    }

    const under = document.elementFromPoint(up.clientX, up.clientY);
    // 自定义落点优先：放入框是压在格子上方的，先问它要不要
    const zone = under?.closest<HTMLElement>("[data-dropzone]");
    const dropTarget = under?.closest<HTMLElement>("[data-slot]");

    if (zone && current) {
      dropZones.get(zone.dataset.dropzone!)?.(current.from);
    } else if (dropTarget && current) {
      // data-slot 就是绝对槽位号。越界/非数字由 moveStack 自己挡
      moveStack(current.from, Number(dropTarget.dataset.slot));
    }
    setDrag(null);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

/** 跟随指针的拖拽幽灵。挂在最外层渲染一次 */
export function DragGhost() {
  const drag = useDragState();
  if (!drag) return null;

  return (
    <div
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 opacity-85"
      style={{ left: drag.x, top: drag.y }}
    >
      <ItemIcon itemId={drag.stack.itemId} size={40} />
    </div>
  );
}

// ---- 悬浮介绍 ----

type TooltipState = { itemId: string; x: number; y: number } | null;

export function useTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  const show = useCallback((itemId: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setTooltip({ itemId, x: rect.left + rect.width / 2, y: rect.top - 8 });
  }, []);

  const hide = useCallback(() => setTooltip(null), []);
  return { tooltip, show, hide };
}

export function ItemTooltip({ tooltip }: { tooltip: TooltipState }) {
  if (!tooltip) return null;
  const item = findItemDefinition(tooltip.itemId);
  if (!item) return null;

  return (
    <div
      className="ui-tooltip pointer-events-none fixed z-50 w-[210px] -translate-x-1/2 -translate-y-full rounded-lg px-3 py-2"
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      <div className="text-[13px] font-bold text-[#3d2817]">
        {t(item.localizationKey)}
      </div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-[#6b4a30]">
        {t(`${item.localizationKey}.desc`)}
      </div>
    </div>
  );
}

// ---- 单个格子 ----

type SlotCellProps = {
  slotRef: SlotRef;
  stack: SlotStack;
  selected?: boolean;
  label?: string;
  /** 固定边长（快捷栏这种一行到底的用）。不传 = 由父容器撑满，见 fluid */
  size?: number;
  /** 尺寸交给网格撑：格子占满一个网格单元并保持正方形。自适应布局用 */
  fluid?: boolean;
  /** 被筛选压暗（仍然占位，见 .ui-slot--dimmed 的注释） */
  dimmed?: boolean;
  /** 当前正在详情卡里看的那一格 */
  picked?: boolean;
  onHover?: (itemId: string, element: HTMLElement) => void;
  onLeave?: () => void;
  onClick?: () => void;
};

export function SlotCell({
  slotRef,
  stack,
  selected = false,
  label,
  size = 56,
  fluid = false,
  dimmed = false,
  picked = false,
  onHover,
  onLeave,
  onClick,
}: SlotCellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useDragState();
  const isDragSource = drag?.from === slotRef;

  const rarity = stack ? findItemDefinition(stack.itemId)?.rarity : undefined;

  return (
    <div
      ref={ref}
      data-slot={slotRef}
      className={[
        "ui-slot",
        fluid ? "aspect-square w-full" : "",
        selected || picked ? "ui-slot--selected" : "",
        picked ? "ui-slot--picked" : "",
        dimmed ? "ui-slot--dimmed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={fluid ? undefined : { width: size, height: size }}
      onPointerDown={(event) => {
        if (event.button === 0 && stack) beginDrag(event, slotRef, onClick);
      }}
      onPointerEnter={() => {
        // 盛着菜的盘子要报那道菜，不是"盘子"
        const shown = presentedItemId(stack);
        if (shown && ref.current) onHover?.(shown, ref.current);
      }}
      onPointerLeave={onLeave}
      // **只有空格子走 DOM 的 click**。有物品的格子在 pointerdown 上
      // preventDefault 了，click 本来就不会来；万一某个浏览器还是发了，
      // 这里挡住，免得和 onTap 各触发一次
      onClick={() => {
        if (!stack) onClick?.();
      }}
    >
      {label && (
        <span className="absolute left-1 top-0.5 text-[11px] font-bold text-[#8a6a48]">
          {label}
        </span>
      )}
      {stack && !isDragSource && (
        <>
          {/* 常见档不画环——大多数东西都是常见的，画了等于没画还吵 */}
          {rarity && rarity !== "common" && (
            <span className={`ui-rarity ui-rarity--${rarity}`} />
          )}
          <ItemIcon
            itemId={presentedItemId(stack) ?? stack.itemId}
            size={size - 14}
            fluid={fluid}
          />
          {stack.count > 1 && (
            <span
              className={`absolute bottom-0.5 right-1 font-bold text-[#3d2817] [text-shadow:0_1px_0_rgb(255_248_225),0_0_3px_rgb(255_248_225)] ${
                fluid ? "text-[clamp(10px,1.5vw,13px)]" : "text-[12px]"
              }`}
            >
              {stack.count}
            </span>
          )}
        </>
      )}
    </div>
  );
}
