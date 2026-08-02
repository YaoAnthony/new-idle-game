import { useEffect, useState } from "react";
import { FaArrowsRotate, FaBoxOpen, FaHand, FaRegHandScissors } from "react-icons/fa6";
import { emit, on } from "../../Game/EventBus";
import { t } from "../../i18n/t";
import "./Mobile.css";

/**
 * 触摸端的动作按钮。右手拇指够得到的地方，和左下角的摇杆分居两侧。
 *
 * **按钮发的是 `game_action_requested`，不是伪造的 KeyboardEvent。**
 * 合成键盘事件的 `isTrusted` 是 false，解锁不了音频（本项目踩过这个坑），
 * 而且会把"按了哪个键"和"要做什么"永久焊死——键位以后要可重映射。
 *
 * 按钮**跟着上下文变**，不是一排常驻的死按钮：手机屏幕就那么大，
 * 摆家具时才出现"转方向"，附近有东西可交互时主按钮才亮起来。
 */
export function TouchActions() {
  /** 附近有没有可交互的东西。主按钮靠它决定亮不亮 */
  const [hasTarget, setHasTarget] = useState(false);
  /** 摆放模式：这时候要多一个转方向的按钮 */
  const [placing, setPlacing] = useState(false);
  /** 挡视线的面板 / 对话开着时整组按钮让位，否则会压在面板上 */
  const [blocked, setBlocked] = useState(false);
  const [dialogueOpen, setDialogueOpen] = useState(false);

  useEffect(() => {
    const offs = [
      on("interact_target_changed", (target) => setHasTarget(target !== null)),
      on("placement_mode_changed", ({ active }) => setPlacing(active)),
      on("blocking_panel_changed", ({ open }) => setBlocked(open)),
      on("dialogue_changed", ({ open }) => setDialogueOpen(open)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  if (blocked || dialogueOpen) return null;

  return (
    <div className="touch-actions">
      {placing && (
        <button
          type="button"
          className="touch-button touch-button--small"
          aria-label={t("ui.touch.rotate")}
          onPointerDown={() =>
            emit("game_action_requested", { action: "rotate_placement" })
          }
        >
          <FaArrowsRotate />
        </button>
      )}

      <button
        type="button"
        className="touch-button touch-button--small"
        aria-label={t("ui.backpack")}
        onPointerDown={() => emit("ui_panel_requested", { panel: "backpack" })}
      >
        <FaBoxOpen />
      </button>

      <button
        type="button"
        className="touch-button touch-button--small"
        aria-label={t("ui.touch.throw")}
        onPointerDown={() => emit("game_action_requested", { action: "throw" })}
      >
        <FaRegHandScissors />
      </button>

      {/*
        主按钮最大、最靠下——拇指自然落点在这儿。
        附近有目标时高亮：手机上没有键盘提示行，"现在能不能按"必须写在按钮上。
      */}
      <button
        type="button"
        className={[
          "touch-button",
          "touch-button--primary",
          hasTarget ? "touch-button--ready" : "",
        ].join(" ")}
        aria-label={t("ui.touch.interact")}
        onPointerDown={() =>
          emit("game_action_requested", { action: "interact" })
        }
      >
        <FaHand />
      </button>
    </div>
  );
}
