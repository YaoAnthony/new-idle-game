/**
 * 确定性随机（2026-09-17 从 `Data/dailyTasks` 搬进 logic）。
 *
 * 全游戏"抽签"都走这里：每日任务、水獭想要、访客、远行、巨大果实……
 * 同一个种子串在读档、换设备、联机各端算出来都一样，所以**抽到的结果
 * 不用存**，只存种子串里用到的那些事实（哪一天、哪块田、什么时候种的）。
 *
 * 原来住在 `Data/dailyTasks` 是历史原因（第一个用它的是每日任务）。
 * 算法不是内容，`logic/*` 反过来 import `Data/*` 里的算法会把层级搅乱，
 * 所以搬到这儿；`Data/dailyTasks` 保留同名转发，调用方零改动。
 */

/** FNV-1a：把字符串折成 32 位种子 */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // FNV 质数 16777619，用移位加法凑（避免 JS 大整数乘法丢精度）
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32：给定种子的确定性 0~1 序列 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 从候选里确定性地抽 count 个（不重复）。
 *
 * 洗牌取前 N 而不是"随机取 N 次去重"：后者在候选数接近 count 时
 * 会退化成大量重试，而且重试次数依赖运气——同一个种子在不同实现下
 * 可能走出不同的结果，那就不叫确定性了。
 *
 * 候选不足 count 时**返回全部**（不补空）：池子里只有两条就抽两条，
 * 分母仍是 taskCount，UI 负责说"再写几条才凑得满"。
 */
export function drawDeterministic<T>(
  candidates: readonly T[],
  count: number,
  seed: number,
): T[] {
  const pool = [...candidates];
  const random = seededRandom(seed);

  // Fisher-Yates，从后往前
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, Math.max(0, count));
}

/** 闭区间里按一个 0~1 的骰子取整数。区间反了按 min 算 */
export function rollIntInRange(
  range: readonly [number, number],
  roll: () => number,
): number {
  const [min, max] = range;
  if (max <= min) return min;
  return min + Math.floor(roll() * (max - min + 1));
}
