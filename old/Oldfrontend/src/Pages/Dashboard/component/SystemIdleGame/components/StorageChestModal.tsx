import React, { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { message } from 'antd';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../../../../Redux/store';
import type { SlotItem, SlotZone } from '../../../../../Redux/Features/gameSlice';
import { setGameInventory } from '../../../../../Redux/Features/gameSlice';
import {
  useGetStorageChestsQuery,
  useTransferStorageChestItemMutation,
} from '../../../../../api/profileStateRtkApi';
import type { StorageChestSave, StorageChestSlotItem } from '../features/storage/StorageChestTypes';
import { getGameItemDefinition } from '../shared/gameItems';
import type { GameScene } from '../GameScene';

interface StorageChestModalProps {
  open: boolean;
  chestId: string | null;
  roomId?: string | null;
  sceneRef: RefObject<GameScene | null>;
  onClose: () => void;
}

type DragSource =
  | { container: 'player'; zone: SlotZone; index: number; item: SlotItem }
  | { container: 'chest'; index: number; item: StorageChestSlotItem };

function getItemLabel(itemId: string): string {
  const def = getGameItemDefinition(itemId);
  return def?.nameZh || def?.name || itemId;
}

function itemKey(item: Pick<SlotItem, 'itemId' | 'instanceData'>): string {
  const meta = item.instanceData?.customMeta || {};
  const instanceId = meta.instanceId || meta.houseId || meta.storageChestId;
  return instanceId ? `${item.itemId}:${String(instanceId)}` : item.itemId;
}

const slotStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  border: '2px solid var(--px-border)',
  borderRadius: 4,
  background: 'var(--px-surface2)',
  display: 'grid',
  placeItems: 'center',
  position: 'relative',
  color: 'var(--px-text)',
  fontSize: 10,
  overflow: 'hidden',
};

const ItemToken: React.FC<{ item: SlotItem }> = ({ item }) => (
  <div
    draggable
    style={{
      width: '100%',
      height: '100%',
      display: 'grid',
      placeItems: 'center',
      background: item.itemId === 'storage_chest_basic' ? '#5b3920' : '#1e2a22',
      color: '#fff8d0',
      textAlign: 'center',
      padding: 3,
      lineHeight: 1.05,
      cursor: 'grab',
      userSelect: 'none',
    }}
  >
    <span style={{ maxWidth: '100%', wordBreak: 'break-word' }}>{getItemLabel(item.itemId)}</span>
    {item.quantity > 1 && (
      <strong style={{
        position: 'absolute',
        right: 3,
        bottom: 1,
        color: '#ffe57a',
        textShadow: '0 1px #000',
      }}>{item.quantity}</strong>
    )}
  </div>
);

