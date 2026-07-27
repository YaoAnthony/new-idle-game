import React, { useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { message } from 'antd';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../../../Redux/store';
import type { GameInventoryItem } from '../../../../../Redux/Features/gameSlice';
import { useExecuteNpcTradeMutation } from '../../../../../api/profileStateRtkApi';
import type { NpcTradeStack } from '../features/npc/trade/NpcTradeTypes';
import { getGameItemDefinition } from '../shared/gameItems';
import { ItemIcon } from '../visuals';
import { gameBus } from '../shared/EventBus';
import type { GameScene } from '../GameScene';
import './NpcTradeModal.css';

interface NpcTradeModalProps {
  open: boolean;
  npcName: string | null;
  roomId?: string | null;
  sceneRef: RefObject<GameScene | null>;
  onClose: () => void;
}

interface DisplayStack {
  itemId: string;
  quantity: number;
  tradableQuantity: number;
  disabled?: boolean;
}

const INSTANCE_META_KEYS = new Set([
  'instanceId',
  'houseId',
  'storageChestId',
  'petId',
  'petDefinitionId',
  'entityId',
]);

function getItemLabel(itemId: string): string {
  const def = getGameItemDefinition(itemId);
  return def?.nameZh || def?.name || itemId;
}

function isInstanceBound(item: Pick<GameInventoryItem, 'instanceData'>): boolean {
  const meta = item.instanceData?.customMeta;
  if (!meta || typeof meta !== 'object') return false;
  return Object.keys(meta).some((key) => INSTANCE_META_KEYS.has(key) || meta[key] != null);
}

function stackPlayerInventory(items: GameInventoryItem[]): DisplayStack[] {
  const map = new Map<string, DisplayStack>();
  for (const item of items) {
    const quantity = Math.max(0, Math.floor(Number(item.quantity || 0)));
    if (!item.itemId || quantity <= 0) continue;
    const stack = map.get(item.itemId) ?? {
      itemId: item.itemId,
      quantity: 0,
      tradableQuantity: 0,
    };
    stack.quantity += quantity;
    if (!isInstanceBound(item)) stack.tradableQuantity += quantity;
    map.set(item.itemId, stack);
  }
  return Array.from(map.values())
    .map((stack) => ({ ...stack, disabled: stack.tradableQuantity <= 0 }))
    .sort((a, b) => getItemLabel(a.itemId).localeCompare(getItemLabel(b.itemId), 'zh-Hans-CN'));
}

function stackNpcInventory(inventory: Record<string, number>): DisplayStack[] {
  return Object.entries(inventory || {})
    .map(([itemId, quantity]) => ({
      itemId,
      quantity: Math.max(0, Math.floor(Number(quantity || 0))),
      tradableQuantity: Math.max(0, Math.floor(Number(quantity || 0))),
    }))
    .filter((stack) => stack.quantity > 0)
    .sort((a, b) => getItemLabel(a.itemId).localeCompare(getItemLabel(b.itemId), 'zh-Hans-CN'));
}

function selectionList(selection: Record<string, number>): NpcTradeStack[] {
  return Object.entries(selection)
    .map(([itemId, quantity]) => ({ itemId, quantity: Math.max(0, Math.floor(Number(quantity || 0))) }))
    .filter((item) => item.quantity > 0);
}

function selectionCount(selection: Record<string, number>): number {
  return selectionList(selection).reduce((sum, item) => sum + item.quantity, 0);
}

const StackButton: React.FC<{
  stack: DisplayStack;
  selectedQuantity: number;
  side: 'player' | 'npc';
  onToggle: (stack: DisplayStack) => void;
}> = ({ stack, selectedQuantity, side, onToggle }) => {
  const disabled = Boolean(stack.disabled);
  return (
    <button
      type="button"
      className={[
        'npc-trade-slot',
        selectedQuantity > 0 ? 'npc-trade-slot--selected' : '',
        disabled ? 'npc-trade-slot--disabled' : '',
      ].filter(Boolean).join(' ')}
      disabled={disabled}
      onClick={() => onToggle(stack)}
      title={`${getItemLabel(stack.itemId)} x${stack.tradableQuantity}`}
    >
      <ItemIcon itemId={stack.itemId} size={34} alt={getItemLabel(stack.itemId)} />
      <strong className="npc-trade-slot__qty">x{stack.quantity}</strong>
      {selectedQuantity > 0 && <span className="npc-trade-slot__pick">{selectedQuantity}</span>}
      {side === 'player' && disabled && <span className="npc-trade-slot__lock">LOCK</span>}
    </button>
  );
};

export const NpcTradeModal: React.FC<NpcTradeModalProps> = ({
  open,
  npcName,
  roomId,
  sceneRef,
  onClose,
}) => {
  const gameInventory = useSelector((s: RootState) => s.game.gameInventory);
  const npcInventories = useSelector((s: RootState) => s.game.npcInventories);
  const walletCoins = useSelector((s: RootState) => s.profileState.wallet.coins);
  const [executeNpcTrade, { isLoading }] = useExecuteNpcTradeMutation();

  const [playerSelection, setPlayerSelection] = useState<Record<string, number>>({});
  const [npcSelection, setNpcSelection] = useState<Record<string, number>>({});
  const [playerCoins, setPlayerCoins] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const activeNpcName = npcName || '';
  const playerStacks = useMemo(() => stackPlayerInventory(gameInventory), [gameInventory]);
  const npcStacks = useMemo(() => stackNpcInventory(npcInventories[activeNpcName] ?? {}), [activeNpcName, npcInventories]);
  const playerMaxByItem = useMemo(() => Object.fromEntries(playerStacks.map((stack) => [stack.itemId, stack.tradableQuantity])), [playerStacks]);
  const npcMaxByItem = useMemo(() => Object.fromEntries(npcStacks.map((stack) => [stack.itemId, stack.tradableQuantity])), [npcStacks]);

  useEffect(() => {
    if (!open) return;
    setPlayerSelection({});
    setNpcSelection({});
    setPlayerCoins(0);
    setConfirming(false);
  }, [activeNpcName, open]);

  if (!open || !activeNpcName) return null;

  const clampSelection = (value: number, max: number) => Math.max(0, Math.min(max, Math.floor(Number(value || 0))));
  const toggleSelection = (
    stack: DisplayStack,
    selection: Record<string, number>,
    setSelection: React.Dispatch<React.SetStateAction<Record<string, number>>>,
  ) => {
    if (stack.disabled) return;
    setSelection({
      ...selection,
      [stack.itemId]: selection[stack.itemId] ? 0 : 1,
    });
  };

  const updateSelectionQuantity = (
    side: 'player' | 'npc',
    itemId: string,
    value: number,
  ) => {
    const max = side === 'player' ? playerMaxByItem[itemId] ?? 0 : npcMaxByItem[itemId] ?? 0;
    const nextQuantity = clampSelection(value, max);
    const update = (current: Record<string, number>) => {
      const next = { ...current };
      if (nextQuantity > 0) next[itemId] = nextQuantity;
      else delete next[itemId];
      return next;
    };
    if (side === 'player') setPlayerSelection(update);
    else setNpcSelection(update);
  };

  const playerItems = selectionList(playerSelection);
  const npcItems = selectionList(npcSelection);
  const hasTrade = playerItems.length > 0 || npcItems.length > 0 || playerCoins > 0;
  const coins = Math.max(0, Math.min(Math.floor(Number(playerCoins || 0)), Math.max(0, walletCoins)));

  const submitTrade = async () => {
    if (!hasTrade || isLoading) return;
    try {
      const result = await executeNpcTrade({
        roomId,
        npcName: activeNpcName,
        playerItems,
        npcItems,
        playerCoins: coins,
        absoluteGameMinutes: sceneRef.current?.getAbsoluteGameMinutes?.() ?? 0,
      }).unwrap();
      sceneRef.current?.syncEventSaveData(result.gameSave);
      gameBus.emit('npc:trade_completed', {
        npcName: activeNpcName,
        playerItems: result.trade.playerItems,
        npcItems: result.trade.npcItems,
        playerCoins: result.trade.playerCoins,
        npcInventory: result.npcInventory,
      });
      message.success('交易完成。');
      setPlayerSelection({});
      setNpcSelection({});
      setPlayerCoins(0);
      setConfirming(false);
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err?.data?.message || '交易失败');
      setConfirming(false);
    }
  };

  const renderSummaryRows = (side: 'player' | 'npc', items: NpcTradeStack[]) => (
    items.length === 0
      ? <div className="npc-trade-summary__empty">没有选中物品</div>
      : items.map((item) => {
          const max = side === 'player' ? playerMaxByItem[item.itemId] ?? 0 : npcMaxByItem[item.itemId] ?? 0;
          return (
            <div className="npc-trade-summary__row" key={`${side}-${item.itemId}`}>
              <span>{getItemLabel(item.itemId)}</span>
              <div className="npc-trade-stepper">
                <button type="button" onClick={() => updateSelectionQuantity(side, item.itemId, item.quantity - 1)}>-</button>
                <input
                  value={item.quantity}
                  inputMode="numeric"
                  onChange={(event) => updateSelectionQuantity(side, item.itemId, Number(event.target.value))}
                />
                <button type="button" onClick={() => updateSelectionQuantity(side, item.itemId, item.quantity + 1)} disabled={item.quantity >= max}>+</button>
              </div>
            </div>
          );
        })
  );

  return (
    <div className="npc-trade-backdrop" role="dialog" aria-modal="true" aria-label={`${activeNpcName} 交易`}>
      <section className="npc-trade-panel">
        <header className="npc-trade-header">
          <div>
            <h2>和 {activeNpcName} 交易</h2>
            <p>选择双方要交出的物品，金币只从玩家支付。</p>
          </div>
          <div className="npc-trade-header__right">
            <strong>{walletCoins.toLocaleString()} 金币</strong>
            <button type="button" className="npc-trade-close" onClick={onClose}>X</button>
          </div>
        </header>

        <div className="npc-trade-body">
          <section className="npc-trade-inventory">
            <h3>玩家背包</h3>
            <div className="npc-trade-grid">
              {playerStacks.length === 0 ? (
                <div className="npc-trade-empty">背包是空的</div>
              ) : playerStacks.map((stack) => (
                <StackButton
                  key={`player-${stack.itemId}`}
                  stack={stack}
                  side="player"
                  selectedQuantity={playerSelection[stack.itemId] ?? 0}
                  onToggle={(next) => toggleSelection(next, playerSelection, setPlayerSelection)}
                />
              ))}
            </div>
          </section>

          <section className="npc-trade-inventory">
            <h3>{activeNpcName} 的背包</h3>
            <div className="npc-trade-grid">
              {npcStacks.length === 0 ? (
                <div className="npc-trade-empty">对方没有可交易物品</div>
              ) : npcStacks.map((stack) => (
                <StackButton
                  key={`npc-${stack.itemId}`}
                  stack={stack}
                  side="npc"
                  selectedQuantity={npcSelection[stack.itemId] ?? 0}
                  onToggle={(next) => toggleSelection(next, npcSelection, setNpcSelection)}
                />
              ))}
            </div>
          </section>
        </div>

        <footer className="npc-trade-footer">
          <div className="npc-trade-summary">
            <div>
              <h4>玩家交出</h4>
              {renderSummaryRows('player', playerItems)}
            </div>
            <div>
              <h4>{activeNpcName} 交出</h4>
              {renderSummaryRows('npc', npcItems)}
            </div>
          </div>
          <label className="npc-trade-coins">
            <span>支付金币</span>
            <input
              value={playerCoins}
              inputMode="numeric"
              onChange={(event) => setPlayerCoins(Math.max(0, Math.min(Number(event.target.value || 0), walletCoins)))}
              onBlur={() => setPlayerCoins(coins)}
            />
          </label>
          <button
            type="button"
            className="npc-trade-submit"
            disabled={!hasTrade || isLoading}
            onClick={() => setConfirming(true)}
          >
            交易
          </button>
        </footer>

        {confirming && (
          <div className="npc-trade-confirm">
            <div className="npc-trade-confirm__box">
              <h3>确认交易？</h3>
              <p>
                玩家交出 {selectionCount(playerSelection)} 件物品
                {coins > 0 ? ` 和 ${coins} 金币` : ''}；
                {activeNpcName} 交出 {selectionCount(npcSelection)} 件物品。
              </p>
              <div>
                <button type="button" onClick={() => setConfirming(false)}>取消</button>
                <button type="button" disabled={isLoading} onClick={submitTrade}>确认</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default NpcTradeModal;
