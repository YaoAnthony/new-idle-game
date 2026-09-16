/**
 * 注视的几何（居民系统 21）：转身走最短的那一边、头相对身体扭多少。
 *
 * 纯函数、不带数——转速和限角由调用方从 `attentionTuning` 递进来。
 * 身体（ResidentAgent、CharacterController）和木偶回放都调这几个，
 * 三处转身的手感只有这一份。
 */

/** 把角度折回 (−π, π] */
export function wrapAngle(rad: number): number {
  let a = rad % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * 从 `current` 朝 `target` 转一帧，走最短的那一边。一阶趋近：每秒收掉 1−e^−rate 的差，
 * `rate * dt ≥ 1` 时一帧到位（帧率极低时也不会转过头）。
 */
export function approachAngle(current: number, target: number, rate: number, deltaSeconds: number): number {
  return current + wrapAngle(target - current) * Math.min(1, rate * deltaSeconds);
}

/**
 * 站在 (x, z)、身体朝 `heading` 时，要看 (toX, toZ) 头得相对身体扭多少（弧度），
 * 夹在 ±clamp 内。目标就在脚下（同一点）时不扭。
 * 角度约定和 heading 一致：0 = +z，正值向 +x 那一侧转。
 */
export function headYawToward(heading: number, x: number, z: number, toX: number, toZ: number, clamp: number): number {
  const dx = toX - x;
  const dz = toZ - z;
  if (dx === 0 && dz === 0) return 0;
  const relative = wrapAngle(Math.atan2(dx, dz) - heading);
  return Math.max(-clamp, Math.min(clamp, relative));
}
