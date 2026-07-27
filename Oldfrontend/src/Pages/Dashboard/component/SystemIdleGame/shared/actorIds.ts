const RESERVED_GAME_ACTOR_IDS = new Set([
  'player',
  'remote-player',
  'remote_player',
]);

const RESERVED_GAME_ACTOR_NAMES = new Set([
  'player',
  '玩家',
  '主角',
]);

export function normalizeGameActorId(input: unknown): string {
  return String(input ?? '').trim();
}

export function isReservedGameActorId(input: unknown): boolean {
  const raw = normalizeGameActorId(input);
  if (!raw) return false;
  return RESERVED_GAME_ACTOR_IDS.has(raw.toLowerCase()) || RESERVED_GAME_ACTOR_NAMES.has(raw);
}
