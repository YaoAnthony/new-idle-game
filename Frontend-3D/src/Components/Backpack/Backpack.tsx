import { useEffect, useState } from "react";
import { emit, on } from "../../Game/EventBus";
import { BACKPACK_SIZE, getBackpack } from "../../Game/State/inventory";
import { useInventoryItem } from "../../Game/Systems/itemUse";
import { t } from "../../i18n/t";
import {
  DragGhost,
  ItemTooltip,
  SlotCell,
  useTooltip,
} from "../Inventory/slots";

/**
 * 背包面板（B 开关）：皮革书包造型（参考图式样），
 * 4 行 × 6 列格子铺在羊皮纸内衬上，物品可拖到快捷栏。
 */
export function Backpack() {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState(getBackpack());
  const { tooltip, show, hide } = useTooltip();

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

  return (
    <>
      {open && (
        <div className="ui-satchel absolute right-6 top-1/2 z-20 aspect-square w-[min(660px,48vw)] -translate-y-1/2">
          {/* 标题写在皮包挂牌上（像素图挂牌约在 y 21%） */}
          <div className="absolute left-1/2 top-[20.5%] w-[38%] -translate-x-1/2 text-center text-[19px] font-bold tracking-[0.3em] text-[#5d4028]">
            {t("ui.backpack")}
          </div>
          <button
            type="button"
            className="absolute right-[13%] top-[12%] z-10 grid h-9 w-9 place-items-center rounded-md border-2 border-[#4a2c1a] bg-[#c0392b] text-[15px] font-bold text-white shadow hover:brightness-110"
            aria-label="关闭"
            onClick={() => setOpen(false)}
          >
            ×
          </button>

          {/* 格子铺进羊皮纸内衬区域（约 y 43%~80%），提示也收在纸内 */}
          <div className="absolute inset-x-0 top-[43%] flex flex-col items-center">
            <div className="grid w-fit grid-cols-6 gap-1.5">
              {slots.slice(0, BACKPACK_SIZE).map((stack, index) => (
                <SlotCell
                  key={index}
                  slotRef={{ container: "backpack", index }}
                  stack={stack}
                  size={50}
                  onHover={show}
                  onLeave={hide}
                  // 点一下就端到手上（食材要下锅得先在手上）。
                  // 家具类不给 onPlacement——布置模式仍然只从快捷栏进
                  onClick={() => {
                    if (stack) useInventoryItem(stack.itemId);
                  }}
                />
              ))}
            </div>
            <div className="mt-1.5 text-center text-[10px] text-[#a08560]">
              点击拿到手上 · 拖动到下方快捷栏 · B 关闭
            </div>
          </div>
        </div>
      )}
      <DragGhost />
      <ItemTooltip tooltip={tooltip} />
    </>
  );
}
