import React from 'react';
import type { NpcSkillInspectorProps } from '../types';
import { buildFarmPlotWorkerViewModel, type FarmPlotCardViewModel } from './farmPlotViewModel';

const panelStyle: React.CSSProperties = {
  border: '1px solid rgba(238,221,173,0.18)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.045)',
  padding: 14,
};

const cardStyle: React.CSSProperties = {
  border: '1px solid rgba(238,221,173,0.16)',
  borderRadius: 7,
  background: 'rgba(0,0,0,0.2)',
  padding: 12,
  minWidth: 0,
};

function formatGameMinute(gameMinute?: number | null): string {
  return typeof gameMinute === 'number' && Number.isFinite(gameMinute) ? gameMinute.toFixed(0) : '-';
}

function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info';
}) {
  const color = {
    neutral: 'rgba(255,255,255,0.66)',
    good: '#8fd7a2',
    warn: '#ffd08a',
    bad: '#ff9b9b',
    info: '#9ecbff',
  }[tone];
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

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <div style={{ color: 'var(--px-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function toneForPlot(plot: FarmPlotCardViewModel): 'good' | 'warn' | 'bad' | 'info' | 'neutral' {
  if (plot.status === 'blocked') return 'bad';
  if (plot.status === 'ready') return 'info';
  if (plot.status === 'actionable') return 'good';
  if (plot.status === 'waiting') return 'warn';
  return 'neutral';
}

function PlotCard({ plot }: { plot: FarmPlotCardViewModel }) {
  const tone = toneForPlot(plot);
  return (
    <article style={{ ...cardStyle, borderColor: tone === 'bad' ? 'rgba(255,155,155,0.42)' : tone === 'good' ? 'rgba(143,215,162,0.36)' : 'rgba(238,221,173,0.16)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
        <div>
          <strong>Tile {plot.tx}, {plot.ty}</strong>
          <div style={{ color: 'var(--px-muted)', fontSize: 12, marginTop: 4 }}>
            world {Math.round(plot.worldX)}, {Math.round(plot.worldY)}
          </div>
        </div>
        <Chip tone={tone}>{plot.statusLabel}</Chip>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        <Chip>{plot.worldId}</Chip>
        <Chip>{plot.areaLabel}</Chip>
        <Chip tone={plot.claimStatus === 'owned' ? 'good' : 'bad'}>
          {plot.claimStatus === 'owned' ? `claim ${plot.claimOwner}` : plot.claimStatus.replace(/_/g, ' ')}
        </Chip>
        <Chip tone={plot.terrain === 'grass' ? 'good' : 'bad'}>{plot.terrain}</Chip>
        <Chip>{plot.state}</Chip>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12, color: 'var(--px-muted)', fontSize: 12 }}>
        <div>crop: <strong style={{ color: 'var(--px-text)' }}>{plot.cropId ?? '-'}</strong></div>
        <div>stage: <strong style={{ color: 'var(--px-text)' }}>{plot.stage ?? '-'}</strong></div>
        <div>desired: <strong style={{ color: 'var(--px-text)' }}>{plot.desiredCropId ?? '-'}</strong></div>
        <div>checked: <strong style={{ color: 'var(--px-text)' }}>{formatGameMinute(plot.lastCheckedGameMinute)}</strong></div>
        <div>action: <strong style={{ color: 'var(--px-text)' }}>{formatGameMinute(plot.lastActionGameMinute)}</strong></div>
        <div>decision: <strong style={{ color: 'var(--px-text)' }}>{plot.lastDecision?.kind ?? '-'}</strong></div>
      </div>

      {plot.lastBlocker?.reason ? (
        <div style={{ marginTop: 10, color: '#ffb1b1', fontSize: 12, lineHeight: 1.4 }}>
          blocker: {plot.lastBlocker.reason}
        </div>
      ) : plot.lastDecision?.reason ? (
        <div style={{ marginTop: 10, color: 'var(--px-muted)', fontSize: 12, lineHeight: 1.4 }}>
          decision: {plot.lastDecision.reason}
        </div>
      ) : null}
    </article>
  );
}

export function FarmPlotWorkerInspector(props: NpcSkillInspectorProps) {
  const vm = buildFarmPlotWorkerViewModel(props);

  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ color: 'var(--px-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
            Function Skill Inspector
          </div>
          <h3 style={{ margin: '4px 0 0', fontSize: 18 }}>Farm Plot Worker</h3>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Chip tone={vm.enabled ? 'good' : 'warn'}>{vm.enabled ? 'enabled' : 'disabled'}</Chip>
          <Chip>{props.skill.source ?? 'unknown'}</Chip>
        </div>
      </div>

      <p style={{ margin: '10px 0 0', color: 'var(--px-muted)', lineHeight: 1.5 }}>
        {vm.diagnosis}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8, marginTop: 14 }}>
        <Metric label="plots" value={vm.assignedCount} />
        <Metric label="claim ok" value={vm.claimOkCount} />
        <Metric label="missing" value={vm.claimMissingCount} />
        <Metric label="other" value={vm.claimOtherCount} />
        <Metric label="blocked" value={vm.blockedCount} />
        <Metric label="seeds" value={vm.seedCount} />
      </div>

      {vm.groups.length === 0 ? (
        <div
          style={{
            marginTop: 14,
            padding: '16px 14px',
            border: '1px dashed rgba(238,221,173,0.22)',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.55)',
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          No farm plots are assigned to this NPC.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
          {vm.groups.map((group) => (
            <section key={group.key} style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <strong>{group.areaLabel}</strong>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Chip>{group.worldId}</Chip>
                  <Chip>{group.plots.length} plot(s)</Chip>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                {group.plots.map((plot) => <PlotCard key={plot.key} plot={plot} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
