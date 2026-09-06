import type { Skill } from "./types";

/**
 * 做生意（原 RoomScene 里"商人按 F 开交易面板"那一支，2026-09-06 搬出来）。
 * 挂在水獭和小鱼人子类上。没有 `decide`——他在不在场由 `Systems/trading` 按
 * 班表管，不是技能的事；这里只回答"按 F 开什么"。
 *
 * **是哪个商人由物种推**（期 6 加了第二个）。不在面板里判——面板只认一个
 * merchantId，谁递给它都行。映射表放这里而不是子类：两位商人共用一个技能，
 * 表在一处。
 */
const MERCHANT_OF: Record<string, string> = {
  otter_trader: "otter_trader",
  fish_trader: "traveling_peddler",
};

export const tradeSkill: Skill = {
  id: "trade",
  interact: ({ agent }) => {
    if (agent.dormant) return null;
    const merchantId = MERCHANT_OF[agent.definitionId];
    return merchantId ? { kind: "trade", merchantId } : null;
  },
};
