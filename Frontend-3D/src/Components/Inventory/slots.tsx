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

/**
 * 槽位式背包的共享件：物品图标（生成图 + 文字兜底）、
 * 单个格子、指针式拖拽（跨快捷栏/背包）、悬浮介绍。
 */

export function ItemIcon({ itemId, size = 44 }: { itemId: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const item = findItemDefinition(itemId);

  if (broken || !item) {
    return (
      <span
        className="grid place-items-center text-center text-[11px] leading-tight text-[#4a3020]"
        style={{ width: size, height: size }}
      >
        {item ? t(item.localizationKey) : itemId}
      </span>
    );
  }

  return (
    <img
      src={`/icons/${itemId}.png`}
      alt={t(item.localizationKey)}
      draggable={false}
      className="pointer-events-none select-none object-contain"
      style={{ width: size, height: size }}
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
 * 手指/鼠标移动超过这么多像素才算"在拖"，否则算一次点击。
 *
 * 有阈值之前，按下就立刻进入拖拽状态并 `preventDefault()`——
 * 而按规范，在 pointerdown 上 preventDefault 会**连带取消后续的 click**。
 * 结果是：装了东西的格子永远收不到 onClick，点了没反应。
 * 拖拽和点击要在同一个格子上共存，就得靠阈值区分，不能靠抢先。
 */
const DRAG_THRESHOLD_PX = 4;

export function beginDrag(event: ReactPointerEvent, from: SlotRef): void {
  const stack = getStackAt(from);
  if (!stack) return;

  const originX = event.clientX;
  const originY = event.clientY;
  let started = false;

  const onMove = (move: globalThis.PointerEvent) => {
    if (!started) {
      const moved = Math.hypot(move.clientX - originX, move.clientY - originY);
      if (moved < DRAG_THRESHOLD_PX) return;

      started = true;
      setDrag({ from, stack, x: move.clientX, y: move.clientY });
      return;
    }

    if (current) setDrag({ ...current, x: move.clientX, y: move.clientY });
  };

  const onUp = (up: globalThis.PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);

    // 没越过阈值：这是一次点击，什么都不做，让 click 事件自己去处理
    if (!started) return;

    const under = document.elementFromPoint(up.clientX, up.clientY);
    // 自定义落点优先：放入框是压在格子上方的，先问它要不要
    const zone = under?.closest<HTMLElement>("[data-dropzone]");
    const dropTarget = under?.closest<HTMLElement>("[data-slot]");

    if (zone && current) {
      dropZones.get(zone.dataset.dropzone!)?.(current.from);
    } else if (dropTarget && current) {
      const [container, index] = dropTarget.dataset.slot!.split(":");
      moveStack(current.from, {
        container: container as SlotRef["container"],
        index: Number(index),
      });
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
  size?: number;
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
  dimmed = false,
  picked = false,
  onHover,
  onLeave,
  onClick,
}: SlotCellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useDragState();
  const isDragSource =
    drag &&
    drag.from.container === slotRef.container &&
    drag.from.index === slotRef.index;

  const rarity = stack ? findItemDefinition(stack.itemId)?.rarity : undefined;

  return (
    <div
      ref={ref}
      data-slot={`${slotRef.container}:${slotRef.index}`}
      className={[
        "ui-slot",
        selected || picked ? "ui-slot--selected" : "",
        picked ? "ui-slot--picked" : "",
        dimmed ? "ui-slot--dimmed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: size, height: size }}
      onPointerDown={(event) => {
        if (event.button === 0 && stack) beginDrag(event, slotRef);
      }}
      onPointerEnter={() => {
        if (stack && ref.current) onHover?.(stack.itemId, ref.current);
      }}
      onPointerLeave={onLeave}
      onClick={onClick}
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
          <ItemIcon itemId={stack.itemId} size={size - 14} />
          {stack.count > 1 && (
            <span className="absolute bottom-0.5 right-1 text-[12px] font-bold text-[#3d2817] [text-shadow:0_1px_0_rgb(255_248_225),0_0_3px_rgb(255_248_225)]">
              {stack.count}
            </span>
          )}
        </>
      )}
    </div>
  );
}
