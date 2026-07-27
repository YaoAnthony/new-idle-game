import type {
  PerceivedEntity,
  PerceivedLandmark,
  PerceivedObject,
  PerceivedDrop,
  PerceptionResult,
} from './WorldPerceptionSystem';

const ITEM_LABELS: Record<string, string> = {
  watering_can: '水壶',
  axe: '斧头',
  scythe: '锄头',
  wheat_seed: '小麦种子',
  tomato_seed: '番茄种子',
  wheat: '小麦',
  tomato: '番茄',
  fruit: '苹果',
  raspberry: '树莓',
  log: '木头',
  stone: '石头',
  berry: '浆果',
  apple: '苹果',
  egg: '鸡蛋',
  fence: '木栅栏',
  house_blueprint_greenhouse: '温室蓝图',
  storage_chest_basic: '储物箱',
};

const OBJECT_LABELS: Record<string, string> = {
  bed: '床',
  chest: '宝箱',
  storage_chest: '储物箱',
  nest: '鸡窝',
  berry_bush: '树莓灌木',
  bush: '灌木',
  rock: '石头',
  farm_tile: '农田',
  house: '房子',
  room: '房间',
  room_exit: '门口',
  furniture: '家具',
  fence: '木栅栏',
  decoration: '装饰物',
};

const LANDMARK_LABELS: Record<string, string> = {
  room: '玩家屋内',
  door: '玩家房门',
  pond: '池塘',
  farm: '农田',
  'player-house': '玩家房子',
  'npc-house': '村长房子',
};

function formatEntity(entity: PerceivedEntity): string {
  const label = entity.displayName || entity.id;
  return `${label}(${Math.round(entity.x)},${Math.round(entity.y)})`;
}

function objectLabel(objectItem: PerceivedObject): string {
  const base = OBJECT_LABELS[objectItem.type] ?? objectItem.type;
  if (typeof objectItem.meta?.summary === 'string') return objectItem.meta.summary;
  if (typeof objectItem.meta?.label === 'string') return objectItem.meta.label;
  if (objectItem.type === 'bed' && objectItem.state) return `${objectItem.state}${base}`;
  if (objectItem.type === 'tree' && objectItem.meta?.hasFruit) return '结果的树';
  return base;
}

function landmarkLabel(landmark: PerceivedLandmark): string {
  return LANDMARK_LABELS[landmark.id ?? ''] ?? landmark.label;
}

function formatAt(x: number, y: number): string {
  return `(${Math.round(x)},${Math.round(y)})`;
}

function formatDrop(drop: PerceivedDrop): string {
  const quantity = Math.max(1, Math.floor(drop.quantity ?? drop.stack?.quantity ?? 1));
  const quantityText = quantity > 1 ? `×${quantity}` : '';
  return `${ITEM_LABELS[drop.itemId] ?? drop.itemId}/${drop.itemId}${quantityText}${formatAt(drop.x, drop.y)}`;
}

/**
 * Convert structured perception into compact Chinese text for the NPC chat prompt.
 * The structured JSON is still sent separately; this text is the high-signal
 * summary the LLM usually follows when the player asks "what do you see?".
 */
export function formatPerceptionForNpcPrompt(result: PerceptionResult): string {
  const parts: string[] = [];

  const nearestLandmark = result.landmarks[0];
  if (nearestLandmark && nearestLandmark.distance <= 120) {
    parts.push(`你现在大概在${landmarkLabel(nearestLandmark)}附近。`);
  }

  const currentRoom = result.visibleObjects.find((objectItem) => (
    objectItem.type === 'room'
    && objectItem.distance <= 280
    && objectItem.meta?.isInterior === true
  ));
  if (currentRoom) {
    const roomLabel = typeof currentRoom.meta?.label === 'string' ? currentRoom.meta.label : '房间';
    const roomSummary = typeof currentRoom.meta?.summary === 'string' ? currentRoom.meta.summary : '';
    parts.push(`你现在在${roomLabel}里面。${roomSummary}`);
  }

  const liveTrees = result.visibleObjects.filter((objectItem) => (
    objectItem.type === 'tree' && objectItem.state !== 'chopped'
  ));
  if (liveTrees.length > 0) {
    const closest = liveTrees[0];
    parts.push(
      `视野内有 ${liveTrees.length} 棵树，最近的是 ${closest.id}，位置约 ${formatAt(closest.x, closest.y)}。`,
    );
  }

  const visibleObjects = result.visibleObjects.filter((objectItem) => (
    objectItem.type !== 'tree' && objectItem.type !== 'room'
  ));
  if (visibleObjects.length > 0) {
    parts.push(
      `能看到的物件有：${visibleObjects
        .slice(0, 10)
        .map((objectItem) => `${objectLabel(objectItem)}${formatAt(objectItem.x, objectItem.y)}`)
        .join('、')}。`,
    );
  }

  if (result.visibleDrops.length > 0) {
    parts.push(
      `地上有物品：${result.visibleDrops
        .slice(0, 10)
        .map(formatDrop)
        .join('、')}。`,
    );
  }

  const readyCrops = result.visibleCrops.filter((crop) => crop.state === 'ready');
  if (readyCrops.length > 0) {
    parts.push(
      `附近有 ${readyCrops.length} 个成熟作物地块，例如 ${readyCrops
        .slice(0, 3)
        .map((crop) => `${crop.cropId}(${crop.tx},${crop.ty})`)
        .join('、')}。`,
    );
  }

  const nearbyEntities = result.visibleEntities.filter((entity) => entity.type !== 'player');
  if (nearbyEntities.length > 0) {
    parts.push(
      `附近还能看到：${nearbyEntities
        .slice(0, 5)
        .map(formatEntity)
        .join('、')}。`,
    );
  }

  if (result.landmarks.length > 0 && !currentRoom) {
    parts.push(
      `附近地标有：${result.landmarks
        .slice(0, 6)
        .map((landmark) => `${landmarkLabel(landmark)}${formatAt(landmark.x, landmark.y)}`)
        .join('、')}。`,
    );
  }

  if (result.nearest.water && !currentRoom) {
    parts.push(`最近的水源大约在 ${formatAt(result.nearest.water.x, result.nearest.water.y)}。`);
  }

  return parts.join(' ') || '附近没有明显可观察目标。';
}
