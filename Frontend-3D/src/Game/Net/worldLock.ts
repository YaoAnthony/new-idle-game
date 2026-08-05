import { pushSystemMessage } from "../State/chatLog";

/**
 * "当前世界是不是只读"的那一个布尔，带守卫。
 *
 * 单独一个文件而不是并进 session.ts，是为了斩断循环导入：守卫的
 * 调用方在 Game/State 和 Game/Systems（storage、dropping、placement、
 * kitchen 的突变入口），而 session.ts 又要 import 这些模块的 restore/
 * snapshot——守卫住在 session 里的话就是 storage → session → storage
 * 的环。这个文件只依赖 chatLog（提示用），谁 import 它都不会绕回来。
 *
 * 写它的人只有 session（做客进场 true、回家 false）。
 */

/**
 * 2026-08-04 起默认恒为 false（满权限）：session 不再在做客时置 true。
 * 机制保留，是将来分级权限的开关位。
 */
let readOnly = false;
let lastToastAt = 0;

export function setWorldReadOnly(on: boolean): void {
  readOnly = on;
}

export function isWorldReadOnly(): boolean {
  return readOnly;
}

/**
 * 世界突变入口的统一守卫：true = 拦下了（已提示玩家），调用方直接退。
 * 提示限频——拆一次箱子连弹五条"不能动"比拦截本身更烦人。
 */
export function guardWorldMutation(): boolean {
  if (!readOnly) return false;

  const now = Date.now();
  if (now - lastToastAt > 2500) {
    lastToastAt = now;
    pushSystemMessage("做客期间还不能动别人家的东西（很快就可以了）");
  }
  return true;
}
