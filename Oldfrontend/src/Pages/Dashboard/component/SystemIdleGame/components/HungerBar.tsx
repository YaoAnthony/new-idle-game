import React from 'react';
import { emptyHungerUrl, fullHungerUrl, halfHungerUrl } from '../../../../../assets';
import { PLAYER_MAX_HUNGER, normalizePlayerHunger } from '../shared/food';

interface HungerBarProps {
  hunger: number;
  max?: number;
  embedded?: boolean;
}

export const HungerBar: React.FC<HungerBarProps> = ({ hunger, max = PLAYER_MAX_HUNGER, embedded = false }) => {
  const normalized = normalizePlayerHunger(hunger, max);
  const slots = Math.ceil(max / 2);

  return (
    <div style={{
      ...(embedded ? {} : {
        position:  'absolute',
        bottom:    74,
        left:      '50%',
        transform: 'translateX(-50%)',
      }),
      display:       'flex',
      gap:           1,
      zIndex:        105,
      pointerEvents: 'none',
      padding:       '2px 6px',
      background:    'rgba(0, 0, 0, 0.25)',
      border:        '1px solid rgba(255, 255, 255, 0.14)',
      borderRadius:  6,
      userSelect:    'none',
    }}>
      {Array.from({ length: slots }).map((_, index) => {
        const value = normalized - index * 2;
        const src = value >= 2 ? fullHungerUrl : value === 1 ? halfHungerUrl : emptyHungerUrl;
        return (
          <img
            key={index}
            src={src}
            alt=""
            width={12}
            height={12}
            draggable={false}
            style={{
              imageRendering: 'pixelated',
              filter:         'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.75))',
            }}
          />
        );
      })}
    </div>
  );
};
