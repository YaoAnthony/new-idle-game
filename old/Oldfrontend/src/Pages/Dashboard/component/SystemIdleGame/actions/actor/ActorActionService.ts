import type { ToolType } from '../../types';
import {
  findNpcKnowledgeSkill,
  resolveKnowledgeMoveTarget,
} from '../../shared/NpcDefaultSkillCatalog';
import type {
  FarmActionKind,
  FarmActionTarget,
  FarmSystem,
} from '../../features/farming/FarmSystem';
import type { WorldActionDispatcher, WorldActionResult } from '../../systems/WorldActionSystem';
import { defaultActionCatalog, type ActionCatalog } from '../catalog/ActionCatalog';

export type ActorNavigator = (x: number, y: number, worldId?: string, onArrive?: () => void) => void;

export interface ExecuteKnowledgeSkillInput {
  actorId: string;
  skillId: string;
  originX: number;
  originY: number;
  originWorldId?: string;
  absoluteGameMinutes: number;
  navigate: ActorNavigator;
}

/**
 * Shared actor action surface.
 *
 * Player input and NPC skills should call this layer instead of duplicating
 * player-only logic. WASD movement remains player-specific; world mutations do
 * not.
 */
export class ActorActionService {
  private readonly farmReservations = new Map<string, { actorId: string; expiresAt: number }>();

  constructor(
    private readonly farmSystem: FarmSystem,
    private readonly dispatcher: WorldActionDispatcher,
    private readonly actionCatalog: ActionCatalog = defaultActionCatalog,
  ) {}

  useToolAt(
    actorId: string,
    x: number,
    y: number,
    tool: ToolType | string,
    heldItemId?: string,
    options?: { strictTargetCell?: boolean; worldId?: string },
  ): boolean {
    return this.farmSystem.handleToolUseAt(actorId, x, y, tool, heldItemId, options);
  }

  findFarmTarget(
    action: FarmActionKind,
    x: number,
    y: number,
    maxRadiusCells = 10,
    actorId?: string,
    worldId?: string,
  ): FarmActionTarget | null {
    const ignored = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      const target = this.farmSystem.findNearestFarmTarget(action, x, y, maxRadiusCells, ignored, worldId);
      if (!target) return null;
      const key = this.tileKey(target);
      if (!actorId || !this.isReservedByOther(key, actorId)) {
        if (actorId) this.reserveFarmTarget(actorId, target);
        return target;
      }
      ignored.add(key);
    }
    return null;
  }

  performFarmAction(
    actorId: string,
    action: FarmActionKind,
    target: Pick<FarmActionTarget, 'tx' | 'ty' | 'cropId' | 'worldId'>,
    itemId?: string,
  ): WorldActionResult {
    const worldAction = this.actionCatalog.toFarmWorldAction(actorId, action, target, itemId);
    const result = this.dispatcher.dispatchAction(worldAction);
    this.releaseFarmTarget(actorId, target);
    return result;
  }

  executeKnowledgeSkill(input: ExecuteKnowledgeSkillInput): boolean {
    void input.absoluteGameMinutes;
    const skill = findNpcKnowledgeSkill(input.skillId);
    if (!skill) return false;

    const firstMove = skill.steps.find((step) => step.kind === 'move_to');
    const farmStep = skill.steps.find((step) => step.kind === 'farm_action');

    if (!farmStep) {
      const target = firstMove ? resolveKnowledgeMoveTarget(firstMove, input.actorId) : null;
      if (!target) return false;
      input.navigate(target.x, target.y, target.worldId);
      return true;
    }

    const anchorX = input.originX;
    const anchorY = input.originY;
    const farmAction = farmStep.action;

    let target = this.findFarmTarget(farmAction, anchorX, anchorY, 12, input.actorId, input.originWorldId);
    let actionToRun = farmAction;
    let itemId = farmStep.itemId;
    let plantAfterTill = false;

    if (!target && farmAction === 'plant') {
      target = this.findFarmTarget('till', anchorX, anchorY, 12, input.actorId, input.originWorldId);
      actionToRun = 'till';
      itemId = 'scythe';
      plantAfterTill = true;
    }

    if (!target) {
      target = this.findFarmTarget(farmAction, input.originX, input.originY, 12, input.actorId, input.originWorldId);
    }
    if (!target) return false;

    const selectedTarget = target;
    input.navigate(selectedTarget.x, selectedTarget.y, selectedTarget.worldId, () => {
      const result = this.performFarmAction(input.actorId, actionToRun, selectedTarget, itemId);
      if (plantAfterTill && result.ok) {
        this.performFarmAction(input.actorId, 'plant', selectedTarget, farmStep.itemId ?? 'wheat_seed');
      }
    });
    return true;
  }

  private tileKey(target: Pick<FarmActionTarget, 'worldId' | 'tx' | 'ty'>): string {
    return `${target.worldId ?? 'world:main'}:${target.tx},${target.ty}`;
  }

  private reserveFarmTarget(actorId: string, target: Pick<FarmActionTarget, 'worldId' | 'tx' | 'ty'>): void {
    this.farmReservations.set(this.tileKey(target), {
      actorId,
      expiresAt: Date.now() + 12_000,
    });
  }

  private releaseFarmTarget(actorId: string, target: Pick<FarmActionTarget, 'worldId' | 'tx' | 'ty'>): void {
    const key = this.tileKey(target);
    const reservation = this.farmReservations.get(key);
    if (reservation?.actorId === actorId) {
      this.farmReservations.delete(key);
    }
  }

  private isReservedByOther(key: string, actorId: string): boolean {
    const reservation = this.farmReservations.get(key);
    if (!reservation) return false;
    if (reservation.expiresAt <= Date.now()) {
      this.farmReservations.delete(key);
      return false;
    }
    return reservation.actorId !== actorId;
  }
}
