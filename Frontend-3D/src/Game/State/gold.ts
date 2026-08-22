import { depositGold, jarCapacity, spendGold, totalGold } from "core";

import { emit } from "../EventBus";
import { pushSystemMessage } from "./chatLog";
import { listBuildings, setBuildingState } from "./buildings";

/**
 * 金币。**罐就是钱包**——你的余额就是所有金币罐里装的钱之和，容量就是
 * 你能持有的上限。
 *
 * 这一层不存任何东西：余额活在**建筑实例的 state 里**（`stored`），
 * 而建筑实例本来就进存档。另立一个 `gold: number` 字段的话，罐里的钱和
 * 钱包里的钱就是两个真相，第一次不同步就永远对不上。
 *
 * 规则（按罐依次填满、从后往前扣、溢出丢弃）全在 Core 的 `logic/goldJar`。
 */

function jars(): Array<{ instanceId: string; stored: number; capacity: number }> {
  return listBuildings()
    .filter((item) => item.buildingId === "gold_jar")
    .map((item) => ({
      instanceId: item.instanceId,
      stored: typeof item.state?.stored === "number" ? item.state.stored : 0,
      capacity: jarCapacity(item.levelId ?? "l1"),
    }));
}

export function getGold(): number {
  return totalGold(jars());
}

export function getGoldCapacity(): number {
  return jars().reduce((sum, jar) => sum + jar.capacity, 0);
}

function writeBack(
  before: ReturnType<typeof jars>,
  next: Array<{ stored: number }>,
): void {
  for (const [index, jar] of before.entries()) {
    if (next[index] && next[index].stored !== jar.stored) {
      /*
       * 一起写 `fill`：**视图不碰平衡数值**。它只知道"0..1 的比例"，
       * 不知道容量表长什么样——哪天容量改了，视图一行不用动。
       */
      setBuildingState(jar.instanceId, {
        stored: next[index].stored,
        fill: jar.capacity > 0 ? next[index].stored / jar.capacity : 0,
      });
    }
  }
  emit("gold_changed", { gold: getGold(), capacity: getGoldCapacity() });
}

export type DepositOutcome = { accepted: number; overflowed: number };

/**
 * 入账。**满了之后多出来的部分丢失**（照 CoC 的储存资源模式）。
 *
 * 溢出只发生在**你主动做任务 / 交易**的那一刻——罐不自增，所以损失永远
 * 是"这一笔本来能拿多少"，不是"放着放着就没了"。这条区别决定了它是
 * 压力还是焦虑。
 *
 * 一只罐都没有时全额溢出并给一句明话：开局领地是空地，第一笔金币会全额
 * 流失，玩家必须知道这是为什么，否则那就是个 bug 而不是设计。
 */
export function depositGoldTo(amount: number): DepositOutcome {
  const before = jars();
  const result = depositGold(
    before,
    before.map((jar) => jar.capacity),
    amount,
  );
  writeBack(before, result.next);

  if (result.overflowed > 0) {
    pushSystemMessage(
      before.length === 0
        ? `没有金币罐，${result.overflowed} 金币流失了——先在领地里建一只`
        : `金币罐满了，${result.overflowed} 金币流失了——升一级或者再建一只`,
    );
  }
  return { accepted: result.accepted, overflowed: result.overflowed };
}

/** 花钱。不够就不动，返回还差多少 */
export function spendGoldFrom(
  amount: number,
): { ok: true } | { ok: false; short: number } {
  const before = jars();
  const result = spendGold(before, amount);
  if (result.ok === false) return result;
  writeBack(before, result.next);
  return { ok: true };
}

/**
 * 把每只罐的液面比例重算一遍。
 *
 * **升级/拆罐会改容量但不改余额**，而 `fill` 是"余额 ÷ 容量"——不重算的话
 * 升完级液面还贴在罐口上，看起来像"升级白升了"（实测：l1 满罐 50 升到
 * l2 容量 150，液面纹丝不动）。
 *
 * 由订阅 `world_changed` 的那一处调，不放在 `buildings.ts` 里：那一层
 * 不该知道"金币"这回事，它管的是任意建筑的位置和等级。
 */
export function refreshJarFills(): void {
  for (const jar of jars()) {
    const fill = jar.capacity > 0 ? jar.stored / jar.capacity : 0;
    setBuildingState(jar.instanceId, { fill });
  }
  emit("gold_changed", { gold: getGold(), capacity: getGoldCapacity() });
}
