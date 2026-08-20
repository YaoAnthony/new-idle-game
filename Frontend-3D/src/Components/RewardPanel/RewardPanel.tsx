import { findItemDefinition } from "core";
import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import {
  claimUnpack,
  dismissUnpack,
  getPendingUnpack,
} from "../../Game/Systems/unpack";
import { t } from "../../i18n/t";
import { useMirroredPanel } from "../PanelStack/useMirroredPanel";
import { ItemIcon } from "../Inventory/slots";

/**
 * 领取面板：一次性获得一批东西时居中弹出（拆纸箱、任务奖励、宠物带回的包裹）。
 *
 * **通用件，不是纸箱专用**——数据来自 `getPendingUnpack()` 返回的条目列表，
 * 面板只管把它们摊开给玩家看。以后任何"给你一批东西"的场合都复用这一个，
 * 不要再各写一版。
 *
 * 为什么要有这一步而不是直接进背包：开箱得有"打开礼物"的分量。
 * 直接塞进背包的话，玩家甚至不会注意到自己拿到了什么。
 */
export function RewardPanel() {
  const [, force] = useState(0);

  useEffect(() => on("unpack_changed", () => force((n) => n + 1)), []);

  const pending = getPendingUnpack();

  // 挡屏，进面板栈；ESC 弹栈之后当作"不拆了"处理
  useMirroredPanel("reward", pending !== null, dismissUnpack);

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape 归 EscArbiter（弹栈 → useMirroredPanel 调 dismissUnpack）
      // 回车 / 空格 = 收下，让"按 F 开箱 → 直接确认"能一气呵成
      if (event.key === "Enter" || event.key === " ") claimUnpack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending]);

  if (!pending) return null;

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/35">
      <div className="ui-dialogue w-[min(460px,88vw)] rounded-[26px] px-8 pb-7 pt-8 text-center">
        <div className="text-[20px] font-bold tracking-wide text-[#4a3b2a]">
          {t(pending.localizationKey)}
        </div>
        <div className="mt-1 text-[13px] text-[#8a7250]">
          {t("ui.reward_subtitle")}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {pending.entries.map((entry) => {
            const item = findItemDefinition(entry.itemId);
            return (
              <div
                key={entry.itemId}
                className="flex w-[92px] flex-col items-center gap-1.5"
              >
                <div className="ui-slot grid h-[64px] w-[64px] place-items-center">
                  <ItemIcon itemId={entry.itemId} size={48} />
                  {entry.quantity > 1 && (
                    <span className="absolute bottom-1 right-1.5 text-[12px] font-bold text-[#3d2817] [text-shadow:0_1px_0_rgb(255_248_225)]">
                      {entry.quantity}
                    </span>
                  )}
                </div>
                <span className="text-[12px] leading-tight text-[#6b4a30]">
                  {item ? t(item.localizationKey) : entry.itemId}
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="ui-green-btn mt-7 w-full rounded-full py-2.5 text-[16px] font-bold"
          onClick={claimUnpack}
        >
          {t("ui.reward_claim")}
        </button>
      </div>
    </div>
  );
}
