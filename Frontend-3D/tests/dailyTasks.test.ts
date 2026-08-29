import { beforeEach, describe, expect, test, vi } from "vitest";
import { dailyBoardDefinition, Facing } from "core";

import {
  addTask,
  canReroll,
  countDoneToday,
  getPool,
  getToday,
  markDone,
  peekToday,
  removeTask,
  renameTask,
  rerollTask,
  restoreDailyTasks,
  snapshotDailyTasks,
} from "../src/Game/State/dailyTasks";
import {
  applyRemoteClaimed,
  applyRemoteProgress,
  claimBoard,
  getBoard,
  getGoal,
  isFull,
  peekBoard,
  restoreDailyBoard,
  snapshotDailyBoard,
  tickBoard,
} from "../src/Game/State/dailyBoard";
import {
  completeDailyTask,
  describeBoard,
  setDailyRewardShareCounter,
} from "../src/Game/Systems/dailyTasks";
import { debugAdvanceHours, getClock } from "../src/Game/State/clock";
import { restoreDroppedItems, snapshotDroppedItems } from "../src/Game/State/droppedItems";
import {
  getGold,
  getGoldCapacity,
  restoreBaseGold,
} from "../src/Game/State/gold";
import { restoreBuildings } from "../src/Game/State/buildings";
import { on } from "../src/Game/EventBus";

/**
 * 每日任务机器（V0.11）。系统由**两半**拼成，而且两半刻意互不 import：
 * 个人清单跟着人走（PlayerSave），共享进度跟着世界走（WorldSave）——
 * 联机时它们落在两份不同的存档里。缝合是 Systems 层的活。
 *
 * 三条要害：
 * 1. **抽签必须确定性**。用 Math.random 的话，玩家反复开关面板就能一直
 *    重抽，直到抽到最容易的那几条——抽签机制当场失效；
 * 2. **打勾不可撤销、不可重复**。进度是共享的，撤销会把别人已经看到的
 *    进度条拽回去；重复点击加两分同理；
 * 3. **跨天惰性归零**。没有后台定时器，谁来读谁顺手检查日期，
 *    离线跨三天也只是一次归零。
 */

const GOAL = dailyBoardDefinition.taskCount;

beforeEach(() => {
  taskSerial = 0;
  restoreDailyTasks(undefined);
  restoreDailyBoard(undefined);
  restoreDroppedItems([]);
  setDailyRewardShareCounter(() => 1);
  // 钱匣不挂在任何建筑上，谁都清不掉它——漏了这行用例之间会串钱
  restoreBaseGold(0);
});

/**
 * 往池子里写 n 条**新**任务，返回池子里全部 id。
 *
 * 文案带全局序号：`addTask` 会拒收重复文案，同一个用例里调两次
 * 若用同样的文案，第二次一条都加不进去，而用例会以为加上了。
 */
let taskSerial = 0;
function seedPool(n: number): string[] {
  for (let i = 0; i < n; i += 1) {
    taskSerial += 1;
    addTask(`任务 ${taskSerial}`);
  }
  return getPool().map((task) => task.taskId);
}

// ---- 池子 ----

describe("池子", () => {
  test("写进去读得出来，去首尾空白", () => {
    expect(addTask("  喝八杯水  ")).toBe("ok");
    expect(getPool().map((t) => t.text)).toEqual(["喝八杯水"]);
  });

  test("空白、重复、超长、超上限各有各的拒绝理由", () => {
    expect(addTask("")).toBe("empty");
    expect(addTask("   ")).toBe("empty");

    addTask("喝八杯水");
    expect(addTask("喝八杯水")).toBe("duplicate");
    expect(addTask(" 喝八杯水 ")).toBe("duplicate");

    expect(addTask("x".repeat(dailyBoardDefinition.textLimit + 1))).toBe("ok");
    // 超长的被截断而不是拒收——写超了一点不该整条丢掉
    expect(getPool().some((t) => t.text.length > dailyBoardDefinition.textLimit)).toBe(false);

    restoreDailyTasks(undefined);
    seedPool(dailyBoardDefinition.poolLimit);
    expect(addTask("再多一条")).toBe("full");
  });

  test("改名和删除", () => {
    const [id] = seedPool(1);

    expect(renameTask(id, "改过的")).toBe(true);
    expect(getPool()[0].text).toBe("改过的");
    expect(renameTask("查无此条", "x")).toBe(false);

    expect(removeTask(id)).toBe(true);
    expect(getPool()).toHaveLength(0);
    expect(removeTask(id)).toBe(false);
  });
});

