import { useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import { useSelector } from 'react-redux';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  FaBolt,
  FaCheck,
  FaLock,
  FaPlus,
  FaRegStar,
  FaSitemap,
  FaUser,
} from 'react-icons/fa';
import '@xyflow/react/dist/style.css';

import type { RootState } from '../../../../../Redux/store';
import type { Profile } from '../../../../../Types/Profile';
import {
  ATTRIBUTE_DEFINITIONS,
  ATTRIBUTE_LABEL_BY_KEY,
  ATTRIBUTE_KEYS,
  MAX_ATTRIBUTE_LEVEL,
  type AttributeKey,
  type AttributeValue,
} from '../../../../../shared/core/protagonistAttributeProgression';
import {
  getSkillNodeUnlockState,
  getSkillTreeBranch,
  type SkillNodeUnlockState,
  type SkillTreeNodeDefinition,
} from '@timeplan-game/core/protagonist/skillTree';
import {
  useGetProfileStateQuery,
  useUnlockProfileSkillMutation,
} from '../../../../../api/profileStateRtkApi';
import './PlayerProfilePanel.css';

type PlayerProfilePanelProps = {
  profile: Profile | null;
  playerName?: string;
  avatarUrl?: string;
};

type AttributeRow = {
  key: AttributeKey;
  label: string;
  value: AttributeValue;
};

type SkillNodeData = {
  definition: SkillTreeNodeDefinition;
  unlockState: SkillNodeUnlockState;
  flash: boolean;
};

type PixelRect = readonly [number, number, number, number, string?];

const ATTRIBUTE_PIXEL_ICONS: Record<AttributeKey, { accent: string; pixels: readonly PixelRect[] }> = {
  stamina: {
    accent: '#7dd3fc',
    pixels: [
      [5, 2, 4, 2], [5, 4, 3, 3], [4, 7, 4, 2], [4, 9, 8, 2], [6, 11, 7, 2], [10, 8, 2, 1, '#f8d36b'],
    ],
  },
  strength: {
    accent: '#fca5a5',
    pixels: [
      [8, 1, 2, 9], [7, 2, 4, 2], [6, 4, 2, 2], [10, 4, 2, 2], [6, 10, 6, 2], [7, 12, 4, 2], [4, 7, 3, 2, '#f8d36b'],
    ],
  },
  wisdom: {
    accent: '#93c5fd',
    pixels: [
      [3, 3, 5, 9], [9, 3, 4, 9], [4, 4, 3, 1, '#dffaff'], [4, 7, 3, 1, '#dffaff'], [10, 5, 2, 1, '#dffaff'], [8, 3, 1, 10, '#f8d36b'],
    ],
  },
  discipline: {
    accent: '#c4b5fd',
    pixels: [
      [4, 2, 8, 11], [5, 3, 6, 1, '#dffaff'], [5, 6, 2, 2, '#f8d36b'], [8, 6, 3, 1, '#dffaff'], [5, 10, 2, 2, '#f8d36b'], [8, 10, 3, 1, '#dffaff'],
    ],
  },
  charisma: {
    accent: '#f0abfc',
    pixels: [
      [7, 1, 2, 4], [5, 5, 6, 2], [1, 7, 4, 2], [11, 7, 4, 2], [5, 9, 6, 2], [7, 11, 2, 4], [7, 7, 2, 2, '#f8d36b'],
    ],
  },
  luck: {
    accent: '#86efac',
    pixels: [
      [5, 3, 3, 3], [9, 3, 3, 3], [5, 7, 3, 3], [9, 7, 3, 3], [7, 6, 3, 3, '#f8d36b'], [8, 10, 2, 4],
    ],
  },
};

export function AttributePixelIcon({ attributeKey, className = '' }: { attributeKey: AttributeKey; className?: string }) {
  const icon = ATTRIBUTE_PIXEL_ICONS[attributeKey];
  const classNames = ['player-attribute-pixel-icon', className].filter(Boolean).join(' ');
  return (
    <svg className={classNames} viewBox="0 0 16 16" role="img" aria-hidden="true">
      {icon.pixels.map(([x, y, width, height, color], index) => (
        <rect
          key={`${attributeKey}-${index}`}
          x={x}
          y={y}
          width={width}
          height={height}
          fill={color || icon.accent}
          shapeRendering="crispEdges"
        />
      ))}
    </svg>
  );
}

