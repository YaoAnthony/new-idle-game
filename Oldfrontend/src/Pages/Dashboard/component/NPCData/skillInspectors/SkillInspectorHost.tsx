import React from 'react';
import type { NpcLearnedSkillState } from '../../SystemIdleGame/shared/worldStateTypes';
import { FallbackSkillInspector } from './FallbackSkillInspector';
import { findNpcSkillInspector } from './registry';
import type { NpcSkillInspectorContext } from './types';

const sectionStyle: React.CSSProperties = {
  border: '1px solid rgba(238,221,173,0.2)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.06)',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.035), 0 18px 46px rgba(0,0,0,0.18)',
  padding: 16,
  minWidth: 0,
};

const subtlePanelStyle: React.CSSProperties = {
  border: '1px solid rgba(238,221,173,0.16)',
  borderRadius: 7,
  background: 'rgba(0,0,0,0.18)',
};

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' }) {
  const color = tone === 'good' ? '#8fd7a2' : tone === 'warn' ? '#ffd08a' : 'rgba(255,255,255,0.64)';
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

function learnedSkillEntries(skills: Record<string, NpcLearnedSkillState> | undefined) {
  return Object.entries(skills ?? {})
    .filter(([, skill]) => skill?.learned)
    .sort(([a], [b]) => a.localeCompare(b));
}

export function SkillInspectorHost(ctx: NpcSkillInspectorContext) {
  const skills = learnedSkillEntries(ctx.mind?.skills);

  return (
    <section style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, lineHeight: 1.2 }}>Function Skill Inspectors</h2>
          <div style={{ marginTop: 5, color: 'var(--px-muted)', fontSize: 12 }}>
            Dedicated observability views for learned NPC function skills.
          </div>
        </div>
        <Chip>{skills.length}</Chip>
      </div>

      {skills.length === 0 ? (
        <div
          style={{
            marginTop: 12,
            padding: '16px 14px',
            border: '1px dashed rgba(238,221,173,0.22)',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.55)',
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          No learned function skills yet.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {skills.map(([skillId, skill]) => (
              <div key={skillId} style={{ ...subtlePanelStyle, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <strong>{skillId}</strong>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Chip tone={skill.enabled === false ? 'warn' : 'good'}>{skill.enabled === false ? 'disabled' : 'enabled'}</Chip>
                    <Chip>{skill.source ?? 'unknown'}</Chip>
                    <Chip>learned: {formatGameMinute(skill.learnedAtGameMinute)}</Chip>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            {skills.map(([skillId, skill]) => {
              const inspector = findNpcSkillInspector(skillId);
              const Component = inspector && inspector.shouldShow(ctx)
                ? inspector.Component
                : FallbackSkillInspector;
              return (
                <Component
                  key={skillId}
                  {...ctx}
                  skillId={skillId}
                  skill={skill}
                  label={inspector?.label ?? skillId}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
