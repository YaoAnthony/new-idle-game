import { ActionToast } from "../ActionHub/ActionToast";
import { FocusCard } from "../ActionHub/FocusCard";
import { DailyBoardHud } from "../DailyBoard/DailyBoardHud";
import { StoryToast } from "../StoryToast/StoryToast";

/**
 * 屏幕正上方那一栈（V0.13）。
 *
 * 在此之前**四样东西抢同一个点**：每日进度条 `top-3 z-10`、专注倒计时
 * `top-5 z-20`、行动结束提示 `top-5 z-20`、剧情提示 `top-6 z-30`。
 * 各自 absolute 居中，谁 z-index 高谁赢——所以一进专注，每日进度条就被
 * 倒计时卡整个盖住（玩家点名的正是这个）。加第五样东西时还得再挑一个
 * 没人用过的 z-index，那是个只会越来越难猜的游戏。
 *
 * 现在是一个 flex 列：**位置由排序决定，不由 z-index 决定**。
 *
 * 顺序的依据是"这东西在屏幕上待多久"：
 *   1. 每日进度条——常驻（今天有任务就一直在）。排最上，位置最稳定，
 *      余光扫一眼就知道进度，不会因为别的东西出现而跳。
 *   2. 专注倒计时——一次专注的几十分钟。
 *   3. 行动结束提示——6 秒。
 *   4. 剧情提示——几秒。
 * 越短命的越靠下：它们出现和消失时推挤的是下方的空气，不是上面那些
 * 正在被人盯着看的东西。
 *
 * 每一项都**不再自己定位**，只画自己那块内容。
 */
export function HudTopCenter() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 flex-col items-center gap-2 [&>*]:pointer-events-auto">
      <DailyBoardHud />
      <FocusCard />
      <ActionToast />
      <StoryToast />
    </div>
  );
}