function formatNumber(value: number) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString();
}

function getUserName(profile: Profile | null, playerName?: string) {
  return playerName || profile?.user?.username || '玩家';
}

function getAvatarUrl(profile: Profile | null, avatarUrl?: string) {
  return avatarUrl || profile?.user?.image_url || '';
}

function getUnlockReasonText(state: SkillNodeUnlockState, attributeLabel: string) {
  if (state.reasonCodes.includes('attribute_level')) return `${attributeLabel}等级不足`;
  if (state.reasonCodes.includes('prerequisites')) return '缺少前置技能';
  if (state.reasonCodes.includes('skill_points')) return '技能点不足';
  if (state.reasonCodes.includes('missing_node')) return '技能不存在';
  return '条件不足';
}

function getSkillEffectLabel(effect: SkillTreeNodeDefinition['effects'][number]) {
  if (effect.type === 'player_movement_speed_add') {
    const value = Math.round(Number(effect.value || 0));
    return value >= 0 ? `移动速度 +${value}` : `移动速度 ${value}`;
  }
  if (effect.type === 'player_movement_speed_multiplier') {
    const value = Number(effect.value || effect.multiplier || 1);
    return `移动速度 x${Number.isFinite(value) ? value.toFixed(2) : '1.00'}`;
  }
  return String(effect.type || 'metadata');
}

function SkillTreeNode({ data, selected }: NodeProps) {
  const nodeData = data as SkillNodeData;
  const { definition, unlockState, flash } = nodeData;
  const status = unlockState.status;
  const statusLabel = status === 'unlocked'
    ? '已解锁'
    : status === 'available'
      ? `${definition.cost} 点`
      : '未解锁';

  return (
    <div className={`profile-skill-node is-${status} ${selected ? 'is-selected' : ''} ${flash ? 'is-flashing' : ''}`}>
      <Handle type="target" position={Position.Top} className="profile-skill-node__handle" />
      <div className="profile-skill-node__shape">
        {status === 'unlocked' ? <FaCheck /> : status === 'available' ? <FaBolt /> : <FaLock />}
      </div>
      <strong>{definition.title}</strong>
      <span>{statusLabel}</span>
      <Handle type="source" position={Position.Bottom} className="profile-skill-node__handle" />
    </div>
  );
}

const skillNodeTypes = { skillNode: SkillTreeNode };

function AttributeRadarPanel({ rows }: { rows: AttributeRow[] }) {
  const radarData = rows.map((row) => ({
    key: row.key,
    label: row.label,
    level: row.value.level,
  }));

  return (
    <section className="player-profile-radar" aria-label="六维能力雷达图">
      <div className="player-profile-section-title">
        <span>ABILITY HEX</span>
        <strong>六维能力</strong>
      </div>
      <div className="player-profile-radar__chart">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="72%">
            <PolarGrid stroke="rgba(125, 211, 252, 0.24)" radialLines />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fill: 'rgba(226, 232, 240, 0.82)', fontSize: 12, fontWeight: 800 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, MAX_ATTRIBUTE_LEVEL]}
              tick={false}
              axisLine={false}
            />
            <Radar
              dataKey="level"
              stroke="#67e8f9"
              fill="#22d3ee"
              fillOpacity={0.24}
              strokeWidth={2}
              dot={{ r: 3, fill: '#f8d36b', strokeWidth: 0 }}
            />
            <Tooltip
              contentStyle={{
                border: '1px solid rgba(125, 211, 252, 0.32)',
                background: 'rgba(3, 7, 18, 0.92)',
                color: '#e5f6ff',
              }}
              formatter={(value) => [`Lv.${value}`, '等级']}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function AttributeDetailCard({
  row,
  onOpenSkillTree,
}: {
  row: AttributeRow;
  onOpenSkillTree: (attributeKey: AttributeKey) => void;
}) {
  const progress = Math.max(0, Math.min(1, Number(row.value.progressToNextLevel || 0)));
  const skillPoints = Math.max(0, Number(row.value.skillPoints || 0));

  return (
    <article className={`player-attribute-detail ${skillPoints > 0 ? 'has-skill-points' : ''}`}>
      <div className="player-attribute-detail__icon">
        <AttributePixelIcon attributeKey={row.key} />
      </div>
      <div className="player-attribute-detail__main">
        <div className="player-attribute-detail__topline">
          <strong>{row.label}</strong>
          <span>Lv.{row.value.level}</span>
        </div>
        <div className="player-attribute-detail__exp">
          <span>{formatNumber(row.value.exp)} / {formatNumber(row.value.nextLevelExp)}</span>
          <em>{formatNumber(row.value.expToNextLevel)} 到下级</em>
        </div>
        <div className="player-attribute-detail__bar" aria-hidden="true">
          <i style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <button
        type="button"
        className="player-attribute-detail__points"
        onClick={() => onOpenSkillTree(row.key)}
      >
        <FaPlus />
        <span>{skillPoints}</span>
      </button>
    </article>
  );
}

