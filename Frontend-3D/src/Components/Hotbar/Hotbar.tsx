import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import {
  getHotbar,
  getSelectedHotbarIndex,
  HOTBAR_SIZE,
  selectHotbarSlot,
} from "../../Game/State/inventory";
import { isTouchMode } from "../../Game/State/touchMode";
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
  const [touch, setTouch] = useState(isTouchMode());
  const { tooltip, show, hide } = useTooltip();

  useEffect(() => on("touch_mode_changed", ({ touch: next }) => setTouch(next)), []);

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
          {/*
            触摸端整条快捷栏上移，给底部的摇杆和动作按钮让出位置——
            不让的话按钮会直接压在格子上，只露出最左边两格（实测过）。
            安全区那一份是全面屏底部的 Home 指示条，不避让就点不到最下面一排。
          */}
          <div
            className={[
              "ui-bar absolute left-1/2 flex -translate-x-1/2 rounded-xl",
              touch ? "touch-hotbar gap-1 p-1.5" : "bottom-3 z-10 gap-1.5 p-2",
            ].join(" ")}
          >
            {slots.map((stack, index) => (
              <SlotCell
                key={index}
                slotRef={{ container: "hotbar", index }}
                stack={stack}
                selected={selected === index}
                // 触摸端不显示数字：那是键盘 1-8 的提示，手机上没有键盘，
                // 而格子已经被压缩过，多一个角标只会更挤
                label={touch ? undefined : String(index + 1)}
                onHover={show}
                onLeave={hide}
                onClick={() => selectHotbarSlot(index)}
                size={touch ? 38 : undefined}
              />
            ))}
          </div>
          {/*
            操作提示行**只给键盘用户看**。它讲的全是 B/F/Q/R/滚轮/右键，
            手机上一个都按不了，却要占掉四行高度压在画面上（实测）。
            触摸端的"现在能按什么"写在按钮本身上（主按钮会高亮）。
          */}
          {!touch && (
            <div className="pointer-events-none absolute bottom-[86px] left-1/2 z-10 -translate-x-1/2 text-[11px] text-white/55">
              {t("ui.help.controls")}
            </div>
          )}
        </>
      )}
      <ItemTooltip tooltip={tooltip} />
    </>
  );
}
