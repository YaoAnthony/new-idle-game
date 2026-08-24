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

/**
 * **运行时里装着的是别人的世界**（做客中）。
 *
 * 和上面那个只读位是两件事：只读是"能不能动"，这个是"动的是谁的东西"。
 * 现在权限恒为满，但归属问题一直在——最要命的一处是金币：做客时罐子是
 * 房主的，赚到的钱直接入账等于往朋友的罐里塞钱。
 *
 * 住在这个文件而不是从 `session.isRemoteWorldActive()` 读，是为了斩断
 * 循环导入：读它的是 `State/gold`，而 session → serialize → gold 已经是
 * 一条链，gold 再回头 import session 就成环。这个文件只依赖 chatLog，
 * 谁 import 它都绕不回来——和上面那个位同一个理由。
 *
 * **真相仍在 session 的 `state.kind`**，这里是它在两个换世界出入口
 * （enterRemoteWorld / exitRemoteWorld）上的镜像。所有离开路径都经过
 * exitRemoteWorld，所以镜像是完备的。
 */
let inRemoteWorld = false;

export function setRemoteWorldActive(on: boolean): void {
  inRemoteWorld = on;
}

/** 现在站着的是不是别人的世界。归属类判断（钱进谁的罐）问它 */
export function isRemoteWorld(): boolean {
  return inRemoteWorld;
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
