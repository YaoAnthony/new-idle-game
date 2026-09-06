import { AffectionStage } from "../../types/residents.js";

/**
 * 称呼表（居民系统 04）：每一档他怎么叫你。台词里的 `{you}` 按这张表渲染。
 *
 * - generic：不叫（呼语为空，台词里的"{you}，"整个收掉）
 * - player_name：叫你的名字
 * - nickname：叫他给你起的昵称（`ResidentSave.playerNickname`）；还没起就退回名字
 */
export type AddressForm = { kind: "generic" } | { kind: "player_name" } | { kind: "nickname" };

export const addressDefinitions: Record<AffectionStage, AddressForm> = {
  [AffectionStage.Stranger]: { kind: "generic" },
  [AffectionStage.FamiliarResident]: { kind: "player_name" },
  [AffectionStage.LifeCompanion]: { kind: "nickname" },
  [AffectionStage.Family]: { kind: "nickname" },
};

export function addressFormOf(stage: AffectionStage): AddressForm {
  return addressDefinitions[stage] ?? { kind: "generic" };
}
