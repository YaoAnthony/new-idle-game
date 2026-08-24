/**
 * 金币罐。**罐就是钱包**——罐里有多少就是你有多少，容量就是你能持有的
 * 上限。没有"收进兜里"这一步。
 *
 * 为什么是钱包不是收集器：如果罐只是中转站、收进一个无上限的余额，
 * 那容量限制的只是"你多久没来收"，而罐**不自增**，每次做完任务顺手一收
 * 就永不溢出——容量根本不成其为关卡。做成钱包之后"我攒不下钱"是真实
 * 压力，升罐 / 多建罐才有意义。这正是 CoC 的储存资源模式。
 */

export type JarState = { stored: number };

export function totalGold(jars: readonly JarState[]): number {
  return jars.reduce((sum, jar) => sum + jar.stored, 0);
}

export type DepositResult = {
  /** 实际进账 */
  accepted: number;
  /** 溢出丢掉的。UI 拿它提示"金库满了" */
  overflowed: number;
  next: JarState[];
};

/**
 * 往罐组里存。**按罐依次填满**，不是按比例分配。
 *
 * 分配算法越简单越好解释：玩家看到的是"先把第一只灌满再灌第二只"。
 * 按比例分的话每只罐的液面同时慢慢涨，没人能从画面上算出下一笔钱会
 * 进哪只——而液面正是这个建筑的灵魂。
 *
 * 超过总容量的部分**丢弃**（照 CoC）。一只罐都没有时 accepted=0、
 * overflowed=amount：开局领地是空地，第一笔金币会全额溢出，所以第一只
 * 罐的建造代价必须为 0（否则死锁）。
 */
export function depositGold(
  jars: readonly JarState[],
  capacities: readonly number[],
  amount: number,
): DepositResult {
  const next = jars.map((jar) => ({ ...jar }));
  let left = Math.max(0, amount);
  let accepted = 0;

  for (let i = 0; i < next.length; i += 1) {
    if (left <= 0) break;
    const room = Math.max(0, (capacities[i] ?? 0) - next[i].stored);
    const put = Math.min(room, left);
    next[i].stored += put;
    accepted += put;
    left -= put;
  }

  return { accepted, overflowed: left, next };
}

export type SpendResult =
  | { ok: true; next: JarState[] }
  | { ok: false; short: number };

/**
 * 花钱。**从后往前扣**（和存相反）。
 *
 * 让第一只罐尽量保持满：液面看起来稳定，玩家不会因为买了一次东西就
 * 看到所有罐一起降一截。这条纯粹是为了画面可读，规则上从哪只扣都一样。
 */
export function spendGold(
  jars: readonly JarState[],
  amount: number,
): SpendResult {
  const total = totalGold(jars);
  if (total < amount) return { ok: false, short: amount - total };

  const next = jars.map((jar) => ({ ...jar }));
  let left = Math.max(0, amount);
  for (let i = next.length - 1; i >= 0 && left > 0; i -= 1) {
    const take = Math.min(next[i].stored, left);
    next[i].stored -= take;
    left -= take;
  }
  return { ok: true, next };
}
