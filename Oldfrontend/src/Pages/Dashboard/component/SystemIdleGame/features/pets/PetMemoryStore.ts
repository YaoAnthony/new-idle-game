import type { PetMemorySeed } from './PetTypes';

export class PetMemoryStore {
  private readonly memories = new Map<string, PetMemorySeed>();

  constructor(initial: PetMemorySeed[] = []) {
    initial.forEach((memory) => this.remember(memory));
  }

  remember(memory: PetMemorySeed): void {
    const existing = this.memories.get(memory.id);
    this.memories.set(memory.id, {
      ...existing,
      ...memory,
      importance: Math.max(existing?.importance ?? 0, memory.importance),
      createdAtGameMinute: existing?.createdAtGameMinute ?? memory.createdAtGameMinute,
      lastSeenGameMinute: memory.lastSeenGameMinute ?? existing?.lastSeenGameMinute,
    });
  }

  replace(memories: PetMemorySeed[]): void {
    this.memories.clear();
    memories.forEach((memory) => this.remember(memory));
  }

  list(): PetMemorySeed[] {
    return [...this.memories.values()]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 24);
  }
}
