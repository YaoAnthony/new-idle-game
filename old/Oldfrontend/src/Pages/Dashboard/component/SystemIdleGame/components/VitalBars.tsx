import React from 'react';
import { HungerBar } from './HungerBar';
import { HealthBar } from './HealthBar';

interface VitalBarsProps {
  hunger: number;
  health: number;
}

export const VitalBars: React.FC<VitalBarsProps> = ({ hunger, health }) => (
  <div style={{
    position:      'absolute',
    bottom:        74,
    left:          '50%',
    transform:     'translateX(-50%)',
    display:       'flex',
    alignItems:    'center',
    justifyContent: 'center',
    gap:           6,
    zIndex:        105,
    pointerEvents: 'none',
    maxWidth:      'calc(100vw - 12px)',
  }}>
    <HungerBar hunger={hunger} embedded />
    <HealthBar health={health} />
  </div>
);
