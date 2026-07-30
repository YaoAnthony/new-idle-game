import { DayPhaseId, type TimePolicyDefinition } from "../../types/time.js";

/**
 * 时间策略注册表。
 *
 * **模式只有 real_time**：世界时间就是现实时间，不加速、不暂停。
 * 这是"专注陪伴工具"这个定位的直接结果——你现实里过了一天，
 * 屋里也过了一天，不存在"挂机加速"这回事。
 */
export const timePolicyDefinitions = [
  {
    id: "default",
    mode: "real_time",

    /**
     * 凌晨 4 点才算新的一天。
     *
     * 不用 00:00 是因为它和人的作息不符——熬夜到凌晨 2 点的人
     * 主观上还在"今天"，这时候让日期翻页、天气重掷、每日限额刷新，
     * 会显得莫名其妙。4 点是通行做法（动森、星露谷都是这个量级）。
     */
    dayRolloverLocalTime: "04:00",

    /**
     * 四个时段的**起始**本地时刻，按时间升序。
     * 光照、窗外天空、环境音音量都读这个。
     */
    dayPhases: [
      { phaseId: DayPhaseId.Dawn, startsAtLocalTime: "05:00" },
      { phaseId: DayPhaseId.Day, startsAtLocalTime: "08:00" },
      { phaseId: DayPhaseId.Dusk, startsAtLocalTime: "17:30" },
      { phaseId: DayPhaseId.Night, startsAtLocalTime: "20:00" },
    ],
  },
] satisfies TimePolicyDefinition[];

export const DEFAULT_TIME_POLICY_ID = "default";

export function findTimePolicyDefinition(
  policyId: string,
): TimePolicyDefinition | undefined {
  return timePolicyDefinitions.find((policy) => policy.id === policyId);
}
