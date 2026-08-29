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
     * 午夜就算新的一天。**世界日 = 主机日历日，永远相等。**
     *
     * 原来是 04:00，理由是"熬夜到凌晨 2 点的人主观上还在今天"，
     * 动森、星露谷也都是这个量级。那个理由本身没错，但它和日记本
     * 撞了：日记的一页就是日历上的一天，凌晨 2 点打开日记本，
     * 屏幕上写着 8月27，电脑右下角写着 8月28，没有解释能圆过去。
     *
     * 更硬的一条是数据：`dayFacts` 按 worldDayId 归档。如果只把日记本
     * 的"今天"改成日历日、机制还按 4 点走，那 0 点到 4 点之间记的每一笔
     * 都会落到"昨天"那一页上——记完了在今天这页找不到，比日期标错难查。
     * 两个"今天"不能并存，所以是这一头改，不是那一头改。
     *
     * 代价说清楚：熬夜到凌晨 2 点时日期会翻页、天气重掷、每日限额刷新。
     * 要换回去只改这一个值。
     */
    dayRolloverLocalTime: "00:00",

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
