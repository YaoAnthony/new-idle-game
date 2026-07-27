import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import 'github-markdown-css/github-markdown-light.css';
import type { RootState } from '../../../../Redux/store';
import {
  useGetGameCatalogsQuery,
  useLazyGetNpcMemoriesQuery,
  useLazyGetNpcSkillQuery,
  type NpcPersonaSkill,
} from '../../../../api/profileStateRtkApi';
import {
  getGameNpcCatalog,
  getNpcDefinitionsForSave,
  setRuntimeNpcCatalog,
} from '../SystemIdleGame/shared/GameNpcCatalog';
import { getDefaultNpcSchedule } from '../SystemIdleGame/features/npc/blackboard/NpcScheduleBlackboardSystem';
import {
  applyNpcMindCatalogDefaults,
  migrateNpcMindState,
} from '../SystemIdleGame/features/npc/blackboard/NpcMindDefaults';
import {
  FARM_PLOT_WORKER_SKILL_ID,
  SURVIVAL_FOOD_SKILL_ID,
  canUseNpcKnowledgeSkill,
  getAssignedFarmPlots,
  getNpcCapabilitySkills,
  getNpcKnowledgeSkills,
  hasLearnedFarmPlotWorker,
  hasLearnedSurvivalFood,
  normalizeNpcSkillId,
  setRuntimeNpcSkillCatalog,
  type NpcCapabilitySkillDefinition,
  type NpcKnowledgeSkill,
} from '../SystemIdleGame/shared/NpcDefaultSkillCatalog';
import {
  deriveNpcPersonalityTags,
  normalizePersonalityTagList,
} from '../SystemIdleGame/shared/NpcPersonalityTags';
import { SkillInspectorHost } from './skillInspectors/SkillInspectorHost';
import type { NpcSkillInspectorAgentWorld } from './skillInspectors/types';
import './NPCData.css';
import type {
  NpcDailyActivity,
  NpcMemoryRecord,
  NpcMindState,
  NpcPersonalityState,
  NpcSkillProgressEntry,
  NpcSkillRuntimeState,
  WorldState,
} from '../SystemIdleGame/shared/worldStateTypes';

type TabId = 'overview' | 'memory' | 'persona' | 'work' | 'navigation' | 'debug';

const DEFAULT_SELECTED_NPC_NAME = '';

const roleLabel: Record<string, string> = {
  starter: '初始伙伴',
  farmer: '农夫',
  carpenter: '木匠',
  merchant: '商人',
  scholar: '学者',
  rancher: '牧场工',
};

const roleWork: Record<string, string[]> = {
  starter: ['聊天', '基础协作', '村庄引导'],
  farmer: ['种田', '浇水', '收菜'],
  carpenter: ['砍树', '修家具', '造桥'],
  merchant: ['刷新商品', '交易', '记价格'],
  scholar: ['总结记忆', '整理任务', '记录事件'],
  rancher: ['照顾鸡', '捡蛋', '喂水'],
};

const roleWorkSkillAllowList: Record<string, (skill: NpcKnowledgeSkill) => boolean> = {
  starter: () => true,
  farmer: (skill) => skill.id.startsWith('farm_') || skill.id === 'pick_apple_tree_day',
  rancher: (skill) => skill.id === 'farm_water_day' || skill.id === 'farm_harvest_day',
};

const tabs: Array<{ id: TabId; labelKey: string }> = [
  { id: 'overview', labelKey: 'npcData.tabs.overview' },
  { id: 'memory', labelKey: 'npcData.tabs.memory' },
  { id: 'persona', labelKey: 'npcData.tabs.persona' },
  { id: 'work', labelKey: 'npcData.tabs.work' },
  { id: 'navigation', labelKey: 'npcData.tabs.navigation' },
  { id: 'debug', labelKey: 'npcData.tabs.debug' },
];

const panelStyle: React.CSSProperties = {
  border: '1px solid rgba(238,221,173,0.2)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.06)',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.035), 0 18px 46px rgba(0,0,0,0.18)',
};

const subtlePanelStyle: React.CSSProperties = {
  border: '1px solid rgba(238,221,173,0.16)',
  borderRadius: 7,
  background: 'rgba(0,0,0,0.18)',
};

