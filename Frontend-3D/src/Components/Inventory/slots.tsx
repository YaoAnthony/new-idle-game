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

export function beginDrag(event: ReactPointerEvent, from: SlotRef): void {
  const stack = getStackAt(from);
  if (!stack) return;

  event.preventDefault();
  setDrag({ from, stack, x: event.clientX, y: event.clientY });

  const onMove = (move: globalThis.PointerEvent) => {
    if (current) setDrag({ ...current, x: move.clientX, y: move.clientY });
  };

  const onUp = (up: globalThis.PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);

    const dropTarget = document
      .elementFromPoint(up.clientX, up.clientY)
      ?.closest("[data-slot]");
    if (dropTarget && current) {
      const [container, index] = (dropTarget as HTMLElement).dataset.slot!.split(":");
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

  return (
    <div
      ref={ref}
      data-slot={`${slotRef.container}:${slotRef.index}`}
      className={["ui-slot", selected ? "ui-slot--selected" : ""].join(" ")}
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
        <span className="absolute left-1 top-0.5 text-[10px] font-bold text-[#8a6a48]">
          {label}
        </span>
      )}
      {stack && !isDragSource && (
        <>
          <ItemIcon itemId={stack.itemId} size={size - 14} />
          {stack.count > 1 && (
            <span className="absolute bottom-0.5 right-1 text-[11px] font-bold text-[#3d2817] [text-shadow:0_1px_0_rgb(255_248_225)]">
              {stack.count}
            </span>
          )}
        </>
      )}
    </div>
  );
}
