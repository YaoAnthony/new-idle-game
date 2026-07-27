import React from 'react';
import { FaBed, FaCat, FaHammer, FaHome, FaQuestion, FaUser, FaWarehouse } from 'react-icons/fa';
import { ItemIcon } from './ItemIcon';

const CATEGORY_META: Record<string, {
  accent: string;
  Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}> = {
  npc: { accent: '#4c9f58', Icon: FaUser },
  house: { accent: '#d68b24', Icon: FaHome },
  storage: { accent: '#a9683a', Icon: FaWarehouse },
  tool: { accent: '#4f73d9', Icon: FaHammer },
  furniture: { accent: '#8d6bd6', Icon: FaBed },
  pet: { accent: '#c8754c', Icon: FaCat },
};

export const CatalogIcon: React.FC<{
  category?: string;
  itemId?: string | null;
  visualKey?: string | null;
  size?: number;
}> = ({ category = 'item', itemId, visualKey, size = 72 }) => {
  if (visualKey || itemId) {
    return <ItemIcon itemId={itemId} visualKey={visualKey} size={size} />;
  }

  const meta = CATEGORY_META[category] ?? { accent: '#777', Icon: FaQuestion };
  const Icon = meta.Icon;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center',
        color: '#ffe7a6',
        background: `linear-gradient(180deg, ${meta.accent}, #4d2b1a)`,
        border: '3px solid #32190e',
        borderRadius: 6,
        boxShadow: 'inset 0 3px 0 rgba(255,255,255,0.22), inset 0 -7px 0 rgba(0,0,0,0.22), 0 4px 0 #28160d',
      }}
    >
      <Icon size={Math.floor(size * 0.48)} />
    </div>
  );
};