function prettifyIdentifier(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tMemoryKind(t: TFunction, kind: string | undefined): string {
  if (!kind) return t('npcData.memory.meta.unknown');
  return t(`npcData.memory.kind.${kind}`, { defaultValue: prettifyIdentifier(kind) });
}

function tMemoryType(t: TFunction, type: string | undefined): string {
  if (!type) return t('npcData.memory.meta.unknown');
  return t(`npcData.memory.type.${type}`, { defaultValue: prettifyIdentifier(type) });
}

function tNpcIntent(t: TFunction, intent: string | undefined): string {
  if (!intent) return t('npcData.intent.idle');
  return t(`npcData.intent.${intent}`, { defaultValue: prettifyIdentifier(intent) });
}

function tNpcActivity(t: TFunction, activity: string | null | undefined): string {
  if (!activity) return t('npcData.chips.noActivity');
  return t(`npcData.activity.${activity}`, { defaultValue: prettifyIdentifier(activity) });
}

function tNpcIntentReason(t: TFunction, reason: string | undefined): string {
  if (!reason) return t('npcData.chips.noReason');
  return t(`npcData.intentReason.${reason}`, { defaultValue: prettifyIdentifier(reason) });
}

function tNpcPlace(t: TFunction, place: string | undefined): string {
  if (!place) return '-';
  return t(`npcData.place.${place}`, { defaultValue: tMemoryType(t, place) });
}

function formatMemoryMetaSummary(t: TFunction, meta: Record<string, unknown> | undefined): string[] {
  if (!meta) return [];
  return Object.entries(meta)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object')
    .slice(0, 4)
    .map(([key, value]) => {
      const rawValue = String(value);
      const label = t(`npcData.memory.metaKey.${key}`, { defaultValue: prettifyIdentifier(key) });
      const localizedValue = t(`npcData.memory.metaValue.${rawValue}`, {
        defaultValue: tMemoryType(t, rawValue),
      });
      return `${label}: ${localizedValue}`;
    });
}

const npcDataThemeVars = {
  '--px-bg': '#0b0f18',
  '--px-surface': 'rgba(255,255,255,0.06)',
  '--px-surface2': 'rgba(0,0,0,0.18)',
  '--px-border': 'rgba(238,221,173,0.2)',
  '--px-border-gold': 'rgba(241,216,144,0.48)',
  '--px-gold': '#f1d890',
  '--px-text': 'rgba(255,255,255,0.9)',
  '--px-muted': 'rgba(255,255,255,0.55)',
} as React.CSSProperties;

function formatGameMinute(gameMinute?: number): string {
  if (typeof gameMinute !== 'number' || !Number.isFinite(gameMinute)) return '-';
  return gameMinute.toFixed(0);
}

function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60).toString().padStart(2, '0');
  const m = (minute % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function sortMemories(memories: Record<string, NpcMemoryRecord> | undefined): NpcMemoryRecord[] {
  return Object.values(memories ?? {}).sort((a, b) => b.lastSeenGameMinute - a.lastSeenGameMinute);
}

function compactCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function formatCompactNumber(value: unknown, digits = 0): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const personalityLabel: Record<keyof NpcPersonalityState, string> = {
  courage: '勇气',
  sociability: '社交',
  curiosity: '好奇',
  emotionality: '情绪',
  flexibility: '变通',
  empathy: '共情',
  materialism: '物质',
};

function getPersonalityTags(mind: NpcMindState | null | undefined): string[] {
  const metaTags = normalizePersonalityTagList(mind?.meta?.personalityTags);
  return metaTags.length ? metaTags : deriveNpcPersonalityTags(mind?.personality);
}

function getSkillProgressEntry(
  mind: NpcMindState | null | undefined,
  skill: NpcCapabilitySkillDefinition,
): NpcSkillProgressEntry | null {
  const progress = mind?.skillProgress?.progress ?? {};
  const ids = [skill.id, ...(skill.aliases ?? [])].map(normalizeNpcSkillId).filter(Boolean);
  return ids.map((id) => progress[id]).find(Boolean)
    ?? Object.values(progress).find((entry) => ids.includes(normalizeNpcSkillId(entry.skillId)))
    ?? null;
}

function getSkillRuntimeState(
  mind: NpcMindState | null | undefined,
  skill: NpcCapabilitySkillDefinition,
): NpcSkillRuntimeState | null {
  const runtime = mind?.skillProgress?.runtime ?? {};
  const legacyRuntime = mind?.skillState ?? {};
  const ids = [skill.id, ...(skill.aliases ?? [])].map(normalizeNpcSkillId).filter(Boolean);
  return ids.map((id) => runtime[id] ?? legacyRuntime[id]).find((value): value is NpcSkillRuntimeState => (
    Boolean(value) && typeof value === 'object'
  )) ?? null;
}

function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'muted';
}) {
  const color = tone === 'good'
    ? '#8fd7a2'
    : tone === 'warn'
      ? '#ffd08a'
      : tone === 'muted'
        ? 'rgba(255,255,255,0.42)'
        : 'rgba(255,255,255,0.64)';
  const border = tone === 'muted' ? 'rgba(255,255,255,0.12)' : 'rgba(238,221,173,0.2)';
  const background = tone === 'muted' ? 'rgba(255,255,255,0.035)' : 'rgba(241,216,144,0.08)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 20,
        padding: '2px 7px',
        border: `1px solid ${border}`,
        borderRadius: 999,
        background,
        color,
        fontSize: 10.5,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function StateMeter({
  label,
  value,
  max = 100,
  higherBetter = true,
}: {
  label: string;
  value: unknown;
  max?: number;
  higherBetter?: boolean;
}) {
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const ratio = clamp(numericValue / max, 0, 1);
  const healthRatio = higherBetter ? ratio : 1 - ratio;
  const meterColor = healthRatio < 0.34
    ? '#f08f8f'
    : healthRatio < 0.67
      ? '#f1d890'
      : '#8fd7a2';
  return (
    <div className="npc-state-meter" style={{ '--npc-meter-color': meterColor } as React.CSSProperties}>
      <div className="npc-state-meter__head">
        <span>{label}</span>
        <strong>{formatCompactNumber(value)}</strong>
      </div>
      <div className="npc-state-meter__track">
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function PersonalityBar({ label, value }: { label: string; value: unknown }) {
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? clamp(value, -1, 1) : 0;
  const left = ((numericValue + 1) / 2) * 100;
  return (
    <div className="npc-personality-bar">
      <div className="npc-personality-bar__head">
        <span>{label}</span>
        <strong>{numericValue.toFixed(2)}</strong>
      </div>
      <div className="npc-personality-bar__track">
        <span className="npc-personality-bar__zero" />
        <span className="npc-personality-bar__dot" style={{ left: `${left}%` }} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ ...subtlePanelStyle, padding: 9, minWidth: 0 }}>
      <div style={{ color: 'var(--px-muted)', fontSize: 9.5, fontWeight: 900, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          color: 'var(--px-text)',
          fontSize: 14,
          fontWeight: 900,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ ...panelStyle, padding: 11, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 13.5, lineHeight: 1.2 }}>{title}</h2>
        {action}
      </div>
      <div style={{ marginTop: 9 }}>{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '11px 12px',
        border: '1px dashed rgba(238,221,173,0.22)',
        borderRadius: 8,
        color: 'rgba(255,255,255,0.55)',
        background: 'rgba(255,255,255,0.04)',
        fontSize: 12,
      }}
    >
      {text}
    </div>
  );
}

function JsonBlock({ value, maxHeight = 220 }: { value: unknown; maxHeight?: number }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 9,
        maxHeight,
        overflow: 'auto',
        border: '1px solid var(--px-border)',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.08)',
        color: 'var(--px-muted)',
        fontSize: 10.5,
        lineHeight: 1.4,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trimStart();
}

