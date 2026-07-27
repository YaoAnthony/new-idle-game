import React from 'react';
import { emptyHealthUrl, fullHealthUrl } from '../../../../../assets';
import { MAX_ACTOR_HEALTH, normalizeActorHealth } from '../shared/health';

interface HealthBarProps {
  health: number;
  max?: number;
}

export const HealthBar: React.FC<HealthBarProps> = ({ health, max = MAX_ACTOR_HEALTH }) => {
  const normalized = normalizeActorHealth(health, max);

  return (
    <div style={{
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
      {Array.from({ length: max }).map((_, index) => {
        const src = index < normalized ? fullHealthUrl : emptyHealthUrl;
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
