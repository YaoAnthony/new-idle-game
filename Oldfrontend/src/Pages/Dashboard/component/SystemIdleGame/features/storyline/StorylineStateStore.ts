import type {
  StorylineDirectorState,
  StorylineHistoryEntry,
  StorylineLoreEntry,
  StorylineObjectiveState,
  StorylineQuestState,
  StorylineSaveState,
  StorylineTimeLoopState,
  StorylineWorldMemory,
} from '../../persistence/save/GameSaveTypes';
import { createDefaultStorylineState, normalizeStorylineState } from '../../persistence/save/GameSaveMapper';

export class StorylineStateStore {
  private state: StorylineSaveState = createDefaultStorylineState();

  load(input: Partial<StorylineSaveState> | null | undefined): void {
    this.state = normalizeStorylineState(input);
  }

  export(): StorylineSaveState {
    return {
      schemaVersion: 1,
      questStates: { ...this.state.questStates },
      flags: { ...this.state.flags },
      history: this.state.history.slice(-100),
      directorStates: { ...this.state.directorStates },
      pending: [...this.state.pending],
      objectives: { ...this.state.objectives },
      lore: { ...this.state.lore },
      worldMemories: this.state.worldMemories.slice(-100),
      timeLoops: { ...this.state.timeLoops },
    };
  }

  getQuestState(storylineId: string, fallbackState = 'locked'): StorylineQuestState {
    return this.state.questStates[storylineId] ?? { state: fallbackState, dueAtGameMinute: null, updatedAtGameMinute: null };
  }

  setQuestState(storylineId: string, nextState: string, absoluteGameMinutes: number, dueInGameMinutes?: number): void {
    this.state.questStates[storylineId] = {
      state: nextState,
      dueAtGameMinute: typeof dueInGameMinutes === 'number' ? absoluteGameMinutes + Math.max(0, dueInGameMinutes) : null,
      updatedAtGameMinute: absoluteGameMinutes,
    };
  }

  getFlag(key: string): unknown {
    return this.state.flags[key];
  }

  setFlag(key: string, value: unknown): void {
    this.state.flags[key] = value;
  }

  upsertDirectorState(key: string, state: StorylineDirectorState): void {
    this.state.directorStates[key] = state;
  }

  getDirectorState(key: string): StorylineDirectorState | null {
    return this.state.directorStates[key] ?? null;
  }

  completeDirectorState(key: string, absoluteGameMinutes: number): void {
    const existing = this.state.directorStates[key];
    if (!existing) return;
    this.state.directorStates[key] = {
      ...existing,
      status: 'completed',
      updatedAtGameMinute: absoluteGameMinutes,
    };
  }

  record(entry: StorylineHistoryEntry): void {
    this.state.history.push(entry);
    if (this.state.history.length > 100) {
      this.state.history.splice(0, this.state.history.length - 100);
    }
  }

  getObjective(objectiveId: string): StorylineObjectiveState | null {
    return this.state.objectives[objectiveId] ?? null;
  }

  startObjective(input: {
    objectiveId: string;
    title?: string;
    storylineId?: string;
    eventId?: string;
    startedAtGameMinute: number;
    dueAtGameMinute: number;
  }): StorylineObjectiveState {
    const objective: StorylineObjectiveState = {
      id: input.objectiveId,
      status: 'running',
      title: input.title,
      storylineId: input.storylineId,
      eventId: input.eventId,
      startedAtGameMinute: input.startedAtGameMinute,
      dueAtGameMinute: input.dueAtGameMinute,
      completedAtGameMinute: null,
      failedAtGameMinute: null,
    };
    this.state.objectives[input.objectiveId] = objective;
    return objective;
  }

  completeObjective(objectiveId: string, absoluteGameMinutes: number, reason?: string): StorylineObjectiveState | null {
    const existing = this.state.objectives[objectiveId];
    if (!existing) return null;
    const objective: StorylineObjectiveState = {
      ...existing,
      status: 'completed',
      completedAtGameMinute: absoluteGameMinutes,
      failedAtGameMinute: null,
      resultReason: reason || existing.resultReason,
    };
    this.state.objectives[objectiveId] = objective;
    return objective;
  }

  failObjective(objectiveId: string, absoluteGameMinutes: number, reason?: string): StorylineObjectiveState | null {
    const existing = this.state.objectives[objectiveId];
    if (!existing) return null;
    const objective: StorylineObjectiveState = {
      ...existing,
      status: 'failed',
      failedAtGameMinute: absoluteGameMinutes,
      completedAtGameMinute: null,
      resultReason: reason || existing.resultReason,
    };
    this.state.objectives[objectiveId] = objective;
    return objective;
  }

  isTimerExpired(objectiveId: string, absoluteGameMinutes: number): boolean {
    const objective = this.state.objectives[objectiveId];
    return Boolean(objective && objective.status === 'running' && absoluteGameMinutes >= objective.dueAtGameMinute);
  }

  unlockLore(entry: StorylineLoreEntry): StorylineLoreEntry {
    const existing = this.state.lore[entry.id];
    const next: StorylineLoreEntry = {
      ...(existing ?? {}),
      ...entry,
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      discoveredAtGameMinute: existing?.discoveredAtGameMinute ?? entry.discoveredAtGameMinute,
    };
    this.state.lore[entry.id] = next;
    return next;
  }

  hasLore(loreId: string): boolean {
    return Boolean(this.state.lore[loreId]);
  }

  addWorldMemory(memory: StorylineWorldMemory): StorylineWorldMemory {
    this.state.worldMemories.push({
      ...memory,
      tags: Array.isArray(memory.tags) ? memory.tags : [],
      importance: Math.max(0, Math.min(10, Number(memory.importance) || 0)),
    });
    if (this.state.worldMemories.length > 100) {
      this.state.worldMemories.splice(0, this.state.worldMemories.length - 100);
    }
    return this.state.worldMemories[this.state.worldMemories.length - 1];
  }

  getTimeLoop(loopId: string): StorylineTimeLoopState | null {
    return this.state.timeLoops[loopId] ?? null;
  }

  getActiveTimeLoops(): StorylineTimeLoopState[] {
    return Object.values(this.state.timeLoops).filter((loop) => loop.status === 'active');
  }

  upsertTimeLoop(loop: StorylineTimeLoopState): StorylineTimeLoopState {
    this.state.timeLoops[loop.id] = loop;
    return loop;
  }

  setTimeLoopStatus(
    loopId: string,
    status: StorylineTimeLoopState['status'],
    absoluteGameMinutes: number,
    reason?: string,
  ): StorylineTimeLoopState | null {
    const existing = this.state.timeLoops[loopId];
    if (!existing) return null;
    const next: StorylineTimeLoopState = {
      ...existing,
      status,
      brokenAtGameMinute: status === 'broken' ? absoluteGameMinutes : existing.brokenAtGameMinute,
      reason: reason || existing.reason,
    };
    this.state.timeLoops[loopId] = next;
    return next;
  }
}