// ---- 抽签 ----

describe("抽签", () => {
  test("同一天反复读抽出来的是同一批——否则玩家会一直重开面板换牌", () => {
    seedPool(10);

    const first = getToday().map((draw) => draw.taskId);
    const second = getToday().map((draw) => draw.taskId);

    expect(first).toEqual(second);
    expect(first).toHaveLength(GOAL);
  });

  test("池子不够时有几条抽几条，不补空", () => {
    seedPool(2);
    expect(getToday()).toHaveLength(2);
  });

  test("池子是空的就抽不出来，但不炸", () => {
    expect(getToday()).toEqual([]);
  });

  test("当天补写任务会补抽——新玩家第一天不能卡死", () => {
    // 摆下机器、打开面板（此刻池子空的，抽出 0 条并缓存），然后才开始写
    expect(getToday()).toHaveLength(0);

    seedPool(GOAL);
    expect(getToday()).toHaveLength(GOAL);
  });

  test("补抽只填空位，已经抽中的（含打过勾的）原样保留", () => {
    seedPool(2);
    const before = getToday().map((d) => d.taskId);
    markDone(before[0]);

    seedPool(5); // 再写几条，触发补抽
    const after = getToday();

    expect(after).toHaveLength(GOAL);
    // 原来那两条还在原位，勾也还在
    expect(after.slice(0, 2).map((d) => d.taskId)).toEqual(before);
    expect(after[0].done).toBe(true);
  });

  test("抽的是文案快照不是引用——中途改了模板，今天这条不跟着变", () => {
    const [id] = seedPool(1);
    const drawnText = getToday()[0].text;

    renameTask(id, "改成了别的");

    expect(getToday()[0].text).toBe(drawnText);
    expect(getPool()[0].text).toBe("改成了别的");
  });

  test("peekToday 是只读的，不会触发抽签也不发事件", () => {
    seedPool(GOAL);

    const listener = vi.fn();
    const off = on("daily_tasks_changed", listener);

    // React 的 render 期间只能调这个——getToday 会当场抽签并发事件，
    // 那会让别的组件在渲染中 setState
    expect(peekToday()).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
    off();
  });
});

// ---- 打勾 ----

describe("打勾", () => {
  test("第一次返回 true，重复点击返回 false（不重复加分）", () => {
    seedPool(GOAL);
    const [id] = getToday().map((d) => d.taskId);

    expect(markDone(id)).toBe(true);
    expect(markDone(id)).toBe(false);
    expect(countDoneToday()).toBe(1);
  });

  test("完成不存在的任务返回 false", () => {
    seedPool(GOAL);
    expect(markDone("查无此条")).toBe(false);
  });

  test("Systems 层：真的从未完成变成完成，才推共享进度", () => {
    seedPool(GOAL);
    const [id] = getToday().map((d) => d.taskId);

    expect(completeDailyTask(id)).toBe(true);
    expect(describeBoard().progress).toBe(1);

    // 再点一次：个人那边就拒了，共享进度不动
    expect(completeDailyTask(id)).toBe(false);
    expect(describeBoard().progress).toBe(1);
  });
});

// ---- 共享进度 ----

