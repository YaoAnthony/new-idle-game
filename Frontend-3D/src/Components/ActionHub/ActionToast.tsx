import { findItemDefinition } from "core";
import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { getLastActionEnd } from "../../Game/Systems/actions";
import { firstResidentNickname } from "../../i18n/residentName";
import { t } from "../../i18n/t";

/**
 * 行动结束的提示（V0.13 从 ActionHub 抽出来）。
 *
 * 和 FocusCard 同理：它是顶部中央那一栈的成员，不是行动面板的一部分。
 * 留在 ActionHub 里时它自己 `absolute left-1/2 top-5`，和专注卡、
 * 每日进度条挤在同一个点上。
 *
 * 自己订阅 action_changed 而不是让 ActionHub 传 prop：它出现的时机
 * （完成/取消那一刻）和消失的时机（6 秒后）都只跟这一条事件有关，
 * 由别人代管只会多一条要同步的状态。
 */

/** 提示停留多久。6 秒够读完奖励清单，又不至于一直挂着 */
const VISIBLE_MS = 6000;

export function ActionToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const off = on("action_changed", ({ status }) => {
      if (status !== "completed" && status !== "cancelled") return;
      setVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    });

    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const lastEnd = getLastActionEnd();
  if (!visible || !lastEnd) return null;

  return (
    <div className="ui-bar ui-dash relative px-5 py-3 text-center">
      {lastEnd.completed ? (
        <>
          <div className="text-[14px] font-bold text-[var(--ink)]">
            「{lastEnd.action.customName}」{t("ui.action.completed")}
          </div>
          <div className="mt-1 text-[12px] font-bold text-[var(--peach-deep)]">
            {lastEnd.rewards
              .map((reward) => {
                const item = findItemDefinition(reward.itemId);
                return `${item ? t(item.localizationKey) : reward.itemId} ×${reward.quantity}`;
              })
              .join("　")}
          </div>
          {lastEnd.residentCompanion && (
            <div className="mt-1 text-[12px] text-[var(--ink-soft)]">
              {firstResidentNickname()}
              {t("ui.action.companion_suffix")}
            </div>
          )}
        </>
      ) : (
        <div className="text-[13px] text-[var(--ink-soft)]">
          {t("ui.action.cancelled")}
        </div>
      )}
    </div>
  );
}
