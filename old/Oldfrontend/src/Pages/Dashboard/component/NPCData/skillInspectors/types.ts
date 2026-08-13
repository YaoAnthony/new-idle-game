import type React from 'react';
import type {
  NpcLearnedSkillState,
  NpcMindState,
  WorldState,
} from '../../SystemIdleGame/shared/worldStateTypes';

export interface NpcSkillInspectorAgentWorld {
  currentPlace?: { id?: string; name?: string; type?: string; source?: string };
  position?: unknown;
  nearbyPlaces?: unknown;
  visibleObjects?: unknown;
  availableActions?: unknown;
  activeGoal?: unknown;
  recentFailures?: unknown;
}

export interface NpcSkillInspectorContext {
  npcName: string;
  mind: NpcMindState | null;
  worldState: WorldState | null;
  inventory: Record<string, number>;
  agentWorld: NpcSkillInspectorAgentWorld | null;
  currentGameMinute: number;
}

export interface NpcSkillInspectorProps extends NpcSkillInspectorContext {
  skillId: string;
  skill: NpcLearnedSkillState;
  label: string;
}

export interface NpcSkillInspectorDefinition {
  skillId: string;
  label: string;
  shouldShow: (ctx: NpcSkillInspectorContext) => boolean;
  Component: React.ComponentType<NpcSkillInspectorProps>;
}
