import { useEffect, useState } from "react";
import { FaBoxOpen } from "react-icons/fa6";
import { emit, on } from "../../Game/EventBus";
import {
  getHotbar,
  getSelectedHotbarIndex,
  HOTBAR_SIZE,
  selectHotbarSlot,
} from "../../Game/State/inventory";
import { isTouchMode } from "../../Game/State/touchMode";
import { ItemTooltip, SlotCell, useTooltip } from "../Inventory/slots";
import { t } from "../../i18n/t";

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
          {/*
            `ui-dash` 是贴着框内侧那圈虚线（index.css）。整条快捷栏和格子
            都是奶油底，不加这圈的话八个格子会和底板糊成一片浅色。
          */}
          <div
            className={[
              "ui-bar ui-dash absolute left-1/2 flex -translate-x-1/2",
              touch ? "touch-hotbar gap-1.5 p-2" : "bottom-4 z-10 gap-2 p-2.5",
            ].join(" ")}
          >
            {slots.map((stack, index) => (
              <SlotCell
                key={index}
                slotRef={index}
                stack={stack}
                selected={selected === index}
                // 触摸端不显示数字：那是键盘 1-8 的提示，手机上没有键盘，
                // 而格子已经被压缩过，多一个角标只会更挤
                label={touch ? undefined : String(index + 1)}
                onHover={show}
                onLeave={hide}
                onClick={() => selectHotbarSlot(index)}
                // 桌面端 62 而不是默认的 56：选中格现在会抬起来 + 放大 4%，
                // 原尺寸下这一下位移几乎看不出来，格子大一点动效才读得到
                size={touch ? 38 : 62}
              />
            ))}

            {/*
              触摸端在最右边多挂一格：**开背包**。

              手机上没有 B 键，而原来唯一的入口是右下角动作按钮堆里那个箱子
              图标——那一堆是"对着世界做事"的动词（转方向/扔/交互），
              开背包是看自己的东西，混在里面既不好找也不好按。挂在快捷栏尾巴上
              才对得上：快捷栏本来就是背包露在外面的那八格，"还有更多"
              自然就在这一排的末尾。

              桌面端不加：那边 B 键就是入口，多一个格子只会让八格变九格，
              数字键和格子的一一对应当场糊掉。
            */}
            {touch && (
              <button
                type="button"
                className="ui-slot grid place-items-center text-[16px] text-[var(--ink-soft)]"
                style={{ width: 38, height: 38 }}
                aria-label={t("ui.backpack")}
                onPointerDown={() =>
                  emit("ui_panel_requested", { panel: "backpack" })
                }
              >
                <FaBoxOpen />
              </button>
            )}
          </div>
          {/*
            操作提示行已删除。它把 B/F/Q/R/滚轮/右键六件事一次性糊在屏幕
            底部，长年占着画面正中央那一条——而这些键玩家按几次就记住了，
            属于"学一次"的知识，不该常驻。真要查，命令行里还能问。
            （对应的 i18n 键 ui.help.controls 一并从 t.ts 移除。）
          */}
        </>
      )}
      <ItemTooltip tooltip={tooltip} />
    </>
  );
}
