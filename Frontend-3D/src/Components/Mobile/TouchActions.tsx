import { useEffect, useState } from "react";
import { FaArrowsRotate, FaHand, FaRegHandScissors } from "react-icons/fa6";
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
  /**
   * 摆放模式：这时候要多一个转方向的按钮。
   *
   * **家具虚影和建筑选址都算**：两者都认 `rotatePlacement`（RoomScene 的
   * onKeyDown 里同一个 if 喂给两个控制器），手机上没有键盘，少认一种就等于
   * 那一种在手机上永远转不了方向。选定之后不给转（控制器那边也拒），
   * 按钮跟着收起来，免得点了没反应。
   */
  const [placing, setPlacing] = useState(false);
  const [siting, setSiting] = useState(false);
  /** 挡视线的面板 / 对话开着时整组按钮让位，否则会压在面板上 */
  const [blocked, setBlocked] = useState(false);
  const [dialogueOpen, setDialogueOpen] = useState(false);

  useEffect(() => {
    const offs = [
      on("interact_target_changed", (target) => setHasTarget(target !== null)),
      on("placement_mode_changed", ({ active }) => setPlacing(active)),
      on("building_placement_changed", (next) =>
        setSiting(next.active && !next.committed),
      ),
      on("blocking_panel_changed", ({ open }) => setBlocked(open)),
      on("dialogue_changed", ({ open }) => setDialogueOpen(open)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  if (blocked || dialogueOpen) return null;

  return (
    <div className="touch-actions">
      {(placing || siting) && (
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

      {/*
        开背包那个按钮**挪到快捷栏最右边去了**（2026-08-25）。

        这一堆是"对着世界做事"的动词——转方向、扔出去、按 F 交互，
        都指向屏幕里那个人。开背包是看自己的东西，混在里面既不好找、
        又占掉一格右拇指的黄金位置。快捷栏本来就是背包露出来的八格，
        "还有更多"挂在那一排的末尾才读得通。

        两处都留一个的话就是同一块面板两个入口，手机屏幕上没有这个余量。
      */}
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
