import type { NpcAction } from '../../../types';
import type { Npc } from '../../../entities/Npc';
import type { ActionExecutor } from '../../../actions/actor/ActionExecutor';
import type { AgentWorldContext, AgentWorldModel } from '../../../ai/world/AgentWorldModel';
import type { PerceptionResult } from '../../../systems/WorldPerceptionSystem';
import type { WorldStateManager } from '../../../shared/WorldStateManager';
import type { NpcMindState, NpcMemoryRecord } from '../../../shared/worldStateTypes';
import { getFoodHungerRestore } from '../../../shared/food';
import {
  canUseNpcKnowledgeSkill,
} from '../../../shared/NpcDefaultSkillCatalog';
import { getAssignedFarmPlots, hasLearnedFarmPlotWorker } from '../skills/NpcSkillTypes';
import { canRunFreeThink } from './NpcScheduleBlackboardSystem';

export interface NpcUtilityPlannerOutcome {
  intent: NpcMindState['currentIntent'];
  actions: NpcAction[];
}

const HUNGER_FOOD_THRESHOLD = 45;
const HUNGER_EMERGENCY_THRESHOLD = 25;

export class NpcUtilityPlanner {
  constructor(
    private readonly worldStateManager: WorldStateManager,
    private readonly actionExecutor: ActionExecutor,
    private readonly agentWorldModel?: AgentWorldModel,
  ) {}

  planAndExecute(npcId: string, npc: Npc, perception: PerceptionResult, mind: NpcMindState, absoluteGameMinutes: number): void {
    const agentWorld = this.agentWorldModel?.buildContext(npcId, mind) ?? null;
    const outcome = this.buildOutcome(npcId, npc, perception, mind, absoluteGameMinutes, agentWorld);
    this.worldStateManager.patchNpcMindState(npcId, {
      currentIntent: outcome.intent,
      lastThoughtGameMinute: absoluteGameMinutes,
      lastPlannedGameMinute: outcome.actions.length > 0 ? absoluteGameMinutes : mind.lastPlannedGameMinute,
      meta: {
        ...(mind.meta ?? {}),
        lastPerceptionSummary: perception.summary,
        agentWorld,
      },
    });
    if (outcome.actions.length > 0) this.actionExecutor.execute(npc, outcome.actions, absoluteGameMinutes);
  }

