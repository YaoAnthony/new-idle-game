import { findItemDefinition } from "core";
import { Play } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { on } from "../../Game/EventBus";
import {
  extendLastAction,
  extendOffer,
  getLastActionEnd,
  whyCannotExtend,
  type ExtendOffer,
} from "../../Game/Systems/actions";
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
 * （完成/取消那一刻）和消失的时机都只跟这一条事件有关，
 * 由别人代管只会多一条要同步的状态。
 *
 * ---- 做完了问"还没做完？"（2026-09-13，专注模式 01·甲）----
 *
 * 能接着做的完成卡**不再 6 秒自己消失**，留到玩家回答：填分钟按 ▶，
 * 或者按「够了」。6 秒是给"读完奖励"算的；卡上多了个问题之后还自己消失，
 * 就等于替玩家答了"不用"——而到点那一刻人多半不在屏幕前（专注本来就是
 * 离开屏幕去做事），回来卡已经没了，问了跟没问一样。
 *
 * 问不问的规则在 Systems 的 `extendOffer`（取消的、读档补结算的不问），
 * 这里只看它给不给。
 *
 * 皮从奶油色 `ui-bar` 换成日记本的白卡：卡上要放日记本语言的分钟框和
 * 黄色播放键，两套皮拼在一张卡上是花的。FocusCard 已经先换过。
 */

/** 不带问题的提示停留多久。6 秒够读完奖励清单，又不至于一直挂着 */
const VISIBLE_MS = 6000;

/**
 * 框里的字 → 真正要开的分钟数。空的、不是数的算没填（▶ 按不动）；
 * 超出区间的**夹回去，不算错**：填 999 的人要的是"尽量长"，不是一句报错。
 */
function parseMinutes(draft: string, offer: ExtendOffer): number | null {
  if (draft.trim() === "") return null;
  const value = Math.floor(Number(draft));
  if (!Number.isFinite(value)) return null;
  return Math.min(offer.max, Math.max(offer.min, value));
}

export function ActionToast() {
  const [visible, setVisible] = useState(false);
  /** 分钟框里的字。存字符串：删空了再重打的那个中间态得留得住 */
  const [draft, setDraft] = useState("");
  /** 精力变了重画一次——▶ 亮不亮看精力，而精力不在 React 状态里 */
  const [, setNeedsVersion] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const off = on("action_changed", ({ status }) => {
      if (timer) clearTimeout(timer);
      timer = null;

      // 新的一轮开始了（按了 ▶，或者回日记本开了别的）：卡上的问题已经有答案
      if (status === "started") {
        setVisible(false);
        return;
      }

      setVisible(true);
      const offer = extendOffer();
      if (offer) {
        setDraft(String(offer.defaultMinutes));
        return;
      }
      timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    });

    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    return on("needs_changed", () => setNeedsVersion((version) => version + 1));
  }, [visible]);

  const lastEnd = getLastActionEnd();
  if (!visible || !lastEnd) return null;

  const offer = lastEnd.completed ? extendOffer() : null;
  const minutes = offer ? parseMinutes(draft, offer) : null;
  // 不带分钟问：这里只关心精力够不够，分钟的对错上面 parseMinutes 已经管了
  const blocked = offer ? whyCannotExtend() : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (minutes === null) return;
    // 成功会发 action_changed(started)，上面那条订阅把卡收掉
    extendLastAction(minutes);
  };

  return (
    /*
     * 宽度封顶 400：卡是居中的，SE（667 宽）上右上角按钮从 545 开始，
     * 名字起得长（"还得搞清楚benchmark，没看完"）时标题会把卡撑到按钮上——
     * 封顶之后标题自己折行。
     */
    <div className="paper-card relative max-w-[400px] px-5 py-3 text-center">
      {lastEnd.completed ? (
        <>
          <div className="break-words text-[14px] font-black text-[#5D4037]">
            「{lastEnd.action.customName}」{t("ui.action.completed")}
          </div>
          {lastEnd.rewards.length > 0 && (
            <div className="mt-0.5 text-[12px] font-bold text-[#F57F17]">
              {lastEnd.rewards
                .map((reward) => {
                  const item = findItemDefinition(reward.itemId);
                  return `${item ? t(item.localizationKey) : reward.itemId} ×${reward.quantity}`;
                })
                .join("　")}
            </div>
          )}
          {lastEnd.residentCompanion && (
            <div className="mt-0.5 text-[12px] font-bold text-[#A1887F]">
              {firstResidentNickname()}
              {t("ui.action.companion_suffix")}
            </div>
          )}
          {offer && (
            <form
              onSubmit={submit}
              className="mt-2 flex items-center justify-center gap-1.5 text-[13px] font-black"
            >
              <span className="text-[#A1887F]">{t("ui.action.extend_ask")}</span>
              <span className="text-[#5D4037]">{t("ui.action.extend_again")}</span>
              {/* 分钟框和日记本写计划那个是同一块皮：琥珀药丸 + 橙色粗数字 */}
              <span className="flex items-center rounded-full border-2 border-[#FFE082] bg-[#FFF8E1] px-1.5 py-0.5">
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label={t("ui.action.extend_minutes_label")}
                  className="hide-number-arrows w-9 bg-transparent text-center text-[15px] font-black text-[#F57F17] outline-none"
                  value={draft}
                  min={offer.min}
                  max={offer.max}
                  onChange={(event) => setDraft(event.target.value)}
                  // 离开框时把字改成真正会用的那个数：夹过的、或者删空了回到默认
                  onBlur={() =>
                    setDraft(String(minutes ?? offer.defaultMinutes))
                  }
                />
              </span>
              <span className="text-[#5D4037]">{t("ui.action.extend_minutes")}</span>
              <button
                type="submit"
                aria-label={t("ui.action.extend_start")}
                disabled={minutes === null || blocked !== "ok"}
                className="ml-0.5 flex h-[32px] w-[32px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#FFCA28] text-white shadow-[0_3px_0_#FF8F00] transition-all hover:bg-[#FFB300] active:translate-y-[3px] active:shadow-none disabled:cursor-default disabled:bg-[#E0E0E0] disabled:shadow-[0_3px_0_#BDBDBD] disabled:active:translate-y-0"
              >
                <Play className="ml-[2px] h-[14px] w-[14px] fill-current" strokeWidth={3} />
              </button>
              {/* 「够了」按日记本删除键的规矩：灰底灰字，不和 ▶ 抢眼 */}
              <button
                type="button"
                onClick={() => setVisible(false)}
                className="ml-1 cursor-pointer rounded-full bg-[#F5F5F5] px-3 py-1 text-[12px] font-black text-[#BCAAA4] shadow-[0_3px_0_#E0E0E0] transition-colors hover:bg-[#EEEEEE] hover:text-[#8D6E63] active:translate-y-[3px] active:shadow-none"
              >
                {t("ui.action.extend_enough")}
              </button>
            </form>
          )}
          {offer && blocked === "tired" && (
            <div className="mt-1 text-[12px] font-bold text-[#E57373]">
              {t("ui.action.extend_tired")}
            </div>
          )}
        </>
      ) : (
        <div className="text-[13px] font-bold text-[#A1887F]">
          {t("ui.action.cancelled")}
        </div>
      )}
    </div>
  );
}