function MarkdownBlock({ text, maxHeight = 520 }: { text: string; maxHeight?: number }) {
  return (
    <article
      className="markdown-body npc-data-markdown"
      style={{
        padding: 0,
        maxHeight,
        overflow: 'auto',
        border: 0,
        borderRadius: 0,
        background: 'transparent',
        color: 'var(--px-text)',
        fontFamily: '"Courier New", monospace',
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {text}
      </ReactMarkdown>
    </article>
  );
}

function splitSkillPath(path: string): { dir: string; name: string } {
  const parts = path.split('/');
  const name = parts.pop() ?? path;
  return { dir: parts.join('/') || 'root', name };
}

function SkillFiles({ skill }: { skill: NpcPersonaSkill }) {
  const files = skill.files ?? [];
  const fileSignature = files.map((file) => file.path).join('|');
  const [selectedPath, setSelectedPath] = useState(files[0]?.path ?? '');

  useEffect(() => {
    setSelectedPath(files[0]?.path ?? '');
  }, [fileSignature, skill.mode, skill.npcName, skill.slug]);

  if (skill.entryType !== 'package' || files.length <= 1) {
    return <MarkdownBlock text={skill.body || stripFrontmatter(skill.content)} maxHeight={520} />;
  }

  const selectedFile = files.find((file) => file.path === selectedPath) ?? files[0];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 9, minWidth: 0 }}>
      <div style={{ ...subtlePanelStyle, padding: 7, display: 'grid', gap: 5, alignSelf: 'start' }}>
        {files.map((file) => {
          const { name } = splitSkillPath(file.path);
          const selected = file.path === selectedFile.path;
          return (
            <button
              key={file.path}
              type="button"
              onClick={() => setSelectedPath(file.path)}
              title={file.path}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 8px',
                border: selected ? '1px solid var(--px-gold)' : '1px solid transparent',
                borderRadius: 4,
                background: selected ? 'rgba(255,214,10,0.12)' : 'transparent',
                color: selected ? 'var(--px-gold)' : 'var(--px-text)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11,
                fontWeight: 900,
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            marginBottom: 6,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            color: 'var(--px-muted)',
            fontSize: 10.5,
            fontWeight: 900,
          }}
        >
          <span>{selectedFile.path}</span>
          {selectedFile.kind ? <Chip>{selectedFile.kind}</Chip> : null}
        </div>
        <MarkdownBlock text={stripFrontmatter(selectedFile.content)} maxHeight={520} />
      </div>
    </div>
  );
}

function isNavigationSkill(skill: NpcKnowledgeSkill): boolean {
  return skill.steps.length > 0 && skill.steps.every((step) => step.kind === 'move_to');
}

function KnowledgeSkillList({
  skills,
  emptyText,
  showSteps = true,
  cardMode = false,
  mind = null,
  disableLocked = false,
}: {
  skills: NpcKnowledgeSkill[];
  emptyText: string;
  showSteps?: boolean;
  cardMode?: boolean;
  mind?: NpcMindState | null;
  disableLocked?: boolean;
}) {
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const { t } = useTranslation();

  if (skills.length === 0) return <Empty text={emptyText} />;

  if (cardMode) {
    return (
      <div className="npc-skill-card-grid">
        {skills.map((skill) => {
          const expanded = expandedSkillId === skill.id;
          const unlocked = canUseNpcKnowledgeSkill(mind, skill.id);
          const locked = disableLocked && !unlocked;
          const skillKey = `npcKnowledge.skills.${skill.id}`;
          return (
            <article key={skill.id} className={`npc-skill-card${locked ? ' npc-skill-card--locked' : ''}`}>
              <button
                type="button"
                className="npc-skill-card__title"
                disabled={locked}
                onClick={() => {
                  if (locked) return;
                  setExpandedSkillId(expanded ? null : skill.id);
                }}
              >
                <strong>{skill.label}</strong>
                {locked ? <span>未学会</span> : expanded ? <span>收起</span> : null}
              </button>
              <p>{skill.description}</p>
              <div className="npc-skill-card__chips" style={{ marginTop: 8 }}>
                <Chip tone={unlocked ? 'good' : 'neutral'}>{unlocked ? '已解锁' : '需要父技能'}</Chip>
                {skill.parentSkillId ? <Chip>parent: {skill.parentSkillId}</Chip> : null}
              </div>
              {expanded && !locked ? (
                <div className="npc-skill-card__details">
                  <div className="npc-skill-card__chips">
                    <Chip>{skill.id}</Chip>
                    <Chip>{skill.requiredTime ?? 'any'}</Chip>
                    {skill.triggers.map((trigger) => <Chip key={trigger}>{trigger}</Chip>)}
                  </div>
                  <div className="npc-skill-card__translation">
                    <div>
                      <span>中文</span>
                      <strong>{t(`${skillKey}.label`, { lng: 'zh', defaultValue: skill.label })}</strong>
                      <p>{t(`${skillKey}.description`, { lng: 'zh', defaultValue: skill.description })}</p>
                    </div>
                    <div>
                      <span>English</span>
                      <strong>{t(`${skillKey}.label`, { lng: 'en', defaultValue: skill.label })}</strong>
                      <p>{t(`${skillKey}.description`, { lng: 'en', defaultValue: skill.description })}</p>
                    </div>
                  </div>
                  {showSteps ? <JsonBlock value={skill.steps} maxHeight={180} /> : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {skills.map((skill) => (
        <div key={skill.id} style={{ ...subtlePanelStyle, padding: 9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
            <strong>{skill.label}</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
              <Chip tone={canUseNpcKnowledgeSkill(mind, skill.id) ? 'good' : 'warn'}>
                {canUseNpcKnowledgeSkill(mind, skill.id) ? '已解锁' : '需要父技能'}
              </Chip>
              <Chip>{skill.id}</Chip>
              {skill.parentSkillId ? <Chip>parent: {skill.parentSkillId}</Chip> : null}
              <Chip>{skill.requiredTime ?? 'any'}</Chip>
            </div>
          </div>
          <div style={{ marginTop: 5, color: 'var(--px-muted)', lineHeight: 1.4, fontSize: 12 }}>
            {skill.description}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
            {skill.triggers.map((trigger) => <Chip key={trigger}>{trigger}</Chip>)}
          </div>
          {showSteps ? (
            <div style={{ marginTop: 7 }}>
              <JsonBlock value={skill.steps} maxHeight={130} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CapabilitySkillList({
  skills,
  mind,
}: {
  skills: NpcCapabilitySkillDefinition[];
  mind: NpcMindState | null;
}) {
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);

  if (skills.length === 0) return <Empty text="当前技能目录没有能力型 skill。" />;

  return (
    <div className="npc-capability-grid">
      {skills.map((skill) => {
        const expanded = expandedSkillId === skill.id;
        const progress = getSkillProgressEntry(mind, skill);
        const runtime = getSkillRuntimeState(mind, skill);
        const level = progress?.level ?? 0;
        const learned = progress?.learned === true && progress.enabled !== false;
        const nextLevel = skill.levels
          .slice()
          .sort((a, b) => a.level - b.level)
          .find((entry) => entry.level > level);

        return (
          <article
            key={skill.id}
            className={`npc-capability-card${learned ? '' : ' npc-capability-card--locked'}`}
          >
            <button
              type="button"
              className="npc-capability-card__main"
              onClick={() => setExpandedSkillId(expanded ? null : skill.id)}
            >
              <span>
                <strong>{skill.name}</strong>
                <small>{skill.description || skill.id}</small>
              </span>
              <span className="npc-capability-card__level">Lv.{level}</span>
            </button>
            <div className="npc-capability-card__chips">
              <Chip tone={learned ? 'good' : 'muted'}>{learned ? '已学会' : '未学会'}</Chip>
              <Chip tone={learned ? 'neutral' : 'muted'}>xp {progress?.xp ?? 0}</Chip>
              <Chip tone={learned ? 'neutral' : 'muted'}>{progress?.source ?? 'no source'}</Chip>
              {runtime ? <Chip tone="good">runtime</Chip> : null}
            </div>
            <div className="npc-capability-card__hint">
              {nextLevel ? `下一阶段：${nextLevel.title} / ${nextLevel.xpRequired} XP` : '已经到达当前技能上限'}
            </div>
            {expanded ? (
              <div className="npc-capability-card__details">
                <div className="npc-skill-card__chips">
                  <Chip>{skill.id}</Chip>
                  {skill.aliases?.map((alias) => <Chip key={alias}>alias: {alias}</Chip>)}
                  <Chip>max {skill.maxLevel}</Chip>
                </div>
                <JsonBlock value={{ progress, runtime, levels: skill.levels }} maxHeight={220} />
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function MemoryList({ memories }: { memories: NpcMemoryRecord[] }) {
  const { t } = useTranslation();
  const [expandedMemoryKey, setExpandedMemoryKey] = useState<string | null>(null);

  if (memories.length === 0) return <Empty text="这个 NPC 还没有结构化记忆。" />;

  return (
    <div style={{ display: 'grid', gap: 7, maxHeight: 360, overflow: 'auto', paddingRight: 4 }}>
      {memories.map((memory) => {
        const expanded = expandedMemoryKey === memory.key;
        const kindLabel = tMemoryKind(t, memory.kind);
        const typeLabel = tMemoryType(t, memory.type);
        const displayLabel = tMemoryType(t, memory.label ?? memory.type);
        const metaSummary = formatMemoryMetaSummary(t, memory.meta);

        return (
          <article key={memory.key} style={{ ...subtlePanelStyle, padding: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
              <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayLabel}
              </strong>
              <span style={{ color: 'var(--px-muted)', whiteSpace: 'nowrap' }}>
                {t('npcData.memory.meta.gameMinute', { gameMinute: formatGameMinute(memory.lastSeenGameMinute) })}
              </span>
            </div>
            <div style={{ color: 'var(--px-muted)', fontSize: 10.5, marginTop: 3 }}>
              {t('npcData.memory.meta.location', {
                kind: kindLabel,
                type: typeLabel,
                x: Math.round(memory.x),
                y: Math.round(memory.y),
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
              {metaSummary.length > 0 ? (
                metaSummary.map((item) => <Chip key={item}>{item}</Chip>)
              ) : (
                <Chip>{t('npcData.memory.meta.noMeta')}</Chip>
              )}
              {memory.meta ? (
                <button
                  type="button"
                  onClick={() => setExpandedMemoryKey(expanded ? null : memory.key)}
                  style={{
                    border: '1px solid var(--px-border)',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--px-gold)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 10.5,
                    fontWeight: 900,
                    padding: '2px 7px',
                  }}
                >
                  {expanded ? t('npcData.memory.hideJson') : t('npcData.memory.showJson')}
                </button>
              ) : null}
            </div>
            {expanded && memory.meta ? <div style={{ marginTop: 7 }}><JsonBlock value={memory.meta} maxHeight={100} /></div> : null}
          </article>
        );
      })}
    </div>
  );
}

function ScheduleList({
  schedule,
  currentActivity,
}: {
  schedule: ReturnType<typeof getDefaultNpcSchedule>;
  currentActivity?: NpcDailyActivity | null;
}) {
  const { t } = useTranslation();
  if (schedule.length === 0) return <Empty text="这个 NPC 暂时没有固定日程。" />;

  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {schedule.map((slot) => {
        const active = currentActivity === slot.activity;
        return (
          <div
            key={`${slot.startMin}-${slot.activity}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '76px 104px minmax(0, 1fr)',
              gap: 8,
              alignItems: 'center',
              padding: '7px 9px',
              border: active ? '1px solid var(--px-gold)' : '1px solid var(--px-border)',
              borderRadius: 4,
              background: active ? 'rgba(255,214,10,0.12)' : 'var(--px-surface2)',
              fontSize: 12,
            }}
          >
            <strong>{formatMinute(slot.startMin)}</strong>
            <span>{tNpcActivity(t, slot.activity)}</span>
            <span style={{ color: 'var(--px-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {slot.locationId ?? '-'}{slot.line ? ` · ${slot.line}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const NPCData: React.FC = () => {
  const { i18n, t } = useTranslation();
  const [selectedNpc, setSelectedNpc] = useState(DEFAULT_SELECTED_NPC_NAME);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const profile = useSelector((state: RootState) => state.profile.profile);
  const savedGameSave = profile?.gameSave ?? null;
  const worldState = savedGameSave
    ? Object.values(savedGameSave.worldStatus.worlds).reduce<any>((merged, partition) => ({
      ...merged,
      grid: merged.grid ?? partition.entities.worldState.grid,
      entities: { ...(merged.entities ?? {}), ...(partition.entities.worldState.entities ?? {}) },
      objects: { ...(merged.objects ?? {}), ...(partition.entities.worldState.objects ?? {}) },
      drops: { ...(merged.drops ?? {}), ...(partition.entities.worldState.drops ?? {}) },
      crops: { ...(merged.crops ?? {}), ...(partition.entities.worldState.crops ?? {}) },
      chickens: { ...(merged.chickens ?? {}), ...(partition.entities.worldState.chickens ?? {}) },
      trees: { ...(merged.trees ?? {}), ...(partition.entities.worldState.trees ?? {}) },
      nests: { ...(merged.nests ?? {}), ...(partition.entities.worldState.nests ?? {}) },
      npcMinds: { ...(merged.npcMinds ?? {}), ...(partition.entities.worldState.npcMinds ?? {}) },
      farmClaims: { ...(merged.farmClaims ?? {}), ...(partition.entities.worldState.farmClaims ?? {}) },
      meta: partition.entities.worldState.meta ?? merged.meta,
    }), {})
    : null;
  const npcInventories = useSelector((state: RootState) => state.game.npcInventories);
  const [fetchNpcMemories, npcMemoryResult] = useLazyGetNpcMemoriesQuery();
  const [fetchNpcSkill, npcSkillResult] = useLazyGetNpcSkillQuery();
  const { data: catalogData } = useGetGameCatalogsQuery();

  useEffect(() => {
    setRuntimeNpcCatalog(catalogData?.npcs ?? null);
    setRuntimeNpcSkillCatalog(catalogData?.npcSkills ?? null);
  }, [catalogData?.npcs, catalogData?.npcSkills]);

  const allNpcDefinitions = useMemo(
    () => catalogData?.npcs?.length ? catalogData.npcs : getGameNpcCatalog(),
    [catalogData?.npcs],
  );
  const unlockedNpcDefinitions = useMemo(
    () => getNpcDefinitionsForSave(savedGameSave, allNpcDefinitions),
    [allNpcDefinitions, savedGameSave],
  );
  const unlockedNpcNames = useMemo(() => unlockedNpcDefinitions.map((npc) => npc.name), [unlockedNpcDefinitions]);

  useEffect(() => {
    if (!unlockedNpcNames.includes(selectedNpc)) {
      setSelectedNpc(unlockedNpcNames[0] ?? DEFAULT_SELECTED_NPC_NAME);
    }
  }, [selectedNpc, unlockedNpcNames]);

  useEffect(() => {
    if (!unlockedNpcNames.includes(selectedNpc)) return;
    fetchNpcMemories(selectedNpc);
    fetchNpcSkill(selectedNpc);
  }, [fetchNpcMemories, fetchNpcSkill, selectedNpc, unlockedNpcNames]);

  const selectedDefinition = unlockedNpcDefinitions.find((npc) => npc.name === selectedNpc) ?? unlockedNpcDefinitions[0] ?? null;
  const selectedName = selectedDefinition?.name ?? selectedNpc;
  const savedNpc = savedGameSave?.worldStatus?.npcs?.[selectedName] ?? null;
  const inspectorWorldState = (worldState as WorldState | null) ?? null;
  const currentGameMinute = typeof inspectorWorldState?.meta?.absoluteGameMinutes === 'number'
    ? inspectorWorldState.meta.absoluteGameMinutes
    : typeof savedGameSave?.worldStatus?.time?.absoluteGameMinutes === 'number'
      ? savedGameSave.worldStatus.time.absoluteGameMinutes
      : 0;
  const npcMinds = worldState?.npcMinds ?? {};
  const rawMind: NpcMindState | null = npcMinds[selectedName] ?? savedNpc?.mind ?? null;
  const mind: NpcMindState | null = rawMind
    ? applyNpcMindCatalogDefaults(
      migrateNpcMindState(rawMind, selectedName, currentGameMinute, undefined, selectedDefinition?.mindDefaults),
      selectedName,
      selectedDefinition?.mindDefaults,
    )
    : null;
  const personalityTags = getPersonalityTags(mind);
  const recentMemories = sortMemories(mind?.recentMemories);
  const landmarks = sortMemories(mind?.knownLandmarks);
  const agentWorld = (mind?.meta?.agentWorld ?? null) as NpcSkillInspectorAgentWorld | null;
  const inventory = savedNpc?.inventory ?? npcInventories[selectedName] ?? {};
  const persistentMemories = npcMemoryResult.data?.memories ?? [];
  const personaSkill = npcSkillResult.data?.skill ?? null;
  const schedule = getDefaultNpcSchedule(selectedName);
  const currentLanguage = i18n.language.startsWith('zh') ? 'zh' : 'en';
  const allKnowledgeSkills = useMemo(
    () => getNpcKnowledgeSkills(currentLanguage),
    [currentLanguage, catalogData?.versions?.npcSkill],
  );
  const capabilitySkills = useMemo(
    () => getNpcCapabilitySkills(),
    [catalogData?.versions?.npcSkill, catalogData?.npcSkills],
  );
  const workSkillFilter = selectedDefinition ? roleWorkSkillAllowList[selectedDefinition.role] : null;
  const navigationSkills = allKnowledgeSkills.filter(isNavigationSkill);
  const candidateWorkSkills = allKnowledgeSkills
    .filter((skill) => !isNavigationSkill(skill))
    .filter((skill) => workSkillFilter?.(skill) ?? false);
  const workSkills = candidateWorkSkills.filter((skill) => canUseNpcKnowledgeSkill(mind, skill.id));
  const hasFarmSkillTree = candidateWorkSkills.some((skill) => skill.parentSkillId === FARM_PLOT_WORKER_SKILL_ID);
  const hasSurvivalSkillTree = candidateWorkSkills.some((skill) => skill.parentSkillId === SURVIVAL_FOOD_SKILL_ID);
  const farmWorkerKnown = hasLearnedFarmPlotWorker(mind);
  const survivalFoodKnown = hasLearnedSurvivalFood(mind);
  const assignedFarmPlots = getAssignedFarmPlots(mind);
  const activePlaceRaw = agentWorld?.currentPlace?.name ?? agentWorld?.currentPlace?.id ?? '未知';
  const activePlace = tNpcPlace(t, activePlaceRaw);
  const currentIntent = mind?.currentIntent?.kind ?? 'idle';
  const currentActivity = mind?.schedule?.currentActivity ?? null;
  const body = mind?.body ?? null;
  const memoryIndex = mind?.memoryIndex ?? null;
  const highSalienceMemories = (memoryIndex?.highSalienceKeys ?? [])
    .map((key) => memoryIndex?.episodic?.[key] ?? memoryIndex?.semantic?.[key] ?? null)
    .filter((record): record is NonNullable<typeof record> => Boolean(record));
  const learnedCapabilityCount = capabilitySkills.filter((skill) => {
    const progress = getSkillProgressEntry(mind, skill);
    return progress?.learned === true && progress.enabled !== false;
  }).length;

  if (!selectedDefinition) {
    return (
      <div
        style={{
          ...npcDataThemeVars,
          minHeight: '100%',
          padding: 16,
          color: 'var(--px-text)',
          fontFamily: '"Courier New", monospace',
          fontSize: 12,
          background:
            'radial-gradient(circle at 12% 8%, rgba(241,216,144,0.14), transparent 28%), linear-gradient(180deg, #101521, #070a12)',
        }}
      >
        <Section title={t('npcData.emptyTitle')}>
          <Empty text={t('npcData.emptyText')} />
        </Section>
      </div>
    );
  }

  return (
    <div
      style={{
        ...npcDataThemeVars,
        height: '100%',
        padding: 16,
        color: 'var(--px-text)',
        fontFamily: '"Courier New", monospace',
        fontSize: 12,
        background:
          'radial-gradient(circle at 12% 8%, rgba(241,216,144,0.14), transparent 28%), radial-gradient(circle at 88% 0%, rgba(108,140,255,0.12), transparent 30%), linear-gradient(180deg, #101521, #070a12)',
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr)',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px minmax(0, 1fr)',
          gap: 12,
          alignItems: 'start',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <aside style={{ ...panelStyle, padding: 10, maxHeight: '100%', overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <strong style={{ fontSize: 12 }}>已解锁 NPC</strong>
          </div>
          <div style={{ display: 'grid', gap: 7, marginTop: 9 }}>
            {unlockedNpcDefinitions.map((npc) => {
              const active = npc.name === selectedName;
              const npcMind = savedGameSave?.worldStatus?.npcs?.[npc.name]?.mind ?? npcMinds[npc.name] ?? null;
              return (
                <button
                  key={npc.id}
                  type="button"
                  onClick={() => setSelectedNpc(npc.name)}
                  style={{
                    display: 'grid',
                    gap: 3,
                    width: '100%',
                    padding: '8px 10px',
                    textAlign: 'left',
                    border: active ? '2px solid var(--px-gold)' : '1px solid var(--px-border)',
                    borderRadius: 4,
                    background: active ? 'rgba(255,214,10,0.13)' : 'var(--px-surface2)',
                    color: active ? 'var(--px-gold)' : 'var(--px-text)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <strong style={{ fontSize: 12.5 }}>{npc.name}</strong>
                  <span style={{ color: 'var(--px-muted)', fontSize: 10.5 }}>
                    {roleLabel[npc.role] ?? npc.title} · {tNpcActivity(t, npcMind?.schedule?.currentActivity)}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main style={{ display: 'grid', gap: 10, minWidth: 0, maxHeight: '100%', overflow: 'auto', paddingRight: 3 }}>
          <section style={{ ...panelStyle, padding: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.15 }}>{selectedName}</h2>
                  <Chip>{roleLabel[selectedDefinition.role] ?? selectedDefinition.title}</Chip>
                </div>
                <p style={{ margin: '7px 0 0', color: 'var(--px-muted)', lineHeight: 1.45, fontSize: 12 }}>
                  {selectedDefinition.description}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {personalityTags.map((tag) => <Chip key={tag} tone="good">{tag}</Chip>)}
                  {(roleWork[selectedDefinition.role] ?? []).map((item) => <Chip key={item}>{item}</Chip>)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 126px)', gap: 6 }}>
                <Metric label={t('npcData.metrics.intent')} value={tNpcIntent(t, currentIntent)} />
                <Metric label={t('npcData.metrics.activity')} value={tNpcActivity(t, currentActivity ?? 'free')} />
                <Metric label={t('npcData.metrics.place')} value={activePlace} />
                <Metric label={t('npcData.metrics.memory')} value={compactCount(memoryIndex?.episodic) + compactCount(memoryIndex?.semantic)} />
              </div>
            </div>
          </section>

          <nav
            style={{
              display: 'flex',
              gap: 6,
              padding: 4,
              border: '1px solid var(--px-border)',
              borderRadius: 6,
              background: 'var(--px-surface)',
              overflowX: 'auto',
            }}
          >
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    minWidth: 104,
                    padding: '7px 10px',
                    border: active ? '1px solid var(--px-gold)' : '1px solid transparent',
                    borderRadius: 4,
                    background: active ? 'rgba(255,214,10,0.12)' : 'transparent',
                    color: active ? 'var(--px-gold)' : 'var(--px-text)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                    {t(tab.labelKey)}
                </button>
              );
            })}
          </nav>

          {activeTab === 'overview' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Section title={t('npcData.sections.currentState')}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <Chip>{t('npcData.chips.lastPerceived', { gameMinute: formatGameMinute(mind?.lastPerceivedGameMinute) })}</Chip>
                    <Chip>{t('npcData.chips.lastThought', { gameMinute: formatGameMinute(mind?.lastThoughtGameMinute) })}</Chip>
                    <Chip>{t('npcData.chips.lastPlanned', { gameMinute: formatGameMinute(mind?.lastPlannedGameMinute) })}</Chip>
                    <Chip>{t('npcData.chips.paused', { gameMinute: formatGameMinute(mind?.pausedUntilGameMinute) })}</Chip>
                  </div>
                  <div style={{ ...subtlePanelStyle, padding: 9 }}>
                    <div style={{ color: 'var(--px-muted)', fontSize: 10.5, fontWeight: 900 }}>
                      {t('npcData.chips.currentIntent')}
                    </div>
                    <div style={{ marginTop: 4, fontWeight: 900, fontSize: 13 }}>{tNpcIntent(t, currentIntent)}</div>
                    <div style={{ marginTop: 4, color: 'var(--px-muted)', fontSize: 12 }}>
                      {tNpcIntentReason(t, typeof mind?.currentIntent?.reason === 'string' ? mind.currentIntent.reason : undefined)}
                    </div>
                  </div>
                  <div className="npc-state-meter-grid">
                    <StateMeter
                      label={t('npcData.metrics.energy')}
                      value={body?.energy ?? mind?.needs?.energy}
                    />
                    <StateMeter
                      label={t('npcData.metrics.hunger')}
                      value={body?.hunger ?? mind?.needs?.hunger}
                    />
                    <StateMeter
                      label={t('npcData.metrics.social')}
                      value={body?.socialNeed ?? mind?.needs?.social}
                    />
                  </div>
                </div>
              </Section>

              <Section title={t('npcData.sections.bodySignals')} action={<Chip>{t('npcData.chips.meterGuide')}</Chip>}>
                <div className="npc-state-meter-grid">
                  <StateMeter
                    label={t('npcData.metrics.fatigue')}
                    value={body?.fatigue}
                    higherBetter={false}
                  />
                  <StateMeter
                    label={t('npcData.metrics.stress')}
                    value={body?.stress}
                    higherBetter={false}
                  />
                  <StateMeter
                    label={t('npcData.metrics.fear')}
                    value={body?.fear}
                    higherBetter={false}
                  />
                  <StateMeter
                    label={t('npcData.metrics.sadness')}
                    value={body?.sadness}
                    higherBetter={false}
                  />
                  <StateMeter
                    label={t('npcData.metrics.alertness')}
                    value={body?.alertness}
                  />
                  <StateMeter
                    label={t('npcData.metrics.confusion')}
                    value={body?.confusion}
                    higherBetter={false}
                  />
                </div>
              </Section>

              <Section title={t('npcData.sections.worldAwareness')}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <Metric label={t('npcData.metrics.visibleObjects')} value={compactCount(agentWorld?.visibleObjects)} />
                    <Metric label={t('npcData.metrics.nearbyPlaces')} value={compactCount(agentWorld?.nearbyPlaces)} />
                    <Metric label={t('npcData.metrics.actions')} value={compactCount(agentWorld?.availableActions)} />
                    <Metric label={t('npcData.metrics.failures')} value={compactCount(agentWorld?.recentFailures)} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <Chip>{t('npcData.chips.place', { value: agentWorld?.currentPlace?.id ?? '-' })}</Chip>
                    <Chip>{t('npcData.chips.type', { value: agentWorld?.currentPlace?.type ?? '-' })}</Chip>
                    <Chip>{t('npcData.chips.source', { value: agentWorld?.currentPlace?.source ?? '-' })}</Chip>
                  </div>
                </div>
              </Section>

              <Section title={t('npcData.sections.blackboard')}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                  <Metric label={t('npcData.metrics.goals')} value={mind?.goals?.filter((goal) => goal.status === 'active').length ?? 0} />
                  <Metric label={t('npcData.metrics.directorLocks')} value={mind?.director?.locks?.length ?? 0} />
                  <Metric label={t('npcData.metrics.knownFacts')} value={compactCount(mind?.beliefs?.claims)} />
                  <Metric label={t('npcData.metrics.skills')} value={`${learnedCapabilityCount}/${capabilitySkills.length}`} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  <Chip tone={mind?.director?.enabled === false ? 'warn' : 'good'}>
                    {t('npcData.chips.director', { value: mind?.director?.enabled === false ? 'OFF' : 'ON' })}
                  </Chip>
                  <Chip>{t('npcData.metrics.episodic')}: {compactCount(memoryIndex?.episodic)}</Chip>
                  <Chip>{t('npcData.metrics.semantic')}: {compactCount(memoryIndex?.semantic)}</Chip>
                  <Chip>{t('npcData.chips.highSalience', { count: memoryIndex?.highSalienceKeys?.length ?? 0 })}</Chip>
                </div>
              </Section>

              <Section title={t('npcData.sections.inventory')}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.keys(inventory).length === 0 ? (
                    <Empty text={t('npcData.empty.inventory')} />
                  ) : (
                    Object.entries(inventory).map(([itemId, qty]) => (
                      <Chip key={itemId}>{itemId} x{qty}</Chip>
                    ))
                  )}
                </div>
              </Section>

              <Section title={t('npcData.sections.dailySchedule')}>
                <ScheduleList schedule={schedule} currentActivity={currentActivity} />
              </Section>

              <Section title={t('npcData.sections.heart')}>
                <div style={{ display: 'grid', gap: 8 }}>
                  {mind?.heart?.activeLonging ? (
                    <div style={{ ...subtlePanelStyle, padding: 9 }}>
                      <div style={{ color: 'var(--px-muted)', fontSize: 10.5, fontWeight: 900 }}>
                        {t('npcData.chips.activeLonging')}
                      </div>
                      <strong style={{ display: 'block', marginTop: 4 }}>{mind.heart.activeLonging.label}</strong>
                      <div style={{ marginTop: 5, color: 'var(--px-muted)' }}>
                        {t('npcData.chips.intensity', { value: formatCompactNumber(mind.heart.activeLonging.intensity, 2) })}
                      </div>
                    </div>
                  ) : (
                    <Empty text={t('npcData.empty.heart')} />
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <Chip>attachments: {compactCount(mind?.heart?.attachments)}</Chip>
                    <Chip>values: {compactCount(mind?.heart?.values)}</Chip>
                    <Chip>wounds: {compactCount(mind?.heart?.wounds)}</Chip>
                    <Chip>rituals: {compactCount(mind?.heart?.rituals)}</Chip>
                  </div>
                </div>
              </Section>
            </div>
          ) : null}

          {activeTab === 'memory' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Section title={t('npcData.sections.structuredMemories')} action={<Chip>{recentMemories.length}</Chip>}>
                <MemoryList memories={recentMemories} />
              </Section>
              <Section title={t('npcData.sections.memoryIndex')} action={<Chip>{compactCount(memoryIndex?.episodic) + compactCount(memoryIndex?.semantic)}</Chip>}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                    <Metric label={t('npcData.metrics.episodic')} value={compactCount(memoryIndex?.episodic)} />
                    <Metric label={t('npcData.metrics.semantic')} value={compactCount(memoryIndex?.semantic)} />
                    <Metric label={t('npcData.metrics.indexedTick')} value={formatGameMinute(memoryIndex?.lastIndexedGameMinute)} />
                  </div>
                  {highSalienceMemories.length === 0 ? (
                    <Empty text={t('npcData.empty.highSalience')} />
                  ) : (
                    <div style={{ display: 'grid', gap: 6, maxHeight: 260, overflow: 'auto', paddingRight: 4 }}>
                      {highSalienceMemories.map((memory) => (
                        <article key={memory.key} style={{ ...subtlePanelStyle, padding: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <strong style={{ color: 'var(--px-gold)' }}>{memory.label ?? tMemoryType(t, memory.type)}</strong>
                            <span style={{ color: 'var(--px-muted)' }}>{formatCompactNumber(memory.salience, 2)}</span>
                          </div>
                          <div style={{ marginTop: 4, color: 'var(--px-muted)', fontSize: 10.5 }}>
                            {tMemoryKind(t, memory.kind)} / {tMemoryType(t, memory.type)} / gameMinute {formatGameMinute(memory.lastSeenGameMinute)}
                          </div>
                          {memory.tags?.length ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                              {memory.tags.map((tag) => <Chip key={tag}>{tag}</Chip>)}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </Section>
              <Section title={t('npcData.sections.backendMemory')} action={<Chip>{persistentMemories.length}</Chip>}>
                {npcMemoryResult.isFetching ? (
                  <Empty text={t('npcData.empty.backendLoading')} />
                ) : persistentMemories.length === 0 ? (
                  <Empty text={t('npcData.empty.backendMemory')} />
                ) : (
                  <div style={{ display: 'grid', gap: 7, maxHeight: 360, overflow: 'auto', paddingRight: 4 }}>
                    {persistentMemories.slice().reverse().map((memory) => (
                      <article key={memory.id} style={{ ...subtlePanelStyle, padding: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                          <strong>{memory.source}</strong>
                          <span style={{ color: 'var(--px-muted)', whiteSpace: 'nowrap' }}>gameMinute {formatGameMinute(memory.absoluteGameMinutes)}</span>
                        </div>
                        <div style={{ marginTop: 5, lineHeight: 1.4, fontSize: 12 }}>{memory.text}</div>
                        <div style={{ color: 'var(--px-muted)', fontSize: 10.5, marginTop: 5 }}>
                          importance {memory.importance} / {memory.keywords?.join(', ') || 'no keywords'}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </Section>
              <Section title={t('npcData.sections.knownLandmarks')} action={<Chip>{landmarks.length}</Chip>}>
                {landmarks.length === 0 ? (
                  <Empty text={t('npcData.empty.landmarks')} />
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {landmarks.map((landmark) => (
                      <Chip key={landmark.key}>
                        {landmark.label ?? landmark.type} ({Math.round(landmark.x)}, {Math.round(landmark.y)})
                      </Chip>
                    ))}
                  </div>
                )}
              </Section>
              <Section title={t('npcData.sections.relationships')}>
                <JsonBlock value={mind?.relationships ?? {}} maxHeight={220} />
              </Section>
              <Section title={t('npcData.sections.beliefs')}>
                {compactCount(mind?.beliefs?.claims) === 0 ? (
                  <Empty text={t('npcData.empty.beliefs')} />
                ) : (
                  <div style={{ display: 'grid', gap: 7, maxHeight: 260, overflow: 'auto', paddingRight: 4 }}>
                    {Object.entries(mind?.beliefs?.claims ?? {}).map(([claimId, claim]) => (
                      <article key={claimId} style={{ ...subtlePanelStyle, padding: 8 }}>
                        <strong>{claim.text}</strong>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                          <Chip>confidence {formatCompactNumber(claim.confidence, 2)}</Chip>
                          <Chip>gameMinute {formatGameMinute(claim.updatedAtGameMinute)}</Chip>
                          {claim.tags?.map((tag) => <Chip key={tag}>{tag}</Chip>)}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          ) : null}

          {activeTab === 'persona' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.78fr) minmax(0, 1.22fr)', gap: 10 }}>
              <Section title={t('npcData.sections.personality')}>
                {mind?.personality ? (
                  <div className="npc-personality-grid">
                    {(Object.entries(mind.personality) as Array<[keyof NpcPersonalityState, number]>).map(([key, value]) => (
                      <PersonalityBar key={key} label={personalityLabel[key] ?? prettifyIdentifier(key)} value={value} />
                    ))}
                  </div>
                ) : (
                  <Empty text={t('npcData.empty.personality')} />
                )}
              </Section>
              <Section
                title={t('npcData.sections.persona')}
                action={personaSkill ? <Chip>{personaSkill.metadata.version ?? 'v1'}</Chip> : undefined}
              >
                {npcSkillResult.isFetching ? (
                  <Empty text={t('npcData.empty.personaLoading')} />
                ) : !personaSkill ? (
                  <Empty text={t('npcData.empty.personaMissing')} />
                ) : (
                  <div style={{ display: 'grid', gap: 9 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <Chip>name: {personaSkill.metadata.name ?? personaSkill.npcName}</Chip>
                      <Chip>role: {personaSkill.metadata.role ?? selectedDefinition.role}</Chip>
                      <Chip>entry: {personaSkill.filename}</Chip>
                    </div>
                    <SkillFiles skill={personaSkill} />
                  </div>
                )}
              </Section>
            </div>
          ) : null}

          {activeTab === 'work' ? (
            <>
              <Section title={t('npcData.sections.capabilityProgress')} action={<Chip>{learnedCapabilityCount}/{capabilitySkills.length}</Chip>}>
                <CapabilitySkillList skills={capabilitySkills} mind={mind} />
              </Section>
              <SkillInspectorHost
                npcName={selectedName}
                mind={mind}
                worldState={inspectorWorldState}
                inventory={inventory}
                agentWorld={agentWorld}
                currentGameMinute={currentGameMinute}
              />
              <Section title={t('npcData.sections.workSkillTree')} action={<Chip>{workSkills.length}/{candidateWorkSkills.length}</Chip>}>
                {hasFarmSkillTree ? (
                  <div style={{ ...subtlePanelStyle, padding: 10, marginBottom: 10, opacity: farmWorkerKnown ? 1 : 0.48 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
                      <div>
                        <strong style={{ color: 'var(--px-gold)', fontSize: 14 }}>管理农田</strong>
                        <div style={{ marginTop: 5, color: 'var(--px-muted)', lineHeight: 1.45 }}>
                          日常管理已分配农田；下级动作继承这个父技能的解锁状态。
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
                        <Chip>{FARM_PLOT_WORKER_SKILL_ID}</Chip>
                        <Chip tone={farmWorkerKnown ? 'good' : 'warn'}>{farmWorkerKnown ? '已学会' : '未学会'}</Chip>
                        <Chip>plots: {assignedFarmPlots.length}</Chip>
                      </div>
                    </div>
                  </div>
                ) : null}
                {hasSurvivalSkillTree ? (
                  <div style={{ ...subtlePanelStyle, padding: 10, marginBottom: 10, opacity: survivalFoodKnown ? 1 : 0.48 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
                      <div>
                        <strong style={{ color: 'var(--px-gold)', fontSize: 14 }}>自己找吃的</strong>
                        <div style={{ marginTop: 5, color: 'var(--px-muted)', lineHeight: 1.45 }}>
                          记住果树和食物来源；饥饿时能自己导航过去采摘。
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
                        <Chip>{SURVIVAL_FOOD_SKILL_ID}</Chip>
                        <Chip tone={survivalFoodKnown ? 'good' : 'warn'}>{survivalFoodKnown ? '已学会' : '未学会'}</Chip>
                      </div>
                    </div>
                  </div>
                ) : null}
                <KnowledgeSkillList
                  skills={candidateWorkSkills}
                  emptyText={t('npcData.empty.workSkills')}
                  cardMode
                  mind={mind}
                  disableLocked
                />
              </Section>
            </>
          ) : null}

          {activeTab === 'navigation' ? (
            <Section title={t('npcData.sections.navigation')} action={<Chip>{navigationSkills.length}</Chip>}>
              <KnowledgeSkillList
                skills={navigationSkills}
                emptyText={t('npcData.empty.navigation')}
                mind={mind}
              />
            </Section>
          ) : null}

          {activeTab === 'debug' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Section title={t('npcData.sections.savedNpc')}>
                <JsonBlock value={savedNpc} maxHeight={360} />
              </Section>
              <Section title={t('npcData.sections.mind')}>
                <JsonBlock value={mind} maxHeight={360} />
              </Section>
              <Section title={t('npcData.sections.skillProgressRaw')}>
                <JsonBlock value={mind?.skillProgress ?? null} maxHeight={360} />
              </Section>
              <Section title={t('npcData.sections.directorRaw')}>
                <JsonBlock value={mind?.director ?? null} maxHeight={360} />
              </Section>
              <Section title={t('npcData.sections.agentWorld')}>
                <JsonBlock value={agentWorld} maxHeight={360} />
              </Section>
              <Section title={t('npcData.sections.inventoryRaw')}>
                <JsonBlock value={inventory} maxHeight={360} />
              </Section>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
};

export default NPCData;
