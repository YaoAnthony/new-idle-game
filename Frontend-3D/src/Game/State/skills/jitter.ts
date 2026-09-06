/**
 * 技能里**唯一允许**的随机（决策 22：`Math.random` 只许出现在动画级抖动；15 的守卫用例盯着这一条）。
 *
 * 这里的两件事都只在房主端、只影响"多久 / 要不要"，不决定内容：内容抽签（闲聊段、委托、赠礼）走
 * `hashSeed` 的确定性抽取。算出来的秒数写进 Intent 再上网线，房客拿到的是数字不是骰子，两端不会分叉；
 * 不进存档。
 */
export function jitterSeconds(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** 掷一次点：probability ∈ [0, 1] */
export function chance(probability: number): boolean {
  return Math.random() < probability;
}
