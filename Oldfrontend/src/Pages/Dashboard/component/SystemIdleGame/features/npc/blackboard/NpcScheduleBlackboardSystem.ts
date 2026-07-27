import type { Npc } from '../../../entities/Npc';
import type { DayCycle } from '../../../systems/DayCycle';
import type { WorldStateManager } from '../../../shared/WorldStateManager';
import type { NpcAutonomyMode, NpcDailyActivity } from '../../../shared/worldStateTypes';
import { toMinuteOfDay } from '../../../time/GameTime';

export interface ScheduleSlot {
  startMin: number;
  endMin: number;
  activity: NpcDailyActivity;
  locationId?: string;
  line?: string;
}

interface NpcRegistration {
  id: string;
  npc: Npc;
}

export const DEFAULT_NPC_SCHEDULES: Record<string, ScheduleSlot[]> = {};

export function getDefaultNpcSchedule(npcId: string): ScheduleSlot[] {
  return DEFAULT_NPC_SCHEDULES[npcId] ?? [];
}

export function autonomyModeForActivity(activity: NpcDailyActivity | null | undefined): NpcAutonomyMode {
  switch (activity) {
    case 'sleep':
      return 'sleeping';
    case 'breakfast':
    case 'lunch':
    case 'dinner':
      return 'eating';
    case 'work_farm':
    case 'work_forest':
      return 'working';
    case 'relax':
      return 'social';
    default:
      return 'free';
  }
}

export function canRunFreeThink(activity: NpcDailyActivity | null | undefined): boolean {
  return activity == null || activity === 'relax';
}

export function canRunScheduleDrivenThink(activity: NpcDailyActivity | null | undefined): boolean {
  return activity === 'work_farm';
}

export class NpcScheduleBlackboardSystem {
  private lastSlotKeyByNpc = new Map<string, string>();

  constructor(
    private readonly worldStateManager: WorldStateManager,
    private readonly dayCycle: DayCycle,
    private readonly getNpcRegistrations: () => NpcRegistration[],
    private readonly isNpcLocked: (npcId: string) => boolean = () => false,
    private readonly schedules: Record<string, ScheduleSlot[]> = DEFAULT_NPC_SCHEDULES,
  ) {}

  update(_dtSeconds: number, absoluteGameMinutes: number): void {
    const minute = this.dayCycle.getCurrentMinute?.() ?? toMinuteOfDay(absoluteGameMinutes);
    for (const { id, npc } of this.getNpcRegistrations()) {
      if (this.isNpcLocked(id)) continue;
      if (npc.isOnDispatch() || npc.isAwaitingConfirm()) continue;
      if (npc.hasPlannedActions() || npc.isNavigating()) continue;
      const mind = this.worldStateManager.getNpcMindState(id);
      if (!mind) continue;
      const slot = findSlot(mind.dayPlan?.status === 'ready' ? mind.dayPlan.slots : this.schedules[id] ?? [], minute);
      if (!slot) continue;
      const slotKey = `${slot.startMin}:${slot.endMin}:${slot.activity}`;
      if (this.lastSlotKeyByNpc.get(id) === slotKey) continue;
      this.lastSlotKeyByNpc.set(id, slotKey);
      const autonomyMode = autonomyModeForActivity(slot.activity);
      npc.setAutonomyMode(autonomyMode);
      this.worldStateManager.patchNpcMindState(id, {
        schedule: {
          currentActivity: slot.activity,
          startedAtMinuteOfDay: minute,
          startedAtGameMinute: absoluteGameMinutes,
        },
        meta: {
          ...(mind.meta ?? {}),
          autonomyMode,
        },
      });
      if (slot.line && slot.activity !== 'work_farm') npc.queueActions([{ type: 'say', text: slot.line, duration: 3.5 }], absoluteGameMinutes);
    }
  }
}

function findSlot(slots: ScheduleSlot[], minute: number): ScheduleSlot | null {
  return slots.find((slot) => minute >= slot.startMin && minute < slot.endMin) ?? null;
}
