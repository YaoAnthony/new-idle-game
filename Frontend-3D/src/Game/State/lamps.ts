import { FurnitureCapability } from "core";
import { emit } from "../EventBus";
import { getDefinition, getWorld } from "./worldRuntime";

/**
 * 哪几盏灯被拉了开关（V0.14）。键为家具 instanceId。
 *
 * **是世界状态**，和唱片机一个待遇：进 WorldSave、联机走 op 即时广播 +
 * 房主整片刷新收敛。理由是灯光是共享的物理事实——你在屋里关了灯，
 * 站在同一间屋子里的人也该跟着变暗。各人自己的偏好（音量、画质）
 * 才走 localStorage，亮度不是那种东西。
 *
 * 表里**没有条目 = 开着**。出厂即亮，老存档和别人房里的灯不用任何迁移
 * 就是对的；只有被人动过手的那几盏才占一条记录。反过来存"哪几盏亮着"
 * 的话，每摆一盏灯就要立刻写一条永远不变的记录。
 *
 * 注意"开着"不等于"此刻在发光"：白天开着的灯也是暗的（`Lighting`
 * 按昼夜相位给强度）。这里管的是**开关的位置**，不是灯泡的亮度。
 */

let switches = new Map<string, boolean>();

/** 这件家具身上有没有开关（数据驱动：带 Lighting 能力的都有） */
export function isSwitchableLamp(instanceId: string): boolean {
  const placed = getWorld().placedFurniture.find(
    (item) => item.instanceId === instanceId,
  );
  const definition = placed ? getDefinition(placed.furnitureId) : undefined;
  return Boolean(
    definition?.placement.capabilities.includes(FurnitureCapability.Lighting),
  );
}

/** 这盏灯的开关在哪一档。查不到条目 = 开着 */
export function isLampOn(instanceId: string): boolean {
  return switches.get(instanceId) ?? true;
}

/**
 * 本地玩家拉开关。
 *
 * 对外**只给"设成 on/off"不给"切一下"**：联机那一侧 op 通道是尽力而为的
 * 转发，发 toggle 的话丢一包就永久相反了。要切的调用方自己
 * `setLampOn(id, !isLampOn(id))`——本地读到的就是权威值。
 */
export function setLampOn(instanceId: string, on: boolean): void {
  if (!isSwitchableLamp(instanceId)) return;
  if (isLampOn(instanceId) === on) return;

  switches.set(instanceId, on);
  emit("lamp_changed", { instanceId });
  emit("world_op", { op: { kind: "lamp_switched", instanceId, on } });
}

/** 重放房里其他人拉的开关（不发 op，无回环）。幂等 */
export function replayLampSwitch(instanceId: string, on: boolean): void {
  if (!isSwitchableLamp(instanceId)) return;
  if (isLampOn(instanceId) === on) return;

  switches.set(instanceId, on);
  emit("lamp_changed", { instanceId });
}

// ---- 存档 / 联机切片 ----

export function snapshotLamps(): Record<string, { on: boolean }> {
  const out: Record<string, { on: boolean }> = {};
  for (const [instanceId, on] of switches) {
    out[instanceId] = { on };
  }
  return out;
}

export function restoreLamps(
  saved: Record<string, { on: boolean }> | undefined,
): void {
  switches = new Map();
  for (const [instanceId, entry] of Object.entries(saved ?? {})) {
    switches.set(instanceId, entry.on);
  }
  /*
   * 这里**不校验 instanceId 还在不在**：restore 的调用点在家具表灌好之前，
   * 当场查会把好条目也判死。孤儿条目由 pruneOrphanLamps 在恢复流程末尾
   * 统一扫掉（和储物箱、唱片机同一处调用）。
   */
  emit("lamp_changed", { instanceId: "" });
}

/** 家具已经不在屋里的开关记录，读档末尾清掉，免得它在存档里越积越多 */
export function pruneOrphanLamps(liveInstanceIds: readonly string[]): void {
  const alive = new Set(liveInstanceIds);
  for (const instanceId of [...switches.keys()]) {
    if (!alive.has(instanceId)) switches.delete(instanceId);
  }
}
