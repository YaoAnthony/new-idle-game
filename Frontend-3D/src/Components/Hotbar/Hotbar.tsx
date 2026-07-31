import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { getHotbar, HOTBAR_SIZE } from "../../Game/State/inventory";
import { useInventoryItem } from "../../Game/Systems/itemUse";
import {
  ItemTooltip,
  SlotCell,
  useTooltip,
} from "../Inventory/slots";

/**
 * 快捷栏：8 个真实槽位（参考图式样：编号 + 物品图标 + 数量）。
 * 数字键 1-8 选中；选中的家具物品进入布置模式。
 * 从背包拖过来的东西会落在具体格子里。
 */

type HotbarProps = {
  onSelectFurniture: (itemId: string) => void;
};

export function Hotbar({ onSelectFurniture }: HotbarProps) {
  const useItem = (itemId: string): void => {
    useInventoryItem(itemId, { onPlacement: onSelectFurniture });
  };

  const [slots, setSlots] = useState(getHotbar());
  const [selected, setSelected] = useState(0);
  // 对话时整条快捷栏让位（动森做法）——否则对话框底部的继续三角正好压在上面
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const { tooltip, show, hide } = useTooltip();

  useEffect(() => {
    return on("inventory_changed", () => setSlots(getHotbar()));
  }, []);

  useEffect(() => {
    return on("dialogue_changed", ({ open }) => setDialogueOpen(open));
  }, []);

  useEffect(() => {
    if (dialogueOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      const index = Number(event.key) - 1;
      if (Number.isNaN(index) || index < 0 || index >= HOTBAR_SIZE) return;

      setSelected(index);
      const stack = getHotbar()[index];
      if (stack) useItem(stack.itemId);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSelectFurniture, dialogueOpen]);

  const selectSlot = (index: number) => {
    setSelected(index);
    const stack = slots[index];
    if (stack) useItem(stack.itemId);
  };

  return (
    <>
      {!dialogueOpen && (
        <>
          <div className="ui-bar absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-xl p-2">
            {slots.map((stack, index) => (
              <SlotCell
                key={index}
                slotRef={{ container: "hotbar", index }}
                stack={stack}
                selected={selected === index}
                label={String(index + 1)}
                onHover={show}
                onLeave={hide}
                onClick={() => selectSlot(index)}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute bottom-[86px] left-1/2 z-10 -translate-x-1/2 text-[11px] text-white/55">
            B 背包 · F 使用 · 拖动左键转镜头 · 滚轮缩放 · 右键拿起家具 · 布置时 ↑↓←→ 微调 · R 旋转 · Esc 取消
          </div>
        </>
      )}
      <ItemTooltip tooltip={tooltip} />
    </>
  );
}