  private buildOutcome(
    npcId: string,
    npc: Npc,
    perception: PerceptionResult,
    memory: NpcMindState,
    absoluteGameMinutes: number,
    agentWorld: AgentWorldContext | null,
  ): NpcUtilityPlannerOutcome {
    if (npc.isFollowingPlayer()) {
      return {
        intent: {
          kind: 'follow_player',
          reason: 'follow_mode_enabled',
          targetId: 'player',
          targetType: 'player',
          updatedAtGameMinute: absoluteGameMinutes,
        },
        actions: [],
      };
    }

    const hunger = memory.body?.hunger ?? memory.needs?.hunger ?? 100;
    if (hunger < HUNGER_FOOD_THRESHOLD) {
      const carriedFoodId = this.pickCarriedFoodId(npc);
      if (carriedFoodId) {
        return {
          intent: {
            kind: 'perform_skill',
            reason: hunger < HUNGER_EMERGENCY_THRESHOLD ? 'hunger_emergency_eat_carried_food' : 'hungry_eat_carried_food',
            targetType: carriedFoodId,
            updatedAtGameMinute: absoluteGameMinutes,
          },
          actions: [{ type: 'eat', itemId: carriedFoodId, duration: 2 }],
        };
      }

      const edibleDrop = this.pickVisibleEdibleDrop(perception);
      if (edibleDrop) {
        return {
          intent: {
            kind: 'seek_drop',
            reason: hunger < HUNGER_EMERGENCY_THRESHOLD ? 'hunger_emergency_food_drop_visible' : 'hungry_food_drop_visible',
            targetKey: `drop:${edibleDrop.id}`,
            targetId: edibleDrop.id,
            targetType: edibleDrop.itemId,
            targetWorldId: edibleDrop.worldId,
            targetX: edibleDrop.x,
            targetY: edibleDrop.y,
            updatedAtGameMinute: absoluteGameMinutes,
          },
          actions: [{
            type: 'pickup_item',
            itemId: edibleDrop.itemId,
            target: { kind: 'coords', x: edibleDrop.x, y: edibleDrop.y, worldId: edibleDrop.worldId },
          }],
        };
      }

      const rememberedFoodSource = canUseNpcKnowledgeSkill(memory, 'pick_apple_tree_day')
        ? this.pickOntologyFoodSource(memory, perception, absoluteGameMinutes)
          ?? this.pickRememberedFruitSource(memory, perception, absoluteGameMinutes)
        : null;
      if (rememberedFoodSource) {
        const treeId = typeof rememberedFoodSource.meta?.treeId === 'string'
          ? rememberedFoodSource.meta.treeId
          : rememberedFoodSource.sourceId;
        return {
          intent: {
            kind: 'perform_skill',
            reason: hunger < HUNGER_EMERGENCY_THRESHOLD ? 'hunger_emergency_remembered_food_source' : 'hungry_remembered_food_source',
            targetKey: rememberedFoodSource.key,
            targetId: treeId,
            targetType: 'fruit_tree',
            targetWorldId: rememberedFoodSource.worldId,
            targetX: rememberedFoodSource.x,
            targetY: rememberedFoodSource.y,
            updatedAtGameMinute: absoluteGameMinutes,
          },
          actions: treeId
            ? [{
                type: 'pick_fruit',
                treeId,
                itemId: typeof rememberedFoodSource.meta?.itemId === 'string' ? rememberedFoodSource.meta.itemId : 'fruit',
                target: {
                  kind: 'coords',
                  x: rememberedFoodSource.x,
                  y: rememberedFoodSource.y,
                  worldId: rememberedFoodSource.worldId,
                },
                duration: 3,
              }]
            : [{
                type: 'move',
                target: {
                  kind: 'coords',
                  x: rememberedFoodSource.x,
                  y: rememberedFoodSource.y,
                  worldId: rememberedFoodSource.worldId,
                },
              }],
        };
      }

      const fruitTree = canUseNpcKnowledgeSkill(memory, 'pick_apple_tree_day')
        ? this.pickVisibleFruitTree(perception, agentWorld)
        : null;
      if (fruitTree) {
        return {
          intent: {
            kind: 'perform_skill',
            reason: hunger < HUNGER_EMERGENCY_THRESHOLD ? 'hunger_emergency_pick_fruit' : 'hungry_pick_fruit',
            targetKey: `tree:${fruitTree.id}`,
            targetId: fruitTree.id,
            targetType: 'fruit_tree',
            targetWorldId: fruitTree.worldId,
            targetX: fruitTree.x,
            targetY: fruitTree.y,
            updatedAtGameMinute: absoluteGameMinutes,
          },
          actions: [{
            type: 'pick_fruit',
            treeId: fruitTree.id,
            itemId: 'fruit',
            target: { kind: 'coords', x: fruitTree.x, y: fruitTree.y, worldId: fruitTree.worldId },
            duration: 3,
          }],
        };
      }
    }

    if (memory.schedule?.currentActivity === 'work_farm') {
      const hasFarmWorkerSkill = hasLearnedFarmPlotWorker(memory);
      const assignedPlots = getAssignedFarmPlots(memory);
      return {
        intent: {
          kind: 'wait',
          reason: !hasFarmWorkerSkill
            ? 'scheduled_farm_work_requires_farming_till_skill'
            : assignedPlots.length === 0
              ? 'scheduled_farm_worker_has_no_assigned_plots'
              : 'farm_skill_runtime_controls_farm_work',
          updatedAtGameMinute: absoluteGameMinutes,
        },
        actions: [],
      };
    }

    if (!canRunFreeThink(memory.schedule?.currentActivity ?? null)) {
      return {
        intent: { kind: 'wait', reason: `scheduled_${memory.schedule?.currentActivity ?? 'busy'}`, updatedAtGameMinute: absoluteGameMinutes },
        actions: [],
      };
    }

    const urgentGoal = memory.goals
      .filter((goal) => goal.status === 'active')
      .sort((a, b) => b.urgency - a.urgency || a.createdAtGameMinute - b.createdAtGameMinute)[0];
    if (urgentGoal?.kind === 'heart_reflection' && urgentGoal.targetX != null && urgentGoal.targetY != null) {
      return {
        intent: {
          kind: 'stand_silent',
          reason: urgentGoal.reason ?? 'heart_goal',
          targetWorldId: urgentGoal.targetWorldId,
          targetX: urgentGoal.targetX,
          targetY: urgentGoal.targetY,
          targetKey: urgentGoal.sourceMemoryKey,
          updatedAtGameMinute: absoluteGameMinutes,
        },
        actions: [{
          type: 'move',
          target: { kind: 'coords', x: urgentGoal.targetX, y: urgentGoal.targetY, worldId: urgentGoal.targetWorldId },
          duration: 5,
        }],
      };
    }

    if (this.shouldRestInsteadOfExplore(memory, absoluteGameMinutes, npcId)) {
      return {
        intent: {
          kind: 'wait',
          reason: 'fatigue_reduces_autonomous_movement_desire',
          updatedAtGameMinute: absoluteGameMinutes,
        },
        actions: [],
      };
    }

    const visibleDrop = perception.visibleDrops[0];
    if (visibleDrop) {
      return {
        intent: {
          kind: 'seek_drop',
          reason: 'visible_drop_detected',
          targetKey: `drop:${visibleDrop.id}`,
          targetId: visibleDrop.id,
          targetType: visibleDrop.itemId,
          targetWorldId: visibleDrop.worldId,
          targetX: visibleDrop.x,
          targetY: visibleDrop.y,
          updatedAtGameMinute: absoluteGameMinutes,
        },
        actions: [{
          type: 'pickup_item',
          itemId: visibleDrop.itemId,
          target: { kind: 'coords', x: visibleDrop.x, y: visibleDrop.y, worldId: visibleDrop.worldId },
        }],
      };
    }

    const landmark = perception.landmarks[0];
    if (landmark) {
      return {
        intent: {
          kind: 'move_to_landmark',
          reason: 'explore_visible_landmark',
          targetKey: `landmark:${landmark.kind}:${landmark.id ?? landmark.label}`,
          targetId: landmark.id,
          targetType: landmark.kind,
          targetWorldId: landmark.worldId,
          targetX: landmark.x,
          targetY: landmark.y,
          updatedAtGameMinute: absoluteGameMinutes,
        },
        actions: [{ type: 'move', target: { kind: 'coords', x: landmark.x, y: landmark.y, worldId: landmark.worldId }, duration: 4 }],
      };
    }

    return {
      intent: { kind: 'idle', reason: 'nothing_interesting', updatedAtGameMinute: absoluteGameMinutes },
      actions: [],
    };
  }

