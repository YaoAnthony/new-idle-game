import { actionLogTuning, classifyActionTitle, findActionByCategory } from "core";
import { useCallback, useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { remainingLogCount } from "../../Game/State/actionLog";
import { getClock } from "../../Game/State/clock";
import {
  diaryDoneOn,
  diaryStartedOn,
} from "../../Game/State/diary";
import {
  addActionEntry,
  claimActionReward,
  getActionEntries,
  logCompletedAction,
  removeActionEntry,
  startActionEntry,
  whyCannotStartEntry,
} from "../../Game/Systems/actions";

/**
 * 把游戏状态翻译成设计稿的形状。
 *
 * 设计稿（`BookPlanner.tsx`）的数据模型是一个扁平的 `Task[]`，每条带
 * `date` 和 `completed`；游戏里这两半**存在完全不同的地方**：
 *
 *   - **打算做的** → `PlayerActionEntry[]`（`PlayerSave.actionEntries`）。
 *     它是**模板**不是某一天的条目：**没有日期字段**。玩家写下"写完
 *     assignment2"是一件"我要做的事"，不是"8月27号要做的事"。
 *   - **做过的** → `DayFactsSave.actions`（`WorldSave.dayFacts`）。
 *     这个**有** worldDayId，按天分好了，正好当右页。
 *
 * 这个差异不是缺陷，是两套模型的真实分歧。翻译的规则写在下面每个函数上。
 */

export type DiaryTask = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  durationMinutes: number;
  /** 开箱开出来的东西。设计稿那儿是 `reward: number`，游戏没有分数 */
  gained?: string;
  date: string;
};

export type DiaryData = {
  /**
   * 今天的 worldDayId。分界时刻已经是 00:00（见 `Core/Data/time`），
   * 所以它**就是主机的本地日历日**——日记的一页 = 日历上的一天。
   */
  todayId: string;
  /**
   * 开启日记的那一天（第一笔记录的日子；一笔没记过 = 今天）。
   * 左页的日期序列从它排到今天——历史多长由玩了多久决定，
   * 不再是写死的"过去 7 天"。
   */
  startedOn: string;
  tasks: DiaryTask[];
  /**
   * 一天有几个**有奖励**的名额。超出照常完成，只是不开箱。
   * 顶上那条进度条数的就是它。
   */
  rewardedPerDay: number;
  /**
   * 右页「补录」还剩几次。
   *
   * 和 `rewardedPerDay` 是两码事：补录是"没在游戏里做、事后写上去"，
   * 没有真实时间当代价，所以另有一道更紧的闸（见 Core 的 `actionLogTuning`）。
   * 左页的计划**不受任何一个限制**——计划多少条是玩家自己的事。
   */
  logQuotaLeft: number;
  addPlan: (title: string, minutes: number) => void;
  addLog: (title: string, minutes: number) => string | null;
  /** 开始专注。返回失败原因的人话，成功返回 null */
  startTimer: (id: string) => string | null;
  /**
   * 给右页某条**已完成但没发奖**的行动补发一次。返回失败原因的人话，
   * 成功返回 null。断线/换设备导致奖励没结上时的兜底，见
   * `Systems/actions` 的 `claimActionReward`。
   */
  claim: (id: string) => string | null;
  remove: (id: string) => void;
};

/** 失败原因 → 人话。和 `/action log`、行动面板同一份口径 */
/** 起不来的原因 → 人话 */
const START_FAIL_TEXT: Record<string, string> = {
  missing: "找不到这一条",
  busy: "手上还有进行中的行动，先把那件做完",
  tired: "精力不够了，歇一会儿再来",
  unknown_action: "找不到对应的行动",
};

/** 补发失败的原因 → 人话 */
const CLAIM_FAIL_TEXT: Record<string, string> = {
  already: "这一条已经领过了",
  no_chest: "这类行动本来就不开箱",
  unknown: "太早的记录了，补发不了",
  quota_full: "今天的奖励名额用完了",
  missing: "找不到这一条",
};

const FAIL_TEXT: Record<string, string> = {
  count_full: "今天的补记额度用完了",
  minutes_full: "今天补记的总时长到顶了",
  busy: "手上还有进行中的行动",
  tired: "精力不够",
  bad_duration: "时长超出这类行动的范围",
  unknown_action: "找不到对应的行动",
};

/** 标题 → 该分类下那条行动定义的 id。分类没有对应定义时落回 work_study */
function actionIdFor(title: string): string {
  return findActionByCategory(classifyActionTitle(title))?.id ?? "work_study";
}

