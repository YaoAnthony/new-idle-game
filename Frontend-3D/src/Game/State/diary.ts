import type { DiaryDoneSave, DiarySave } from "core";
import { emit } from "../EventBus";
import { getClock } from "./clock";

/**
 * 日记本的状态：**跟着玩家走的完整历史**（v35）。
 *
 * ---- 和 dayFacts 的分工 ----
 *
 * `dayFacts`（WorldSave）是**报纸素材**：挂在世界上、只留两天、做客时
 * 看到的是房主的。日记本原来借它当数据源，两条毛病都暴露了：历史只到
 * 昨天，联机翻开的是别人的日记。这个模块是日记自己的家：挂在
 * `PlayerSave.diary`，不修剪，做客时翻开的还是自己的。报纸继续用
 * dayFacts，两者各归各。
 *
 * ---- 形状（用户点名）----
 *
 * 稀疏数组：只存有内容的天。`startedOn` = 第一次写下东西的那天，
 * 左页日期从它排到今天。
 */

let diary: DiarySave | null = null;

/** 今天那一条，没有就建（顺手把 startedOn 定下来——开启日记的时刻） */
function todayEntry(): { day: string; done: DiaryDoneSave[] } {
  const today = getClock().worldDayId;
  if (!diary) diary = { startedOn: today, days: [] };

  let entry = diary.days.find((item) => item.day === today);
  if (!entry) {
    entry = { day: today, done: [] };
    diary.days.push(entry);
    // 升序保持：跨天只会往后长，排序只在乱序恢复时真正做事
    diary.days.sort((a, b) => (a.day < b.day ? -1 : 1));
  }
  return entry;
}

/** 记一笔"做完了"。行动完成（计时器/补录）时由 Systems/actions 调 */
export function recordDiaryDone(done: DiaryDoneSave): void {
  todayEntry().done.push(done);
  emit("diary_changed", {});
}

/** 开启日记的那一天；一笔都没写过就是今天（第一页=今天，从今天开始记） */
export function diaryStartedOn(): string {
  return diary?.startedOn ?? getClock().worldDayId;
}

/** 某一天做完的清单。没记录的天回空数组（稀疏：空页不占存档） */
export function diaryDoneOn(worldDayId: string): readonly DiaryDoneSave[] {
  return diary?.days.find((item) => item.day === worldDayId)?.done ?? [];
}

/** 今天已发奖的件数（`rewardedPerDay` 名额的分子）。从记录现推，不另存计数 */
export function rewardedTodayCount(): number {
  return diaryDoneOn(getClock().worldDayId).filter(
    (item) => item.gained !== undefined,
  ).length;
}

/**
 * 给今天第 `index` 条补上开出来的东西（右页那颗星的"补领"）。
 * 只允许今天：过去的日子是只读的事实。已经有 gained 的不许覆盖。
 */
export function setDiaryGained(index: number, itemId: string): boolean {
  const entry = diary?.days.find(
    (item) => item.day === getClock().worldDayId,
  );
  const done = entry?.done[index];
  if (!done || done.gained !== undefined) return false;
  done.gained = itemId;
  emit("diary_changed", {});
  return true;
}

// ---- 存档 ----

export function snapshotDiary(): DiarySave | undefined {
  return diary ?? undefined;
}

export function restoreDiary(saved: DiarySave | undefined): void {
  /*
   * 深拷贝进来：restore 的入参是反序列化的存档对象，直接持有的话
   * 这里的每次 push 都在改调用方手里的那份（保存管线可能还要用它）。
   */
  diary = saved
    ? {
        startedOn: saved.startedOn,
        days: saved.days.map((entry) => ({
          day: entry.day,
          done: entry.done.map((item) => ({ ...item })),
        })),
      }
    : null;
  emit("diary_changed", {});
}
