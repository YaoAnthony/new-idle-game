import React, { useCallback, useEffect } from 'react';
import type { SlotItem } from '../../../../../Redux/Features/gameSlice';
import { ItemIcon } from '../visuals';

interface HotbarProps {
  selected: number;
  onChange: (slot: number) => void;
  hotbarSlots: (SlotItem | null)[];
}

export const Hotbar: React.FC<HotbarProps> = ({ selected, onChange, hotbarSlots }) => {
  const SLOT_SIZE = 50;
  const ICON_SIZE = 30;

  const handleKey = useCallback((event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const key = event.key;
    if (key >= '1' && key <= '9') onChange(parseInt(key, 10) - 1);
    else if (key === '0') onChange(9);
  }, [onChange]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div style={{
      position: 'absolute',
      bottom: 10,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 3,
      background: 'rgba(0,0,0,0.60)',
      border: '2px solid #555',
      borderRadius: 8,
      padding: '4px 6px',
      zIndex: 100,
      userSelect: 'none',
    }}>
      {hotbarSlots.map((item, index) => {
        const isActive = index === selected;
        return (
          <div
            key={index}
            onClick={() => onChange(index)}
            title={item ? `${item.itemId} x${item.quantity}` : `格 ${index === 9 ? '0' : index + 1}`}
            style={{
              width: SLOT_SIZE,
              height: SLOT_SIZE,
              background: isActive ? 'rgba(180,150,60,0.35)' : 'rgba(30,30,30,0.7)',
              border: isActive ? '2px solid #ffd700' : '2px solid #333',
              borderRadius: 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
              boxSizing: 'border-box',
              transition: 'background 0.1s, border-color 0.1s',
            }}
          >
            {item && <ItemIcon itemId={item.itemId} size={ICON_SIZE} />}
            {item && item.quantity > 1 && (
              <div style={{
                position: 'absolute',
                bottom: 1,
                right: 3,
                fontSize: 9,
                color: '#fff',
                fontFamily: '"Courier New", monospace',
                fontWeight: 'bold',
                lineHeight: 1,
                textShadow: '0 0 3px #000',
              }}>
                {item.quantity}
              </div>
            )}
            <div style={{
              position: 'absolute',
              top: 1,
              right: 3,
              fontSize: 8,
              color: isActive ? '#ffd700' : '#555',
              fontFamily: '"Courier New", monospace',
              lineHeight: 1,
            }}>
              {index === 9 ? '0' : String(index + 1)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
