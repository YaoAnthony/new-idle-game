/**
 * 闪电的折线（暴风雨，2026-09-18）。**纯函数**：给起终点和随机数，吐一条主干 + 几条分叉。
 *
 * 做法是老牌的中点位移：一段线反复取中点、往侧面随机挪一下，挪的幅度随段长缩小，
 * 出来就是越往下越碎的锯齿。分叉从主干中段随机几个点岔出去，更短更细，
 * 方向朝下偏一点。不用贴图、不用 shader——这个画风里一根发光的折线就是闪电。
 */

export type Vec3 = { x: number; y: number; z: number };
export type BoltBranch = { points: Vec3[]; width: number };

export type BoltOptions = {
  /** 递归几层。5 层 = 32 段，够碎又不至于成毛线 */
  depth?: number;
  /** 侧移幅度占段长的比例 */
  sway?: number;
  /** 分几叉 */
  branches?: number;
  /** 主干粗细（米）；分叉按比例缩 */
  width?: number;
};

export function buildBolt(from: Vec3, to: Vec3, random: () => number, options: BoltOptions = {}): BoltBranch[] {
  const depth = options.depth ?? 5;
  const sway = options.sway ?? 0.22;
  const branchCount = options.branches ?? 2;
  const width = options.width ?? 0.16;

  const trunk = displace([from, to], depth, sway, random);
  const out: BoltBranch[] = [{ points: trunk, width }];

  for (let b = 0; b < branchCount; b += 1) {
    // 从主干上三分之一到三分之二之间岔出去
    const index = Math.floor(trunk.length * (0.3 + random() * 0.4));
    const start = trunk[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) * (0.2 + random() * 0.2);
    const angle = random() * Math.PI * 2;
    const end: Vec3 = {
      x: start.x + Math.cos(angle) * length * 0.6,
      y: start.y - length * 0.8,
      z: start.z + Math.sin(angle) * length * 0.6,
    };
    out.push({ points: displace([start, end], Math.max(2, depth - 2), sway * 1.3, random), width: width * 0.5 });
  }
  return out;
}

function displace(points: Vec3[], depth: number, sway: number, random: () => number): Vec3[] {
  let current = points;
  for (let level = 0; level < depth; level += 1) {
    const next: Vec3[] = [current[0]];
    for (let i = 0; i < current.length - 1; i += 1) {
      const a = current[i];
      const b = current[i + 1];
      const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const amount = length * sway;
      next.push({
        x: (a.x + b.x) / 2 + (random() - 0.5) * 2 * amount,
        y: (a.y + b.y) / 2 + (random() - 0.5) * amount * 0.4,
        z: (a.z + b.z) / 2 + (random() - 0.5) * 2 * amount,
      });
      next.push(b);
    }
    current = next;
  }
  return current;
}