describe("共享进度", () => {
  test("分母恒为 taskCount，不随人数变", () => {
    expect(getGoal()).toBe(GOAL);
    setDailyRewardShareCounter(() => 5);
    expect(getGoal()).toBe(GOAL);
  });

  test("推进到满就封顶，再推返回 null", () => {
    for (let i = 0; i < GOAL; i += 1) {
      expect(tickBoard()).toBe(i + 1);
    }
    expect(isFull()).toBe(true);
    expect(tickBoard()).toBeNull();
  });

  test("peekBoard 不改状态也不发事件（给 render 用）", () => {
    const listener = vi.fn();
    const off = on("daily_board_changed", listener);

    expect(peekBoard().progress).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  test("领奖：满格才给，而且只给一次", () => {
    expect(claimBoard()).toBe(false); // 还没满

    for (let i = 0; i < GOAL; i += 1) tickBoard();
    expect(claimBoard()).toBe(true);
    expect(claimBoard()).toBe(false); // 第二次是别人先置的位
  });
});

// ---- 联机重放 ----

describe("联机重放", () => {
  test("取绝对进度，不 +1（op 通道不保证不重复不有序）", () => {
    applyRemoteProgress(getClock().worldDayId, 3);
    expect(getBoard().progress).toBe(3);

    applyRemoteProgress(getClock().worldDayId, 3);
    expect(getBoard().progress).toBe(3);
  });

  test("只增不减：乱序到达时旧的小值不能把新的拽回去", () => {
    applyRemoteProgress(getClock().worldDayId, 3);
    applyRemoteProgress(getClock().worldDayId, 1);

    expect(getBoard().progress).toBe(3);
  });

  test("封顶在分母，脏数据也不会把进度条撑爆", () => {
    applyRemoteProgress(getClock().worldDayId, 999);
    expect(getBoard().progress).toBe(GOAL);

    restoreDailyBoard(undefined);
    applyRemoteProgress(getClock().worldDayId, -5);
    expect(getBoard().progress).toBe(0);
  });

  test("跨天边界上迟到的包被丢弃——不能把新一天的进度顶成 1", () => {
    applyRemoteProgress("2020-01-01", 3);
    expect(getBoard().progress).toBe(0);
  });

  test("别人领了奖只置位，不吐东西", () => {
    for (let i = 0; i < GOAL; i += 1) tickBoard();
    restoreDroppedItems([]);

    applyRemoteClaimed(getClock().worldDayId);

    expect(getBoard().claimed).toBe(true);
    expect(snapshotDroppedItems()).toHaveLength(0);
    // 已经置过位，本地就不该再吐一份
    expect(claimBoard()).toBe(false);
  });
});

// ---- 重抽 ----

describe("重抽", () => {
  test("每天一次；池子里没有候补时不给换", () => {
    seedPool(GOAL); // 刚好抽完，没有候补
    const [id] = getToday().map((d) => d.taskId);
    expect(canReroll()).toBe(false);
    expect(rerollTask(id)).toBe(false);

    seedPool(2); // 现在有候补了
    expect(canReroll()).toBe(true);
    expect(rerollTask(id)).toBe(true);
    // 额度用光
    expect(canReroll()).toBe(false);
  });

  test("换同一条永远得到同一个替补（读档、重放都一致）", () => {
    seedPool(GOAL + 3);
    const [id] = getToday().map((d) => d.taskId);

    const snapshot = snapshotDailyTasks();
    rerollTask(id);
    const firstResult = getToday().map((d) => d.taskId);

    restoreDailyTasks(snapshot);
    rerollTask(id);

    expect(getToday().map((d) => d.taskId)).toEqual(firstResult);
  });

  test("已经打勾的不能换——那等于撤销共享进度", () => {
    seedPool(GOAL + 3);
    const [id] = getToday().map((d) => d.taskId);
    markDone(id);

    expect(rerollTask(id)).toBe(false);
  });

  test("换不存在的条目返回 false，也不消耗额度", () => {
    seedPool(GOAL + 3);
    expect(rerollTask("查无此条")).toBe(false);
    expect(canReroll()).toBe(true);
  });
});

// ---- 跨天 ----

describe("跨天", () => {
  test("共享进度隔天归零", () => {
    for (let i = 0; i < GOAL; i += 1) tickBoard();
    expect(getBoard().progress).toBe(GOAL);

    debugAdvanceHours(25);
    try {
      expect(getBoard().progress).toBe(0);
      expect(getBoard().claimed).toBe(false);
    } finally {
      debugAdvanceHours(-25);
    }
  });

  test("个人清单隔天重抽，昨天的勾不带过来", () => {
    seedPool(GOAL + 4);
    const yesterday = getToday().map((d) => d.taskId);
    markDone(yesterday[0]);

    debugAdvanceHours(25);
    try {
      const today = getToday();
      expect(today.every((draw) => !draw.done)).toBe(true);
      expect(countDoneToday()).toBe(0);
    } finally {
      debugAdvanceHours(-25);
    }
  });

  test("离线跨很多天也只是一次归零，不是补算 N 次", () => {
    for (let i = 0; i < GOAL; i += 1) tickBoard();

    debugAdvanceHours(24 * 10);
    try {
      expect(getBoard().progress).toBe(0);
    } finally {
      debugAdvanceHours(-24 * 10);
    }
  });
});

// ---- 存档 ----

describe("存档", () => {
  test("池子和今日清单往返", () => {
    seedPool(GOAL + 2);
    const drawn = getToday().map((d) => d.taskId);
    markDone(drawn[0]);

    const snapshot = snapshotDailyTasks();
    restoreDailyTasks(undefined);
    expect(getPool()).toHaveLength(0);

    restoreDailyTasks(snapshot);
    expect(getPool()).toHaveLength(GOAL + 2);
    expect(getToday().map((d) => d.taskId)).toEqual(drawn);
    expect(getToday()[0].done).toBe(true);
  });

  test("今天什么都没发生就不写共享进度那段（省得每份存档带一堆全零）", () => {
    expect(snapshotDailyBoard()).toBeUndefined();

    tickBoard();
    expect(snapshotDailyBoard()?.progress).toBe(1);
  });

  test("共享进度往返，坏数据被夹回合法范围", () => {
    restoreDailyBoard({ worldDayId: getClock().worldDayId, progress: -3, claimed: true } as never);
    expect(getBoard().progress).toBe(0);
    expect(getBoard().claimed).toBe(true);
  });
});

/**
 * 单条奖励（2026-08-23）：打一个勾当场给金币。
 *
 * 和满格奖励分两层——单条是即时反馈（你刚做完一件现实里的事，机器当场
 * 有反应），满格是"全做完"的额外犒赏。三条要害：
 * 1. **重复点击不重复给**：和进度条同一条纪律，靠 `markDone` 的返回值挡；
 * 2. **只给打勾的人一份**，不像满格那样在场每人各一份；
 * 3. **金币进罐不吐实物**——罐就是钱包，吐成实物玩家能揣着走，
 *    "容量就是持有上限"当场作废。
 */
describe("单条任务奖励", () => {
  /** 造一只金币罐（余额活在建筑实例里，没有罐就无处可存） */
  function seedJar(): void {
    restoreBuildings([
      {
        instanceId: "jar-test",
        buildingId: "gold_jar",
        levelId: "l1",
        x: 0,
        z: 0,
        elevation: 0,
        facing: Facing.North,
        state: { stored: 0 },
      },
    ]);
  }

  /** 定义里配的单条金币数。**从数据读不写死**——调平衡时用例不该变红 */
  const perTaskGold = dailyBoardDefinition.perTaskRewards
    .filter((r) => r.type === "gold")
    .reduce((sum, r) => sum + (r.type === "gold" ? r.amount : 0), 0);

  test("打一个勾就进账，金额等于定义里配的", () => {
    seedJar();
    const ids = seedPool(GOAL);
    const before = getGold();

    completeDailyTask(ids[0]);

    expect(getGold()).toBe(before + perTaskGold);
  });

  test("重复点同一条不重复给", () => {
    seedJar();
    const ids = seedPool(GOAL);

    completeDailyTask(ids[0]);
    const afterFirst = getGold();
    completeDailyTask(ids[0]);

    expect(getGold()).toBe(afterFirst);
  });

  test("金币进罐，不吐成地上的实物", () => {
    seedJar();
    const ids = seedPool(GOAL);

    completeDailyTask(ids[0]);

    expect(snapshotDroppedItems()).toHaveLength(0);
  });

  test("罐满了就溢出——这是逼玩家升罐的教学，不是 bug", () => {
    seedJar();
    const capacity = getGoldCapacity();
    const ids = seedPool(GOAL);

    // 打满一整板：每条单条奖 + 满格那份，总额远超 l1 罐的容量
    for (const id of ids) completeDailyTask(id);

    // 余额封顶在容量上，多的丢掉（明话提示在 depositGoldTo 里发）
    expect(getGold()).toBe(capacity);
  });
});
