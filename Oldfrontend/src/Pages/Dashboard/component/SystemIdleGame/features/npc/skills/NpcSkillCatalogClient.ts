import {
  DEFAULT_NPC_CAPABILITY_SKILLS,
  type NpcCapabilitySkillDefinition,
} from '../../../shared/NpcDefaultSkillCatalog';

export interface NpcSkillCatalogClientOptions {
  getBackendUrl: () => string;
  getAuthToken?: () => string | null;
}

export class NpcSkillCatalogClient {
  private cache: NpcCapabilitySkillDefinition[] | null = null;

  constructor(private readonly options: NpcSkillCatalogClientOptions) {}

  async getCatalog(): Promise<NpcCapabilitySkillDefinition[]> {
    if (this.cache) return this.cache;
    const token = this.options.getAuthToken?.();
    try {
      const response = await fetch(`${this.options.getBackendUrl()}/profile/npc/skill-catalog`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error(`skill catalog ${response.status}`);
      const payload = await response.json();
      const skills = Array.isArray(payload?.skills) ? payload.skills : null;
      const catalog = skills?.length ? skills : DEFAULT_NPC_CAPABILITY_SKILLS;
      this.cache = catalog;
      return catalog;
    } catch (error) {
      console.warn('[NpcSkillCatalogClient] using fallback skill catalog', error);
      this.cache = DEFAULT_NPC_CAPABILITY_SKILLS;
      return DEFAULT_NPC_CAPABILITY_SKILLS;
    }
  }
}
