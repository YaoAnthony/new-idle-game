import type { LocalizationKey, RoomId, WorldPosition } from "./base.js";

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
  localizationKey: LocalizationKey;
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
};