function AttributeOverview({
  rows,
  onOpenSkillTree,
}: {
  rows: AttributeRow[];
  onOpenSkillTree: (attributeKey: AttributeKey) => void;
}) {
  const [selectedAttribute, setSelectedAttribute] = useState<AttributeKey>(rows[0]?.key || ATTRIBUTE_KEYS[0]);
  const selectedRow = rows.find((row) => row.key === selectedAttribute) || rows[0];

  return (
    <div className="player-profile-overview">
      <AttributeRadarPanel rows={rows} />
      <section className="player-profile-attributes" aria-label="属性成长详情">
        <div className="player-profile-section-title">
          <span>ATTRIBUTES</span>
          <strong>成长进度</strong>
        </div>
        {selectedRow && (
          <AttributeDetailCard row={selectedRow} onOpenSkillTree={onOpenSkillTree} />
        )}
        <div className="player-profile-attribute-index" aria-label="选择属性">
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              className={`${row.key === selectedRow?.key ? 'is-active' : ''} ${Number(row.value.skillPoints || 0) > 0 ? 'has-points' : ''}`}
              onClick={() => setSelectedAttribute(row.key)}
            >
              <AttributePixelIcon attributeKey={row.key} />
              <strong>{row.label}</strong>
              <span>Lv.{row.value.level}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function buildSkillFlow(
  nodes: SkillTreeNodeDefinition[],
  attributes: Record<AttributeKey, AttributeValue>,
  skillTree: RootState['profileState']['skillTree'],
  selectedSkillId: string | null,
  flashSkillId: string | null,
) {
  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const flowNodes: Array<Node<SkillNodeData, 'skillNode'>> = nodes.map((node, index) => {
    const fallbackPosition = {
      x: (index % 3) * 190,
      y: Math.floor(index / 3) * 150,
    };
    return {
      id: node.id,
      type: 'skillNode',
      position: node.position || fallbackPosition,
      data: {
        definition: node,
        unlockState: getSkillNodeUnlockState(node, { attributes, skillTree }),
        flash: flashSkillId === node.id,
      },
      selected: selectedSkillId === node.id,
      draggable: false,
    };
  });

  const flowEdges: Edge[] = nodes.flatMap((node) => node.prerequisites
    .filter((prerequisiteId) => nodeIdSet.has(prerequisiteId))
    .map((prerequisiteId) => {
      const sourceState = getSkillNodeUnlockState(prerequisiteId, { attributes, skillTree });
      const targetState = getSkillNodeUnlockState(node, { attributes, skillTree });
      const active = sourceState.status === 'unlocked' && targetState.status !== 'locked';
      return {
        id: `${prerequisiteId}->${node.id}`,
        source: prerequisiteId,
        target: node.id,
        type: 'smoothstep',
        animated: active,
        className: active ? 'is-unlocked' : 'is-locked',
      };
    }));

  return { flowNodes, flowEdges };
}

function AttributeSkillTreePanel({
  rows,
  selectedAttribute,
  onSelectAttribute,
}: {
  rows: AttributeRow[];
  selectedAttribute: AttributeKey;
  onSelectAttribute: (attributeKey: AttributeKey) => void;
}) {
  const attributes = useSelector((state: RootState) => state.profileState.attributes);
  const skillTree = useSelector((state: RootState) => state.profileState.skillTree);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [flashSkillId, setFlashSkillId] = useState<string | null>(null);
  const [unlockProfileSkill, { isLoading: unlocking }] = useUnlockProfileSkillMutation();
  const branch = useMemo(() => getSkillTreeBranch(selectedAttribute), [selectedAttribute]);
  const branchNodes = branch?.nodes || [];
  const selectedRow = rows.find((row) => row.key === selectedAttribute) || rows[0];
  const selectedSkill = branchNodes.find((node) => node.id === selectedSkillId) || branchNodes[0] || null;
  const selectedState = selectedSkill
    ? getSkillNodeUnlockState(selectedSkill, { attributes, skillTree })
    : null;
  const { flowNodes, flowEdges } = useMemo(
    () => buildSkillFlow(branchNodes, attributes, skillTree, selectedSkill?.id || null, flashSkillId),
    [attributes, branchNodes, flashSkillId, selectedSkill?.id, skillTree],
  );
  const flowRenderKey = useMemo(
    () => branchNodes
      .map((node) => `${node.id}:${getSkillNodeUnlockState(node, { attributes, skillTree }).status}`)
      .join('|') || selectedAttribute,
    [attributes, branchNodes, selectedAttribute, skillTree],
  );

  useEffect(() => {
    setSelectedSkillId((current) => {
      if (current && branchNodes.some((node) => node.id === current)) return current;
      return branchNodes[0]?.id || null;
    });
  }, [branchNodes]);

  const handleUnlock = async () => {
    if (!selectedSkill || !selectedState || selectedState.status !== 'available') return;
    try {
      await unlockProfileSkill({
        attributeKey: selectedSkill.attributeKey,
        skillId: selectedSkill.id,
      }).unwrap();
      setFlashSkillId(selectedSkill.id);
      window.setTimeout(() => setFlashSkillId(null), 900);
      message.success('技能已解锁');
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err.data?.message || '解锁失败');
    }
  };

  return (
    <div className="player-skill-tree">
      <aside className="player-skill-tree__branches" aria-label="技能分支">
        {rows.map((row) => {
          const active = row.key === selectedAttribute;
          const skillPoints = Math.max(0, Number(row.value.skillPoints || 0));
          return (
            <button
              key={row.key}
              type="button"
              className={active ? 'is-active' : ''}
              onClick={() => onSelectAttribute(row.key)}
            >
              <span><AttributePixelIcon attributeKey={row.key} /></span>
              <strong>{row.label}</strong>
              <em>+{skillPoints}</em>
            </button>
          );
        })}
      </aside>

      <section className="player-skill-tree__canvas" aria-label={`${selectedRow.label}技能树`}>
        <div className="player-skill-tree__canvas-header">
          <div>
            <span>{selectedRow.label}分支</span>
            <strong>技能树</strong>
          </div>
          <em>{branchNodes.length} 技能</em>
        </div>
        {branchNodes.length === 0 ? (
          <div className="player-skill-tree__empty">
            <FaSitemap />
            <strong>这个分支还没有发现技能</strong>
            <span>未来的游戏能力会注册到这里</span>
          </div>
        ) : (
          <ReactFlow
            key={flowRenderKey}
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={skillNodeTypes}
            nodesDraggable={false}
            fitView
            fitViewOptions={{ padding: 0.24 }}
            onNodeClick={(_, node) => setSelectedSkillId(node.id)}
          >
            <Background gap={24} color="rgba(125, 211, 252, 0.18)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </section>

      <aside className="player-skill-tree__detail" aria-label="技能详情">
        {selectedSkill && selectedState ? (
          <>
            <div className={`player-skill-tree__detail-mark is-${selectedState.status}`}>
              {selectedState.status === 'unlocked' ? <FaCheck /> : selectedState.status === 'available' ? <FaBolt /> : <FaLock />}
            </div>
            <span>{ATTRIBUTE_LABEL_BY_KEY[selectedSkill.attributeKey]}</span>
            <h3>{selectedSkill.title}</h3>
            <p>{selectedSkill.description || '这个技能还没有详细描述。'}</p>
            <div className="player-skill-tree__requirements">
              <em>消耗 {selectedSkill.cost} 技能点</em>
              <em>需要 Lv.{selectedSkill.requiredAttributeLevel}</em>
              <em>前置 {selectedSkill.prerequisites.length}</em>
            </div>
            {selectedSkill.effects.length > 0 && (
              <div className="player-skill-tree__effects">
                <strong>效果</strong>
                {selectedSkill.effects.map((effect, index) => (
                  <code key={`${selectedSkill.id}-effect-${index}`}>{getSkillEffectLabel(effect)}</code>
                ))}
              </div>
            )}
            {selectedState.status === 'unlocked' ? (
              <button type="button" disabled className="is-unlocked">
                已解锁
              </button>
            ) : (
              <button
                type="button"
                disabled={selectedState.status !== 'available' || unlocking}
                onClick={handleUnlock}
              >
                {selectedState.status === 'available'
                  ? `消耗 ${selectedSkill.cost} 技能点解锁`
                  : getUnlockReasonText(selectedState, ATTRIBUTE_LABEL_BY_KEY[selectedSkill.attributeKey])}
              </button>
            )}
          </>
        ) : (
          <div className="player-skill-tree__detail-empty">
            <FaRegStar />
            <strong>选择一个技能</strong>
            <span>有技能注册后，详情会显示在这里。</span>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function PlayerProfilePanel({ profile, playerName, avatarUrl: fallbackAvatarUrl }: PlayerProfilePanelProps) {
  const attributes = useSelector((state: RootState) => state.profileState.attributes);
  const rows = useMemo<AttributeRow[]>(() => ATTRIBUTE_DEFINITIONS.map((definition) => ({
    key: definition.key,
    label: definition.label,
    value: attributes[definition.key],
  })), [attributes]);
  const [mode, setMode] = useState<'overview' | 'skills'>('overview');
  const [selectedAttribute, setSelectedAttribute] = useState<AttributeKey>(ATTRIBUTE_KEYS[0]);
  const avatarUrl = getAvatarUrl(profile, fallbackAvatarUrl);
  const userName = getUserName(profile, playerName);

  useGetProfileStateQuery(undefined, { refetchOnMountOrArgChange: true });

  const openSkillTree = (attributeKey?: AttributeKey) => {
    const target = attributeKey || rows.find((row) => Number(row.value.skillPoints || 0) > 0)?.key || selectedAttribute;
    setSelectedAttribute(target);
    setMode('skills');
  };

  return (
    <div className="player-profile-panel">
      <header className="player-profile-panel__hero">
        <div className="player-profile-panel__avatar">
          {avatarUrl ? <img src={avatarUrl} alt={userName} /> : <FaUser />}
        </div>
        <div className="player-profile-panel__identity">
          <span>玩家档案</span>
          <h3>{userName}</h3>
          <p>能力、等级与技能成长</p>
        </div>
      </header>

      <nav className="player-profile-panel__tabs" aria-label="个人面板">
        <button type="button" className={mode === 'overview' ? 'is-active' : ''} onClick={() => setMode('overview')}>
          能力概览
        </button>
        <button type="button" className={mode === 'skills' ? 'is-active' : ''} onClick={() => openSkillTree(selectedAttribute)}>
          技能树
        </button>
      </nav>

      <main className="player-profile-panel__body">
        {mode === 'overview' ? (
          <AttributeOverview rows={rows} onOpenSkillTree={openSkillTree} />
        ) : (
          <AttributeSkillTreePanel
            rows={rows}
            selectedAttribute={selectedAttribute}
            onSelectAttribute={setSelectedAttribute}
          />
        )}
      </main>
    </div>
  );
}
