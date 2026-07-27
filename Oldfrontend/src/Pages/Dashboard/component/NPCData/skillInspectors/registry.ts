import type { NpcSkillInspectorDefinition } from './types';
import { FarmPlotWorkerInspector } from './farm/FarmPlotWorkerInspector';
import { FARM_PLOT_WORKER_SKILL_ID } from '../../SystemIdleGame/shared/NpcDefaultSkillCatalog';

export const NPC_SKILL_INSPECTORS: NpcSkillInspectorDefinition[] = [
  {
    skillId: FARM_PLOT_WORKER_SKILL_ID,
    label: 'Farm Plot Worker',
    shouldShow: (ctx) => Boolean(ctx.mind?.skills?.[FARM_PLOT_WORKER_SKILL_ID]?.learned),
    Component: FarmPlotWorkerInspector,
  },
];

export function findNpcSkillInspector(skillId: string): NpcSkillInspectorDefinition | null {
  return NPC_SKILL_INSPECTORS.find((inspector) => inspector.skillId === skillId) ?? null;
}
