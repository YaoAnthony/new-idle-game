import React from 'react';
import type { NpcSkillInspectorProps } from './types';

const panelStyle: React.CSSProperties = {
  border: '1px solid rgba(238,221,173,0.18)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.045)',
  padding: 14,
};

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' }) {
  const color = tone === 'good' ? '#8fd7a2' : tone === 'warn' ? '#ffd08a' : 'rgba(255,255,255,0.66)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 24,
        padding: '3px 8px',
        border: '1px solid rgba(238,221,173,0.2)',
        borderRadius: 999,
        background: 'rgba(241,216,144,0.08)',
        color,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function formatGameMinute(gameMinute?: number): string {
  return typeof gameMinute === 'number' && Number.isFinite(gameMinute) ? gameMinute.toFixed(0) : '-';
}

export function FallbackSkillInspector({ skillId, skill, label }: NpcSkillInspectorProps) {
  return (
    <article style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ color: 'var(--px-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
            Function Skill
          </div>
          <strong style={{ display: 'block', marginTop: 4 }}>{label || skillId}</strong>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
          <Chip tone={skill.enabled === false ? 'warn' : 'good'}>{skill.enabled === false ? 'disabled' : 'enabled'}</Chip>
          <Chip>{skill.source ?? 'unknown'}</Chip>
          <Chip>learned {formatGameMinute(skill.learnedAtGameMinute)}</Chip>
        </div>
      </div>
      <p style={{ margin: '10px 0 0', color: 'var(--px-muted)', lineHeight: 1.5 }}>
        This skill has no dedicated inspector yet. It is registered in the NPC mind and can receive a custom view later.
      </p>
    </article>
  );
}
