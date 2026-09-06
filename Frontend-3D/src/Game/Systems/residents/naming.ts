import { NET_LIMITS } from "core";
import { emit } from "../../EventBus";
import { isRemoteWorld } from "../../Multiplayer/worldLock";
import { getResident } from "../../State/residentsRuntime";

/**
 * 改称呼（居民系统 04）：他叫你的昵称、他的口头禅。两个都是玩家在对话里改的，
 * 长度闸和玩家名同一条（`NET_LIMITS.maxNameLength`）；空串 = 清掉，退回默认。
 * 做客时不改：那是房主的邻居。
 */
export function setResidentAddress(
  residentId: string,
  target: "nickname" | "catchphrase",
  value: string,
): boolean {
  if (isRemoteWorld()) return false;
  const agent = getResident(residentId);
  if (!agent) return false;
  const cleaned = value.trim().slice(0, NET_LIMITS.maxNameLength);
  if (target === "nickname") agent.playerNickname = cleaned || undefined;
  else agent.catchphrase = cleaned || undefined;
  emit("resident_changed", { residentId, reason: "address" });
  return true;
}
