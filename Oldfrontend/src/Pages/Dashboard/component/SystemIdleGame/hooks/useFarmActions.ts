/**
 * useFarmActions — 农田操作、物品拾取、消耗等 gameBus 事件订阅。
 *
 * 无状态 hook（只副作用），包含：
 *   farm:action           → 调用 till / water / plant / harvest 后端 API
 *   player:item_pickup    → Redux 更新 + 后端持久化
 *   player:consume_item   → Redux 扣减
 *   npc:pickup_world_item → NPC 背包 Redux 更新
 *   npc:drop_item         → NPC 背包扣减 + 生成掉落物
 *   ui:show_message       → antd 全局提示
 */

import { useEffect }           from 'react';
import { useDispatch }         from 'react-redux';
import type { RefObject }      from 'react';
import {
  useTillFarmTileMutation,
  useWaterFarmTileMutation,
  usePlantCropMutation,
  useHarvestCropMutation,
  usePickupGameItemMutation,
  useConsumeGameItemMutation,
} from '../../../../../api/profileStateRtkApi';
import {
  addItemToBackpack,
  addItemToNpcInventory,
  removeItemFromNpcInventory,
} from '../../../../../Redux/Features/gameSlice';
import type { FarmTile } from '../../../../../Redux/Features/gameSlice';
import { gameBus }             from '../shared/EventBus';
import type { GameScene }      from '../GameScene';
import { applyServerFarmTileUpdate } from './useIdleGameSyncBoundary';

const ITEM_NAME_MAP: Record<string, string> = {
  wheat_seed: '小麦种子', tomato_seed: '番茄种子',
  wheat:      '小麦',     tomato:      '番茄',
  fruit:      '果子',     egg:         '鸡蛋',
  log:        '木头',     stone:       '石头',
};

function npcFarmResultLine(action: 'till' | 'water' | 'plant' | 'harvest', tx: number, ty: number, itemId?: string): string {
  switch (action) {
    case 'till':
      return `翻好了 (${tx}, ${ty}) 这块地。`;
    case 'water':
      return `给 (${tx}, ${ty}) 这块地浇过水了。`;
    case 'plant':
      return `把 ${ITEM_NAME_MAP[itemId ?? ''] ?? itemId ?? '种子'} 种在 (${tx}, ${ty}) 了。`;
    case 'harvest':
      return `收了 (${tx}, ${ty}) 这块地的作物。`;
    default:
      return '农活做完了。';
  }
}

function announceNpcFarmResult(
  scene: GameScene | null,
  actorId: string | undefined,
  action: 'till' | 'water' | 'plant' | 'harvest',
  tx: number,
  ty: number,
  itemId?: string,
): void {
  if (!actorId || actorId === 'player') return;
  scene?.npcSystem?.makeSay?.(actorId, npcFarmResultLine(action, tx, ty, itemId));
}

