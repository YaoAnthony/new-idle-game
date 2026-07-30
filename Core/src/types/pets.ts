import type {
  LocalizationKey,
  RoomId,
  VisualId,
  WorldPosition,
} from "./base.js";

export type PetId = string;
export type PetDefinitionId = string;

export enum AffectionStage {
  Stranger = "stranger",
  FamiliarResident = "familiar_resident",
  LifeCompanion = "life_companion",
  Family = "family",
}

export type PetDefinition = {
  id: PetDefinitionId;
  /** 物种名（图鉴上的名字），不是玩家叫它的名字 */
  localizationKey: LocalizationKey;
  /** 初见时给的默认昵称。玩家改过之后存进 PetSave.nickname */
  defaultNicknameKey: LocalizationKey;
  /** 造型由表现层的 VisualRegistry 解析：先程序化，以后换精模只改那一张表 */
  visualId: VisualId;
  species: string;
};

export type PetSave = {
  petId: PetId;
  definitionId: PetDefinitionId;
  roomId: RoomId;
  position: WorldPosition;
  affectionStage: AffectionStage;
  growth: number;
  needs: Record<string, number>;
  /** 玩家改过的昵称。没改过就是 undefined，显示 defaultNicknameKey */
  nickname?: string;
};