  private pickCarriedFoodId(npc: Npc): string | null {
    const inventory = npc.getInventory(npc.name);
    return Object.keys(inventory)
      .filter((itemId) => Number(inventory[itemId] ?? 0) > 0)
      .map((itemId) => ({ itemId, restore: getFoodHungerRestore(itemId) }))
      .filter((entry) => entry.restore > 0)
      .sort((a, b) => b.restore - a.restore)[0]?.itemId ?? null;
  }

  private pickVisibleEdibleDrop(perception: PerceptionResult) {
    return perception.visibleDrops
      .map((drop) => ({ drop, restore: getFoodHungerRestore(drop.itemId) }))
      .filter((entry) => entry.restore > 0)
      .sort((a, b) => b.restore - a.restore || a.drop.distance - b.drop.distance)[0]?.drop ?? null;
  }

  private pickRememberedFruitSource(memory: NpcMindState, perception: PerceptionResult, absoluteGameMinutes: number): NpcMemoryRecord | null {
    const currentWorldId = perception.self.worldId;
    return Object.values(memory.memoryIndex.semantic)
      .filter((record) => record.type === 'food_source' || record.meta?.resourceKind === 'fruit_tree')
      .filter((record) => !record.worldId || record.worldId === currentWorldId)
      .filter((record) => absoluteGameMinutes - record.lastSeenGameMinute < 3000)
      .sort((a, b) => Math.hypot(a.x - perception.self.x, a.y - perception.self.y) - Math.hypot(b.x - perception.self.x, b.y - perception.self.y))[0] ?? null;
  }