export const StorageChestModal: React.FC<StorageChestModalProps> = ({
  open,
  chestId,
  roomId,
  sceneRef,
  onClose,
}) => {
  const dispatch = useDispatch();
  const hotbarSlots = useSelector((s: RootState) => s.game.hotbarSlots);
  const backpackSlots = useSelector((s: RootState) => s.game.backpackSlots);
  const { data, isLoading, refetch } = useGetStorageChestsQuery(roomId ?? undefined, { skip: !open });
  const [transferStorageChestItem, { isLoading: transferring }] = useTransferStorageChestItemMutation();
  const dragRef = useRef<DragSource | null>(null);

  const chest: StorageChestSave | null = useMemo(() => {
    if (!chestId) return null;
    return data?.storageChests?.find((entry) => entry.id === chestId) ?? null;
  }, [chestId, data?.storageChests]);

  if (!open) return null;

  const applyResult = async (promise: ReturnType<typeof transferStorageChestItem>) => {
    try {
      const result = await promise.unwrap();
      dispatch(setGameInventory(result.gameInventory));
      sceneRef.current?.syncEventSaveData(result.gameSave);
      await refetch();
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err?.data?.message || 'Transfer failed');
    } finally {
      dragRef.current = null;
    }
  };

  const transferToChest = (targetIndex: number) => {
    const source = dragRef.current;
    if (!source || !chest || transferring) return;
    if (source.container === 'player') {
      applyResult(transferStorageChestItem({
        chestId: chest.id,
        roomId,
        from: { container: 'player', item: source.item },
        to: { container: 'chest', index: targetIndex },
        quantity: source.item.quantity,
      }));
    } else {
      applyResult(transferStorageChestItem({
        chestId: chest.id,
        roomId,
        from: { container: 'chest', index: source.index },
        to: { container: 'chest', index: targetIndex },
      }));
    }
  };

  const transferToPlayer = () => {
    const source = dragRef.current;
    if (!source || !chest || source.container !== 'chest' || transferring) return;
    applyResult(transferStorageChestItem({
      chestId: chest.id,
      roomId,
      from: { container: 'chest', index: source.index },
      to: { container: 'player' },
      quantity: source.item.quantity,
    }));
  };

  const renderPlayerSlot = (slot: SlotItem | null, zone: SlotZone, index: number) => (
    <div
      key={`${zone}-${index}`}
      style={slotStyle}
      onDragOver={(event) => event.preventDefault()}
      onDrop={transferToPlayer}
    >
      {slot && (
        <div
          draggable
          onDragStart={() => { dragRef.current = { container: 'player', zone, index, item: slot }; }}
          style={{ width: '100%', height: '100%' }}
          title={itemKey(slot)}
        >
          <ItemToken item={slot} />
        </div>
      )}
    </div>
  );

  const renderChestSlot = (slot: StorageChestSlotItem | null, index: number) => (
    <div
      key={index}
      style={slotStyle}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => transferToChest(index)}
    >
      {slot && (
        <div
          draggable
          onDragStart={() => { dragRef.current = { container: 'chest', index, item: slot }; }}
          style={{ width: '100%', height: '100%' }}
          title={itemKey(slot)}
        >
          <ItemToken item={slot} />
        </div>
      )}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Storage chest"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 450,
        background: 'rgba(7, 10, 12, 0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        fontFamily: '"Courier New", monospace',
      }}
    >
      <section style={{
        width: 'min(900px, 94vw)',
        maxHeight: '82vh',
        overflow: 'hidden',
        border: '2px solid var(--px-border-gold)',
        borderRadius: 6,
        background: 'var(--px-surface)',
        boxShadow: '0 10px 0 rgba(0,0,0,0.35), 0 18px 42px rgba(0,0,0,0.45)',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
      }}>
        <header style={{
          padding: '14px 16px',
          borderBottom: '2px solid var(--px-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}>
          <div>
            <h2 style={{ margin: 0, color: 'var(--px-gold)', fontSize: 20, letterSpacing: 0 }}>Storage Chest</h2>
            <p style={{ margin: '5px 0 0', color: 'var(--px-muted)', fontSize: 12 }}>
              Drag full stacks between backpack and chest.
            </p>
          </div>
          <button type="button" onClick={onClose} style={{
            border: '2px solid var(--px-border)',
            borderRadius: 4,
            background: 'var(--px-surface2)',
            color: 'var(--px-text)',
            minWidth: 36,
            minHeight: 34,
            cursor: 'pointer',
            fontWeight: 900,
          }}>X</button>
        </header>

        {isLoading || !chest ? (
          <div style={{ padding: 18, color: 'var(--px-muted)' }}>
            {isLoading ? 'Loading...' : 'Storage chest not found.'}
          </div>
        ) : (
          <div style={{
            overflow: 'auto',
            padding: 16,
            display: 'grid',
            gridTemplateColumns: 'minmax(260px, 1fr) minmax(260px, 1fr)',
            gap: 18,
          }}>
            <section
              onDragOver={(event) => event.preventDefault()}
              onDrop={transferToPlayer}
              style={{ display: 'grid', gap: 10, alignContent: 'start' }}
            >
              <h3 style={{ margin: 0, color: 'var(--px-text)', fontSize: 16, letterSpacing: 0 }}>Backpack</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 48px)', gap: 6 }}>
                {hotbarSlots.map((slot, index) => renderPlayerSlot(slot, 'hotbar', index))}
                {backpackSlots.map((slot, index) => renderPlayerSlot(slot, 'backpack', index))}
              </div>
            </section>

            <section style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
              <h3 style={{ margin: 0, color: 'var(--px-text)', fontSize: 16, letterSpacing: 0 }}>
                Chest {chest.slots.filter(Boolean).length}/{chest.capacity}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 48px)', gap: 6 }}>
                {chest.slots.map(renderChestSlot)}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
};
