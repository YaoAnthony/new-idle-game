import { findResidentDefinition } from "core";
import { getResident, getResidents } from "../Game/State/residentsRuntime";
import { t } from "./t";

/**
 * 宠物的显示名。名字分两层：
 *
 *   物种名（ResidentDefinition.localizationKey）—— 图鉴上的名字，如"苔灵"
 *   昵称（ResidentSave.nickname ?? defaultNicknameKey）—— 玩家叫它的名字，如"苔苔"
 *
 * UI 上到处要用的是**昵称**，所以这里统一出口，免得各处再写死某个 key。
 */

/** 某只宠物的昵称。玩家改过的优先，否则回落到物种默认昵称 */
export function residentNickname(residentId: string): string {
  const resident = getResident(residentId);
  if (resident?.nickname) return resident.nickname;

  const definition = resident ? findResidentDefinition(resident.definitionId) : undefined;
  return definition ? t(definition.defaultNicknameKey) : t("pet.unknown");
}

/** 物种名（图鉴用），和昵称区分开 */
export function residentSpeciesName(residentId: string): string {
  const resident = getResident(residentId);
  const definition = resident ? findResidentDefinition(resident.definitionId) : undefined;
  return definition ? t(definition.localizationKey) : t("pet.unknown");
}

/**
 * 屋里第一只宠物的昵称。给那些"就说家里那只"的文案用
 * （行动陪伴提示之类），屋里还没有宠物时回落到中性称呼。
 */
export function firstResidentNickname(): string {
  const first = getResidents()[0];
  return first ? residentNickname(first.residentId) : t("pet.unknown");
}
