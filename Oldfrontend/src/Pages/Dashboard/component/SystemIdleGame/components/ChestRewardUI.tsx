import React from 'react';
import { getRarityColor } from '@timeplan-game/core/economy/coinRules';
import type { ChestRewardItem } from '../../../../../Types/Profile';

interface Props {
  rewards: { coins: number; items: ChestRewardItem[] };
  onConfirm: () => void;
}

const ChestRewardUI: React.FC<Props> = ({ rewards, onConfirm }) => (
  <div style={{
    position: 'absolute',
    inset: 0,
    zIndex: 400,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.65)',
  }}>
    <div style={{
      background: '#1a1208',
      border: '3px solid #c8a850',
      borderRadius: 10,
      padding: '28px 36px',
      minWidth: 280,
      maxWidth: 420,
      fontFamily: '"Courier New", monospace',
      color: '#fffde8',
      textAlign: 'center',
      boxShadow: '0 0 32px #c8a85066',
    }}>
      <div style={{ fontSize: 22, marginBottom: 6, letterSpacing: 0 }}>宝箱已打开</div>
      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 20 }}>获得以下奖励</div>

      {rewards.coins > 0 && (
        <div style={{
          background: '#2b1e00',
          border: '1px solid #c8a850',
          borderRadius: 6,
          padding: '8px 16px',
          marginBottom: 10,
          fontSize: 15,
          color: '#ffe57a',
        }}>
          金币 x{rewards.coins}
        </div>
      )}

      {rewards.items.map((item, i) => (
        <div key={i} style={{
          background: '#15100a',
          border: `1px solid ${getRarityColor(item.rarity, '#888')}`,
          borderRadius: 6,
          padding: '8px 16px',
          marginBottom: 8,
          textAlign: 'left',
          fontSize: 13,
        }}>
          <span style={{ color: getRarityColor(item.rarity, '#ccc'), fontWeight: 'bold' }}>
            {item.name}
          </span>
          <span style={{ color: '#aaa', marginLeft: 8, fontSize: 11 }}>
            [{item.rarity}]
          </span>
          {item.quantity > 1 && (
            <span style={{ color: '#ffe57a', marginLeft: 8 }}>x{item.quantity}</span>
          )}
          {item.description && (
            <div style={{ color: '#888', fontSize: 10, marginTop: 3 }}>{item.description}</div>
          )}
        </div>
      ))}

      {rewards.coins === 0 && rewards.items.length === 0 && (
        <div style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>空宝箱</div>
      )}

      <button
        onClick={onConfirm}
        style={{
          marginTop: 18,
          background: '#4a3500',
          color: '#fffde8',
          border: '2px solid #c8a850',
          borderRadius: 6,
          padding: '8px 32px',
          fontSize: 14,
          fontFamily: '"Courier New", monospace',
          cursor: 'pointer',
          letterSpacing: 0,
        }}
      >
        领取
      </button>
    </div>
  </div>
);

export default ChestRewardUI;
