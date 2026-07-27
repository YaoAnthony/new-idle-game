import type Phaser from 'phaser';

export interface NpcInteractionTagContext {
  npcName: string;
  scene: Phaser.Scene & Record<string, any>;
  openChat: () => void;
  openTrade: () => void;
  openGameShop: () => void;
}

export interface NpcInteractionTagHandler {
  tag: string;
  priority?: number;
  handle: (context: NpcInteractionTagContext) => boolean | void;
}

export class NpcInteractionTagRegistry {
  private readonly handlers = new Map<string, NpcInteractionTagHandler>();

  register(handler: NpcInteractionTagHandler): () => void {
    const tag = normalizeTag(handler.tag);
    if (!tag) return () => undefined;
    this.handlers.set(tag, { ...handler, tag });
    return () => {
      const current = this.handlers.get(tag);
      if (current?.handle === handler.handle) this.handlers.delete(tag);
    };
  }

  unregister(tag: string): void {
    this.handlers.delete(normalizeTag(tag));
  }

  handle(tags: string[] | undefined, context: NpcInteractionTagContext): boolean {
    const tagSet = new Set((tags ?? []).map(normalizeTag).filter(Boolean));
    const matches = [...this.handlers.values()]
      .filter((handler) => tagSet.has(handler.tag))
      .sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0));

    for (const handler of matches) {
      if (handler.handle(context) !== false) return true;
    }
    return false;
  }
}

export function createDefaultNpcInteractionTagRegistry(): NpcInteractionTagRegistry {
  const registry = new NpcInteractionTagRegistry();
  registry.register({
    tag: 'shopping',
    priority: 200,
    handle: ({ openGameShop }) => openGameShop(),
  });
  registry.register({
    tag: 'trading',
    priority: 100,
    handle: ({ openTrade }) => openTrade(),
  });
  return registry;
}

function normalizeTag(input: unknown): string {
  return String(input ?? '').trim().toLowerCase();
}