  private pickOntologyFoodSource(memory: NpcMindState, perception: PerceptionResult, absoluteGameMinutes: number): NpcMemoryRecord | null {
    const ontology = memory.ontology;
    if (!ontology) return null;
    const currentWorldId = perception.self.worldId;
    const activeClaims = Object.values(ontology.claims ?? {})
      .filter((claim) => claim.status === 'active')
      .filter((claim) => claim.predicate === 'can_satisfy' || claim.predicate === 'provides')
      .filter((claim) => String(claim.object) === 'need:hunger' || String(claim.object) === 'item:fruit')
      .filter((claim) => !claim.expiresAtGameMinute || claim.expiresAtGameMinute > absoluteGameMinutes)
      .filter((claim) => !claim.worldId || claim.worldId === currentWorldId)
      .filter((claim) => typeof claim.x === 'number' && typeof claim.y === 'number');
    const best = activeClaims
      .sort((a, b) => {
        const confidenceDelta = (b.confidence ?? 0) - (a.confidence ?? 0);
        if (Math.abs(confidenceDelta) > 0.12) return confidenceDelta;
        return Math.hypot((a.x ?? 0) - perception.self.x, (a.y ?? 0) - perception.self.y)
          - Math.hypot((b.x ?? 0) - perception.self.x, (b.y ?? 0) - perception.self.y);
      })[0];
    if (!best) return null;
    const affordance = Object.values(ontology.affordances ?? {})
      .find((entry) => entry.subject === best.subject && entry.action === 'pick_fruit');
    return {
      key: best.id,
      sourceId: affordance?.targetId,
      kind: 'landmark',
      type: 'food_source',
      label: '记住的果树食物来源',
      worldId: best.worldId,
      x: best.x ?? perception.self.x,
      y: best.y ?? perception.self.y,
      lastSeenGameMinute: best.lastConfirmedGameMinute,
      meta: {
        resourceKind: 'fruit_tree',
        treeId: affordance?.targetId,
        itemId: 'fruit',
        ontologyClaimId: best.id,
      },
    };
  }

  private pickVisibleFruitTree(perception: PerceptionResult, agentWorld: AgentWorldContext | null) {
    const visibleTree = perception.visibleObjects
      .filter((object) => object.type === 'tree' && object.meta?.hasFruit === true)
      .sort((a, b) => a.distance - b.distance)[0];
    if (visibleTree) return { id: visibleTree.id, x: visibleTree.x, y: visibleTree.y, worldId: visibleTree.worldId };
    const memoryTree = agentWorld?.visibleObjects
      ?.filter((object) => object.kind === 'tree' && object.meta?.hasFruit === true)
      ?.sort((a, b) => Math.hypot(a.x - perception.self.x, a.y - perception.self.y) - Math.hypot(b.x - perception.self.x, b.y - perception.self.y))[0];
    return memoryTree ? { id: memoryTree.id, x: memoryTree.x, y: memoryTree.y, worldId: memoryTree.worldId } : null;
  }

  private shouldRestInsteadOfExplore(memory: NpcMindState, absoluteGameMinutes: number, npcId: string): boolean {
    const fatigue = Math.max(0, Math.min(100, memory.body?.fatigue ?? 0));
    if (fatigue <= 55) return false;
    const desire = fatigue <= 80
      ? 0.4 + ((80 - fatigue) / 25) * 0.6
      : 0.12 + ((100 - fatigue) / 20) * 0.28;
    const windowKey = Math.floor(absoluteGameMinutes / 30);
    const roll = (stableHash(`${npcId}:${windowKey}:fatigue`) % 100) / 100;
    return roll > Math.max(0.08, Math.min(1, desire));
  }
}

function stableHash(input: string): number {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = ((value << 5) - value) + input.charCodeAt(i);
    value |= 0;
  }
  return Math.abs(value);
}