export function useFarmActions(
  sceneRef:          RefObject<GameScene | null>,
  multiplayRoomIdRef: RefObject<string | null>,
) {
  const dispatch = useDispatch();
  const [tillFarmTile]   = useTillFarmTileMutation();
  const [waterFarmTile]  = useWaterFarmTileMutation();
  const [plantCrop]      = usePlantCropMutation();
  const [harvestCrop]    = useHarvestCropMutation();
  const [pickupGameItem] = usePickupGameItemMutation();
  const [consumeGameItem] = useConsumeGameItemMutation();

  useEffect(() => {
    const unsubs = [

      // ── 农田操作 ────────────────────────────────────────────────────────
      gameBus.on('farm:action', async ({ action, worldId, tx, ty, itemId, actorId }) => {
        const isPlayerActor = !actorId || actorId === 'player';
        const absoluteGameMinutes = sceneRef.current?.getDayCycleAbsoluteGameMinutes?.() ?? 0;
        const roomId   = multiplayRoomIdRef.current ?? undefined;
        try {
          switch (action) {
            case 'till': {
              const res = await tillFarmTile({ worldId, tx, ty, roomId }).unwrap();
              if (res.farmTile) {
                applyServerFarmTileUpdate(sceneRef.current, dispatch, res.farmTile as FarmTile & { tx: number; ty: number; state: string });
              }
              if (res.droppedSeed) {
                const offsetX = (Math.random() - 0.5) * 30;
                const offsetY = (Math.random() - 0.5) * 20 + 20;
                sceneRef.current?.spawnWorldItem(
                  tx * 32 + 16 + offsetX,
                  ty * 32 + 16 + offsetY,
                  res.droppedSeed.itemId,
                  'server',
                  worldId,
                );
              }
              announceNpcFarmResult(sceneRef.current, actorId, action, tx, ty, itemId);
              break;
            }
            case 'water':
              {
                const res = await waterFarmTile({ worldId, tx, ty, absoluteGameMinutes, roomId }).unwrap();
                if (res.farmTile) {
                  applyServerFarmTileUpdate(sceneRef.current, dispatch, res.farmTile as FarmTile & { tx: number; ty: number; state: string });
                }
                announceNpcFarmResult(sceneRef.current, actorId, action, tx, ty, itemId);
              }
              break;

            case 'plant':
              if (itemId) {
                if (isPlayerActor) {
                  dispatch(addItemToBackpack({ itemId, quantity: -1 }));
                } else if (actorId) {
                  dispatch(removeItemFromNpcInventory({ npcName: actorId, itemId, qty: 1 }));
                }
                const plantRes = await plantCrop({ worldId, tx, ty, itemId, absoluteGameMinutes, roomId }).unwrap();
                if (plantRes.farmTiles) {
                  const tile = (plantRes.farmTiles as any[]).find((t: any) => (t.worldId ?? worldId ?? 'world:main') === (worldId ?? 'world:main') && t.tx === tx && t.ty === ty);
                  if (tile) {
                    applyServerFarmTileUpdate(sceneRef.current, dispatch, tile as FarmTile & { tx: number; ty: number; state: string });
                  }
                }
                announceNpcFarmResult(sceneRef.current, actorId, action, tx, ty, itemId);
              }
              break;

            case 'harvest': {
              const absoluteGameMinutes = sceneRef.current?.getAbsoluteGameMinutes?.() ?? 0;
              const harvestRes = await harvestCrop({ worldId, tx, ty, absoluteGameMinutes, roomId }).unwrap();
              const updatedTile = (harvestRes.farmTiles as any[] | undefined)?.find((tile: any) => (tile.worldId ?? worldId ?? 'world:main') === (worldId ?? 'world:main') && tile.tx === tx && tile.ty === ty);
              if (updatedTile) {
                applyServerFarmTileUpdate(sceneRef.current, dispatch, updatedTile as FarmTile & { tx: number; ty: number; state: string });
              }
              if (harvestRes.dropItems?.length) {
                const T = 32;
                const wx = tx * T + T / 2, wy = ty * T + T / 2;
                harvestRes.dropItems.forEach((drop: any, i: number) => {
                  const angle = (i / harvestRes.dropItems.length) * Math.PI * 2;
                  sceneRef.current?.spawnWorldItem(
                    wx + Math.cos(angle) * (20 + i * 10),
                    wy + Math.sin(angle) * (20 + i * 10),
                    drop.itemId,
                    'server',
                    worldId,
                  );
                });
              }
              announceNpcFarmResult(sceneRef.current, actorId, action, tx, ty, itemId);
              break;
            }
          }
        } catch (err) {
          console.error('[Farm] action error:', err);
          if (action === 'plant' && itemId) {
            if (isPlayerActor) {
              dispatch(addItemToBackpack({ itemId, quantity: 1 }));
            } else if (actorId) {
              dispatch(addItemToNpcInventory({ npcName: actorId, itemId, qty: 1 }));
            }
          }
        }
      }),

      // ── 玩家拾取物品 → Redux + 后端持久化 ────────────────────────────────
      gameBus.on('player:item_pickup', async ({ itemKey, quantity }) => {
        dispatch(addItemToBackpack({ itemId: itemKey, quantity }));
        import('antd').then(({ message: msg }) =>
          msg.success(`获得 ${ITEM_NAME_MAP[itemKey] ?? itemKey} ×${quantity}`, 1.5),
        );
        try {
          await pickupGameItem({ itemId: itemKey, quantity }).unwrap();
        } catch {
          dispatch(addItemToBackpack({ itemId: itemKey, quantity: -quantity }));
        }
      }),

      // ── 玩家消耗物品（放置 / Q 扔）→ Redux 扣减 ──────────────────────────
      gameBus.on('player:consume_item', async ({ itemId, qty, action, previousHunger }) => {
        dispatch(addItemToBackpack({ itemId, quantity: -qty }));
        try {
          const result = await consumeGameItem({
            itemId,
            quantity: qty,
            action,
            roomId: multiplayRoomIdRef.current ?? undefined,
          }).unwrap();
          if (typeof result.hunger === 'number') {
            sceneRef.current?.playerSystem?.setHunger?.(result.hunger);
          }
        } catch (err) {
          console.error('[Inventory] consume error:', err);
          dispatch(addItemToBackpack({ itemId, quantity: qty }));
          if (action === 'eat' && typeof previousHunger === 'number') {
            sceneRef.current?.playerSystem?.setHunger?.(previousHunger);
          }
        }
      }),

      // ── NPC 拾取物品 → NPC 背包 Redux 更新 ──────────────────────────────
      gameBus.on('npc:pickup_world_item', ({ npcName, itemId, qty }) => {
        dispatch(addItemToNpcInventory({ npcName, itemId, qty }));
      }),

      // ── NPC 丢弃物品 → 扣背包 + 生成掉落物 ─────────────────────────────
      gameBus.on('npc:consume_item', ({ npcName, itemId, qty }) => {
        dispatch(removeItemFromNpcInventory({ npcName, itemId, qty }));
      }),

      gameBus.on('npc:drop_item', ({ npcName, itemId, qty, x, y, worldId }) => {
        dispatch(removeItemFromNpcInventory({ npcName, itemId, qty }));
        if (x != null && y != null) {
          sceneRef.current?.spawnWorldItem(x, y, itemId, 'server', worldId);
        }
      }),

      // ── UI 全局提示 ───────────────────────────────────────────────────────
      gameBus.on('ui:show_message', ({ text }) => {
        import('antd').then(({ message: msg }) => msg.info(text, 2));
      }),
    ];
    return () => unsubs.forEach(u => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
