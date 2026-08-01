import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import {
  getHotbar,
  getSelectedHotbarIndex,
  HOTBAR_SIZE,
  selectHotbarSlot,
} from "../../Game/State/inventory";
import { t } from "../../i18n/t";
import { ItemTooltip, SlotCell, useTooltip } from "../Inventory/slots";

/**
 * 快捷栏：8 个真实槽位。数字键 1-8 或点击**只换选中格**。
 *
 * 选中格就是手上拿着的那一格（见 State/inventory 的 selectedHotbarIndex），
 * 所以换手不搬运任何东西，只改一个下标。
 *
 * **按数字键不再"使用"物品**：原来按一下就吃掉/进布置模式，
 * 于是想看看 3 号格是什么，一按就把菜吃了。使用统一交给 F
 * （帮助行里写的就是"F 使用"）。
 */

export function Hotbar() {
  const [slots, setSlots] = useState(getHotbar());
  const [selected, setSelected] = useState(getSelectedHotbarIndex());
  // 对话时整条快捷栏让位（动森做法）——否则对话框底部的继续三角正好压在上面
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const { tooltip, show, hide } = useTooltip();

  useEffect(() => {
    return on("inventory_changed", () => setSlots(getHotbar()));
  }, []);

  // 选中格是全局状态，别处也可能改它（读档、脚本），所以订阅而不是只在本地记
  useEffect(() => {
    return on("held_changed", () => setSelected(getSelectedHotbarIndex()));
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

      selectHotbarSlot(index);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogueOpen]);

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
                onClick={() => selectHotbarSlot(index)}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute bottom-[86px] left-1/2 z-10 -translate-x-1/2 text-[11px] text-white/55">
            {t("ui.help.controls")}
          </div>
        </>
      )}
      <ItemTooltip tooltip={tooltip} />
    </>
  );
}
