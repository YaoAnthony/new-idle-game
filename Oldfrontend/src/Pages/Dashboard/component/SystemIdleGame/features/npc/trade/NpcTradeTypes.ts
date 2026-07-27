import type React from 'react';
import type { GameInventoryItem } from '../../../../../../../Redux/Features/gameSlice';
import type { GameSaveV2 } from '../../../persistence/save/GameSaveTypes';

export interface NpcTradeStack {
  itemId: string;
  quantity: number;
}

export interface NpcTradeSelection extends NpcTradeStack {
  side: 'player' | 'npc';
}

export interface NpcTradeExecuteRequest {
  roomId?: string | null;
  npcName: string;
  playerItems: NpcTradeStack[];
  npcItems: NpcTradeStack[];
  playerCoins: number;
  absoluteGameMinutes?: number;
}

export interface NpcTradeExecuteResponse {
  success: boolean;
  wallet: { coins: number };
  gameInventory: GameInventoryItem[];
  npcInventory: Record<string, number>;
  gameSave: GameSaveV2;
  trade: {
    npcName: string;
    playerItems: NpcTradeStack[];
    npcItems: NpcTradeStack[];
    playerCoins: number;
    absoluteGameMinutes: number;
  };
}

export interface NpcTradePanelExtension {
  id: string;
  title: string;
  canRender(input: { npcName: string; skills?: Record<string, unknown> | null }): boolean;
  render(input: { npcName: string; onClose: () => void }): React.ReactNode;
}