export function useDiaryData(): DiaryData {
  const [version, bump] = useState(0);

  // 三条数据源变了就重读。日记本整棵重读，不做增量——它一屏就那么点东西
  useEffect(() => {
    const offs = [
      on("action_entries_changed", () => bump((n) => n + 1)),
      on("action_log_changed", () => bump((n) => n + 1)),
      on("diary_changed", () => bump((n) => n + 1)),
      on("action_changed", () => bump((n) => n + 1)),
      on("world_day_changed", () => bump((n) => n + 1)),
      on("favors_changed", () => bump((n) => n + 1)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const todayId = getClock().worldDayId;

  /*
   * 左页（打算做的）：`actionEntries` **全部挂在今天这一页**。
   *
   * 它们没有日期——是"我要做的事"的模板，不是"某天要做的事"。挂到今天
   * 是因为今天是唯一你还能动它们的一页：过去的日子只读，而未来的页还
   * 不存在。翻回昨天时左页因此是空的——那不是丢数据，是**当时的计划
   * 本来就没被记录下来**。要让旧日子的左页有内容，得给 entry 加日期字段，
   * 那是一次存档形状变更，不在这一步。
   */
  const plans: DiaryTask[] = getActionEntries().map((entry) => ({
    id: entry.entryId,
    title: entry.customName,
    completed: false,
    createdAt: Date.parse(entry.createdAtUtc) || 0,
    durationMinutes: entry.durationMinutes,
    date: todayId,
  }));

  /*
   * 右页（做过的）：**日记**（PlayerSave.diary，v35）。
   *
   * 原来借的是 dayFacts（报纸素材）：只留两天、挂在世界上（联机翻开的
   * 是房主的）。现在日记有自己的家：完整历史、稀疏存储、跟着人走。
   *
   * 这里只展开 `startedOn..今天` 这个区间里**有内容的天**——UI 的
   * tasks 是扁平数组，空的天不产生条目，翻到自然是空页。
   */
  const startedOn = diaryStartedOn();
  const done: DiaryTask[] = [];
  {
    const [sy, sm, sd] = startedOn.split("-").map(Number);
    const cursor = new Date(sy, sm - 1, sd);
    // 上限双保险：按天数封顶（闰秒/时钟倒拨也走不出死循环）
    for (let i = 0; i < 3660; i += 1) {
      const dayId = cursor.toLocaleDateString("en-CA");
      for (const [index, fact] of diaryDoneOn(dayId).entries()) {
        done.push({
          id: `${dayId}#${index}`,
          title: fact.name,
          completed: true,
          // 日记不存完成时刻，用序号保序（设计稿按 createdAt 倒排）
          createdAt: index,
          durationMinutes: fact.minutes,
          gained: fact.gained,
          date: dayId,
        });
      }
      if (dayId === todayId) break;
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const addPlan = useCallback((title: string, minutes: number) => {
    /*
     * 分类**按标题后台自动归**（`classifyActionTitle`：Core 的关键词表，
     * "跑步"→运动、"写小说"→创作、"午睡"→休息，没命中落到工作学习）。
     * 写日记的人不选分类——这是用户拍的板；也是用户说的"未来肯定要改"
     * 的那块：升级成真文本分析时只换 Core 那头，这里一个字不动。
     * 分类决定的是疲劳消耗、开不开箱、角色走去哪件家具旁演出。
     */
    addActionEntry({
      actionId: actionIdFor(title),
      customName: title,
      durationMinutes: minutes,
      priority: "normal" as never,
    });
  }, []);

  /** 右页直接记一笔。返回失败原因的人话，成功返回 null */
  const addLog = useCallback((title: string, minutes: number) => {
    const result = logCompletedAction({
      // 补录也走同一套自动分类：右页记"跑了三公里"就该按运动结算
      actionId: actionIdFor(title),
      customName: title,
      durationMinutes: minutes,
    });
    return result === "ok" ? null : (FAIL_TEXT[result] ?? "记不上");
  }, []);

  /*
   * 起不来要**说清楚是哪一种**。原来只回 true/false，UI 只好写死一句
   * "精力不够或者家具还没摆"——两种原因糊在一起，而家具那半句在门槛
   * 取消之后已经是假话了。
   */
  const startTimer = useCallback((id: string) => {
    const why = whyCannotStartEntry(id);
    if (why !== "ok") return START_FAIL_TEXT[why] ?? "开始不了";
    return startActionEntry(id) ? null : "开始不了";
  }, []);

  /*
   * 右页那条的 id 是 `${worldDayId}#${序号}`（上面拼的）。补发只认今天——
   * 往回翻的日子是只读的事实，不该还能从那儿掏出东西来。
   */
  const claim = useCallback(
    (id: string) => {
      const [dayId, rawIndex] = id.split("#");
      if (dayId !== getClock().worldDayId) return "只能补领今天的";
      const result = claimActionReward(Number(rawIndex));
      return result === "ok" ? null : (CLAIM_FAIL_TEXT[result] ?? "领不了");
    },
    [],
  );
  const remove = useCallback((id: string) => removeActionEntry(id), []);

  // version 只用来触发重读，不参与计算
  void version;

  return {
    todayId,
    startedOn,
    tasks: [...plans, ...done],
    rewardedPerDay: actionLogTuning.rewardedPerDay,
    logQuotaLeft: remainingLogCount(),
    addPlan,
    addLog,
    startTimer,
    claim,
    remove,
  };
}
