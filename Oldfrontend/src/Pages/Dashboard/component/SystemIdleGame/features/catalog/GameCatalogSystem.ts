import type { GameNpcDefinition } from '../../shared/GameNpcCatalog';
import { getNpcDefinitionById, setRuntimeNpcCatalog } from '../../shared/GameNpcCatalog';
import { setRuntimeNpcSkillCatalog } from '../../shared/NpcDefaultSkillCatalog';
import type { PetDefinition } from '../pets/PetTypes';
import { getPetDefinition, getPetDefinitionByItemId, setRuntimePetDefinitions } from '../pets/PetDefinitions';
import { loadGameCatalog, type GameCatalogPayload } from '../../catalog/GameRuntimeCatalog';

export class GameCatalogSystem {
  private payload: GameCatalogPayload | null = null;

  load(payload: GameCatalogPayload | null | undefined): void {
    this.payload = payload ?? null;
    loadGameCatalog(this.payload);
    setRuntimeNpcCatalog(this.payload?.npcs ?? null);
    setRuntimeNpcSkillCatalog(this.payload?.npcSkills ?? null);
    setRuntimePetDefinitions((this.payload?.pets ?? null) as PetDefinition[] | null);
  }

  getSnapshot(): GameCatalogPayload | null {
    return this.payload;
  }

  getNpcDefinitionById(id: string): GameNpcDefinition | null {
    return getNpcDefinitionById(id);
  }

  getPetDefinition(id: string): PetDefinition | null {
    return getPetDefinition(id);
  }

  getPetDefinitionByItemId(itemId: string): PetDefinition | null {
    return getPetDefinitionByItemId(itemId);
  }
}
