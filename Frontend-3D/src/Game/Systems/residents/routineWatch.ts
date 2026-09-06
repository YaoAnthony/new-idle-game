import { on } from "../../EventBus";
import { getResidents } from "../../State/residentsRuntime";
import { routinePlanOf } from "../../State/skills/routine";

/**
 * 作息的时钟哨兵（居民系统 02）。
 *
 * 回家睡觉那条 Intent 是**不可打断**的（亲近 / 游荡不该把人叫起来），睡多久按
 * "距起床还有几秒"算——真实时间下够用。可时钟会**跳**：`/time day`、`/advance 8`、
 * 设备改时区。跳过去以后计划早已不是睡觉，人却还按旧秒数躺着。
 *
 * 所以时段 / 换日一变就巡一遍：谁在按作息睡、此刻的计划又不是睡，就叫醒他。
 * 醒了以后照常问技能——hang_home 会让他出门伸个懒腰。只在房主端跑（木偶不决策）。
 */
export function wakeStaleSleepers(): number {
  let woken = 0;
  for (const resident of getResidents()) {
    if (resident.puppet || !resident.asleep) continue;
    if (resident.currentIntent?.skillId !== "routine") continue;
    const now = routinePlanOf(resident);
    if (!now || now.plan.kind === "sleep_home") continue;
    resident.wakeUp();
    woken += 1;
  }
  return woken;
}

export function startRoutineWatch(): () => void {
  const offPhase = on("day_phase_changed", () => wakeStaleSleepers());
  const offDay = on("world_day_changed", () => wakeStaleSleepers());
  return () => {
    offPhase();
    offDay();
  };
}
