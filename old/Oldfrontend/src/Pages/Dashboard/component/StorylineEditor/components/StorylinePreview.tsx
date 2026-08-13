import React, { useMemo } from 'react';
import {
  Alert,
  Button,
  Collapse,
  Divider,
  Empty,
  Progress,
  Space,
  Statistic,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import {
  AuditOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  CommentOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { StorylineDefinition, StorylineDraft, StorylineMentionContext, StorylineReview, StorylineStep, StorylineTrigger } from '../types';

const { Text } = Typography;

interface StorylinePreviewProps {
  draft: StorylineDraft | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
  reviewing: boolean;
  publishing: boolean;
  onReview: (definition: StorylineDefinition | null) => void;
  onPublish: (definition: StorylineDefinition | null) => void;
  onAskWithContext: (mention: StorylineMentionContext) => void;
}

export const StorylinePreview: React.FC<StorylinePreviewProps> = ({
  draft,
  activeTab,
  onTabChange,
  reviewing,
  publishing,
  onReview,
  onPublish,
  onAskWithContext,
}) => {
  const currentRevision = useMemo(() => getCurrentRevision(draft), [draft]);
  const definition = currentRevision?.definition ?? null;
  const review = currentRevision?.review ?? null;

  const tabItems = definition
    ? [
        {
          key: 'outline',
          label: '总览',
          children: <OutlineView definition={definition} onAskWithContext={onAskWithContext} />,
        },
        {
          key: 'review',
          label: '审查',
          children: (
            <ReviewView
              review={review}
              reviewing={reviewing}
              publishing={publishing}
              onReview={() => onReview(definition)}
              onPublish={() => onPublish(definition)}
            />
          ),
        },
      ]
    : [];

  return (
    <aside
      data-testid="storyline-preview"
      style={{
        height: '100%',
        minWidth: 0,
        borderLeft: '1px solid var(--px-border)',
        background: 'var(--px-surface)',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        ...selectableTextStyle,
      }}
    >
      <header style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--px-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--px-gold)', fontWeight: 900, fontSize: 18 }}>结构化预览</div>
            <div style={{ color: 'var(--px-muted)', fontSize: 12, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {definition ? `${definition.id} · v${definition.version}` : '还没有生成剧情 JSON'}
            </div>
          </div>
          {review && (
            <Tag color={review.verdict === 'ready' ? 'success' : review.verdict === 'blocked' ? 'error' : 'warning'}>
              {review.score} 分
            </Tag>
          )}
        </div>
      </header>

      <div style={{ overflow: 'auto', padding: '12px 14px 18px', ...selectableTextStyle }}>
        {!definition ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="点击中间的“更新”，先生成第一版剧情"
          />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {currentRevision?.source === 'chat_edit' && (
              <Alert
                data-testid="storyline-chat-edit-applied"
                type="success"
                showIcon
                message="已应用聊天修改"
                description={`当前预览来自 ${currentRevision.source} revision，版本 v${definition.version}。`}
              />
            )}
            <Tabs
              size="small"
              items={tabItems}
              activeKey={activeTab}
              onChange={onTabChange}
              tabBarStyle={{ marginBottom: 12 }}
            />
          </div>
        )}
      </div>
    </aside>
  );
};

const OutlineView: React.FC<{
  definition: StorylineDefinition;
  onAskWithContext: (mention: StorylineMentionContext) => void;
}> = ({ definition, onAskWithContext }) => {
  const summary = getDefinitionSummary(definition);
  const consequences = collectConsequences(definition);

  return (
    <div style={{ display: 'grid', gap: 14, ...selectableTextStyle }}>
      <SummaryBand definition={definition} summary={summary} />

      <DashboardSection
        title="状态流"
        icon={<BranchesOutlined />}
        onAsk={() => onAskWithContext({
          id: `${definition.id}_state`,
          label: '状态流',
          context: buildStateContext(definition),
        })}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {definition.states.map((state, index) => (
            <React.Fragment key={state}>
              <Tag color={state === definition.startState ? 'gold' : 'default'} style={{ marginInlineEnd: 0 }}>
                {state}
              </Tag>
              {index < definition.states.length - 1 && <span style={{ color: 'var(--px-muted)' }}>→</span>}
            </React.Fragment>
          ))}
        </div>
      </DashboardSection>

      <DashboardSection
        title="触发器"
        icon={<ThunderboltOutlined />}
        onAsk={() => onAskWithContext({
          id: `${definition.id}_triggers`,
          label: '触发器',
          context: buildTriggerContext(definition),
        })}
      >
        <Collapse
          key={`triggers_${definition.id}_${definition.version}_${definition.updatedAt}`}
          size="small"
          bordered={false}
          defaultActiveKey={definition.triggers.map((trigger) => trigger.id)}
          items={definition.triggers.map((trigger) => ({
            key: trigger.id,
            label: <TriggerLabel trigger={trigger} />,
            children: <TriggerBlock trigger={trigger} />,
          }))}
        />
      </DashboardSection>

      <DashboardSection
        title="演出流程"
        icon={<CodeOutlined />}
        onAsk={() => onAskWithContext({
          id: `${definition.id}_events`,
          label: '演出流程',
          context: buildEventContext(definition),
        })}
      >
        <Collapse
          key={`events_${definition.id}_${definition.version}_${definition.updatedAt}`}
          size="small"
          bordered={false}
          defaultActiveKey={Object.keys(definition.events)}
          items={Object.entries(definition.events).map(([eventName, steps]) => ({
            key: eventName,
            label: <EventLabel name={eventName} steps={steps} />,
            children: <TimelineSteps steps={steps} />,
          }))}
        />
      </DashboardSection>

      <DashboardSection title="后果" icon={<CheckCircleOutlined />}>
        <ConsequenceView consequences={consequences} />
      </DashboardSection>
    </div>
  );
};

const SummaryBand: React.FC<{ definition: StorylineDefinition; summary: ReturnType<typeof getDefinitionSummary> }> = ({
  definition,
  summary,
}) => (
  <section style={sectionStyle}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--px-text)', fontWeight: 900, fontSize: 16 }}>{definition.title}</div>
        <div style={{ color: 'var(--px-muted)', fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{definition.summary}</div>
        <Space size={[6, 6]} wrap style={{ marginTop: 10 }}>
          {definition.tags.map((tag) => (
            <Tag key={tag} color="gold">{tag}</Tag>
          ))}
        </Space>
      </div>
      <Tag color={definition.status === 'enabled' ? 'success' : 'processing'}>{definition.status}</Tag>
    </div>

    <Divider style={dividerStyle} />

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(70px, 1fr))', gap: 8 }}>
      <TinyStat label="Trigger" value={summary.triggerCount} />
      <TinyStat label="Event" value={summary.eventCount} />
      <TinyStat label="Step" value={summary.stepCount} />
      <TinyStat label="Memory" value={summary.memoryCount} />
    </div>
  </section>
);

const TinyStat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div style={{ border: '1px solid var(--px-border)', borderRadius: 6, padding: '8px 10px', background: 'rgba(255,255,255,0.02)' }}>
    <Statistic value={value} title={<span style={{ color: 'var(--px-muted)', fontSize: 11 }}>{label}</span>} valueStyle={{ color: 'var(--px-gold)', fontSize: 18, fontWeight: 900 }} />
  </div>
);

const TriggerLabel: React.FC<{ trigger: StorylineTrigger }> = ({ trigger }) => (
  <span style={{ color: 'var(--px-text)', fontWeight: 900 }}>
    {trigger.id}
    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
      {trigger.when?.length ?? 0} 条条件 · {trigger.then?.length ?? 0} 个结果
    </Text>
  </span>
);

const TriggerBlock: React.FC<{ trigger: StorylineTrigger }> = ({ trigger }) => (
  <div style={{ display: 'grid', gap: 12 }}>
    <StepGroup title="When" steps={trigger.when ?? []} tone="condition" />
    <StepGroup title="Then" steps={trigger.then ?? []} tone="action" />
  </div>
);

const EventLabel: React.FC<{ name: string; steps: StorylineStep[] }> = ({ name, steps }) => (
  <span data-testid={`storyline-event-${name}`} style={{ color: 'var(--px-text)', fontWeight: 900 }}>
    {name}
    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{steps.length} steps</Text>
  </span>
);

const TimelineSteps: React.FC<{ steps: StorylineStep[] }> = ({ steps }) => (
  <Timeline
    style={{ marginTop: 8 }}
    items={steps.map((step, index) => ({
      color: getStepColor(step.skill),
      children: <StepRow step={step} index={index + 1} />,
    }))}
  />
);

const StepGroup: React.FC<{ title: string; steps: StorylineStep[]; tone: 'condition' | 'action' }> = ({ title, steps, tone }) => (
  <div>
    <div style={{ color: tone === 'condition' ? '#4f8cff' : 'var(--px-gold)', fontSize: 12, fontWeight: 900, marginBottom: 8 }}>
      {title}
    </div>
    <div style={{ display: 'grid', gap: 8 }}>
      {steps.length === 0 && <Text type="secondary">空</Text>}
      {steps.map((step, index) => <StepRow key={`${step.skill}_${index}`} step={step} index={index + 1} />)}
    </div>
  </div>
);

const StepRow: React.FC<{ step: StorylineStep; index: number }> = ({ step, index }) => (
  <div data-testid={`storyline-step-${step.skill}`} style={stepRowStyle}>
    <Tag color={getStepTagColor(step.skill)} style={{ marginInlineEnd: 0 }}>{index}</Tag>
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Tag color={getStepTagColor(step.skill)} style={{ marginInlineEnd: 0 }}>{step.skill}</Tag>
        <span style={{ color: 'var(--px-muted)', fontSize: 12 }}>{getStepLabel(step)}</span>
      </div>
      <ArgTags args={step.args} />
    </div>
  </div>
);

const ArgTags: React.FC<{ args: Record<string, unknown> }> = ({ args }) => {
  const entries = Object.entries(args || {});
  if (entries.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
      {entries.map(([key, value]) => (
        <Tag key={key} style={{ marginInlineEnd: 0, maxWidth: '100%', whiteSpace: 'normal' }}>
          <span style={{ color: 'var(--px-muted)' }}>{key}</span>: {formatArgValue(value)}
        </Tag>
      ))}
    </div>
  );
};

const ConsequenceView: React.FC<{ consequences: ReturnType<typeof collectConsequences> }> = ({ consequences }) => {
  const groups = [
    ['任务状态', consequences.quest],
    ['角色记忆', consequences.npcMemory],
    ['宠物/实体', consequences.pet],
    ['演出信号', consequences.presentation],
  ] as const;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {groups.map(([title, items]) => (
        <div key={title}>
          <div style={{ color: 'var(--px-gold)', fontWeight: 900, fontSize: 12, marginBottom: 7 }}>{title}</div>
          {items.length === 0 ? (
            <Text type="secondary">无</Text>
          ) : (
            <div style={{ display: 'grid', gap: 7 }}>
              {items.map((item, index) => (
                <div key={`${title}_${index}`} style={consequenceItemStyle}>
                  <Tag color={getStepTagColor(item.skill)} style={{ marginInlineEnd: 0 }}>{item.skill}</Tag>
                  <span style={{ color: 'var(--px-text)' }}>{getStepLabel(item)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const ReviewView: React.FC<{
  review: StorylineReview | null;
  reviewing: boolean;
  publishing: boolean;
  onReview: () => void;
  onPublish: () => void;
}> = ({ review, reviewing, publishing, onReview, onPublish }) => (
  <div style={{ display: 'grid', gap: 14 }}>
    <Space wrap>
      <Button icon={<AuditOutlined />} loading={reviewing} onClick={onReview}>
        重新审查
      </Button>
      <Button
        icon={<CloudUploadOutlined />}
        type="primary"
        size="large"
        loading={publishing}
        onClick={onPublish}
        style={{ minWidth: 132, fontWeight: 900 }}
      >
        发布 JSON
      </Button>
    </Space>

    {!review ? (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有审查结果" />
    ) : (
      <>
        <section style={sectionStyle}>
          <Progress
            type="dashboard"
            percent={review.score}
            size={118}
            status={review.verdict === 'blocked' ? 'exception' : review.verdict === 'ready' ? 'success' : 'normal'}
          />
          <Alert
            style={{ marginTop: 12 }}
            type={review.verdict === 'ready' ? 'success' : review.verdict === 'blocked' ? 'error' : 'warning'}
            message={review.verdict}
            description={`检查时间：${new Date(review.checkedAt).toLocaleString()}`}
            showIcon
          />
        </section>

        <DashboardSection title="审查发现" icon={<AuditOutlined />}>
          <ReviewList items={review.findings.map((finding) => `[${finding.severity}] ${finding.area}: ${finding.message}`)} empty="没有阻塞问题" />
        </DashboardSection>
        <DashboardSection title="优点" icon={<CheckCircleOutlined />}>
          <ReviewList items={review.strengths} empty="暂无" />
        </DashboardSection>
        <DashboardSection title="风险" icon={<BranchesOutlined />}>
          <ReviewList items={review.risks} empty="暂无" />
        </DashboardSection>
      </>
    )}
  </div>
);

const ReviewList: React.FC<{ items: string[]; empty: string }> = ({ items, empty }) => (
  <div style={{ display: 'grid', gap: 8 }}>
    {items.length === 0 && <Text type="secondary">{empty}</Text>}
    {items.map((item) => (
      <div key={item} style={reviewItemStyle}>{item}</div>
    ))}
  </div>
);

const DashboardSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onAsk?: () => void;
}> = ({ title, icon, children, onAsk }) => (
  <section style={sectionStyle}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--px-gold)', fontWeight: 900 }}>
        {icon}
        <span>{title}</span>
      </div>
      {onAsk && (
        <Button
          size="small"
          type="text"
          icon={<CommentOutlined />}
          onClick={onAsk}
          title="携带这个结构向聊天提问"
        >
          提问
        </Button>
      )}
    </div>
    <Divider style={dividerStyle} />
    {children}
  </section>
);

const selectableTextStyle: React.CSSProperties = {
  userSelect: 'text',
  WebkitUserSelect: 'text',
};

function getCurrentRevision(draft: StorylineDraft | null) {
  if (!draft?.revisions?.length) return null;
  return draft.revisions.find((revision) => revision.id === draft.currentRevisionId) ?? draft.revisions[draft.revisions.length - 1];
}

function getDefinitionSummary(definition: StorylineDefinition) {
  const eventSteps = Object.values(definition.events || {}).flat();
  const triggerSteps = definition.triggers.flatMap((trigger) => [...(trigger.when ?? []), ...(trigger.then ?? [])]);
  const allSteps = [...eventSteps, ...triggerSteps];
  return {
    triggerCount: definition.triggers.length,
    eventCount: Object.keys(definition.events || {}).length,
    stepCount: allSteps.length,
    memoryCount: allSteps.filter((step) => step.skill.includes('memory')).length,
  };
}

function collectConsequences(definition: StorylineDefinition) {
  const steps = [
    ...definition.triggers.flatMap((trigger) => trigger.then ?? []),
    ...Object.values(definition.events || {}).flat(),
  ];
  return {
    quest: steps.filter((step) => step.skill === 'action.set_quest_state'),
    npcMemory: steps.filter((step) => step.skill === 'action.add_npc_memory'),
    pet: steps.filter((step) => ['action.spawn_pet', 'action.set_pet_home', 'action.add_pet_memory'].includes(step.skill)),
    presentation: steps.filter((step) => (
      step.skill.startsWith('camera.')
      || step.skill.startsWith('vehicle.')
      || step.skill.startsWith('sequence.')
      || step.skill.startsWith('director.')
      || step.skill === 'action.ensure_npc_in_world'
    )),
  };
}

function buildStateContext(definition: StorylineDefinition) {
  return [
    '请结合这个剧情的状态流，帮我判断状态设计是否自然、是否容易重复触发，并给出改进建议：',
    '',
    `剧情：${definition.title} (${definition.id})`,
    `起始状态：${definition.startState}`,
    `状态流：${definition.states.join(' -> ')}`,
  ].join('\n');
}

function buildTriggerContext(definition: StorylineDefinition) {
  return [
    '请重点审查这些 trigger：触发条件是否自然、是否足够严格、是否会重复触发、是否缺少世界状态保护。',
    '',
    ...definition.triggers.map((trigger) => [
      `Trigger: ${trigger.id}`,
      `When: ${(trigger.when ?? []).map(formatStepForPrompt).join(' | ') || 'none'}`,
      `Then: ${(trigger.then ?? []).map(formatStepForPrompt).join(' | ') || 'none'}`,
    ].join('\n')),
  ].join('\n\n');
}

function buildEventContext(definition: StorylineDefinition) {
  return [
    '请重点审查这些演出流程：节奏是否自然、镜头/等待/记忆写入是否足够、agent 行为是否像活的。',
    '',
    ...Object.entries(definition.events || {}).map(([eventName, steps]) => [
      `Event: ${eventName}`,
      ...steps.map((step, index) => `${index + 1}. ${formatStepForPrompt(step)}`),
    ].join('\n')),
  ].join('\n\n');
}

function formatStepForPrompt(step: StorylineStep) {
  return `${step.skill} ${JSON.stringify(step.args || {})}`;
}

function getStepLabel(step: StorylineStep) {
  const args = step.args || {};
  if (step.skill === 'dialogue.approach_choice') return String(args.npcId ?? 'npc') + ' 走到玩家面前提问：' + String(args.prompt ?? '');
  if (step.skill === 'action.npc_say') return `${args.npcId ?? 'npc'} 说：“${args.text ?? ''}”`;
  if (step.skill === 'action.player_say') return `玩家说：“${args.text ?? ''}”`;
  if (step.skill === 'action.approach_player') return `${args.npcId ?? 'npc'} 走到主角面前`;
  if (step.skill === 'action.ensure_npc_in_world') return `${args.npcId ?? 'npc'} 确保在 ${args.worldId ?? 'world:village'}`;
  if (step.skill === 'sequence.wait_for_player_world') return `等待玩家进入 ${args.worldId ?? 'world:village'}`;
  if (step.skill === 'dialogue.choice') return `${args.npcId ?? 'npc'} 提问：${args.prompt ?? ''}`;
  if (step.skill === 'action.set_quest_state') return `${args.questId ?? 'quest'} → ${args.state ?? 'state'}`;
  if (step.skill === 'action.add_npc_memory') return `${args.npcId ?? 'npc'} 记住：${args.text ?? ''}`;
  if (step.skill === 'action.add_pet_memory') return `${args.petId ?? 'pet'} 记住：${args.text ?? ''}`;
  if (step.skill === 'action.spawn_pet') return `生成宠物 ${args.petId ?? ''}`;
  if (step.skill === 'action.set_pet_home') return `${args.petId ?? 'pet'} 的家绑定到 ${args.homeOfNpcId ?? ''}`;
  if (step.skill === 'camera.pan_to') return `镜头移动到 ${args.target ?? ''}`;
  if (step.skill === 'director.begin_event') return `导演开始 ${args.eventId ?? 'event'} / ${args.phase ?? 'running'}`;
  if (step.skill === 'director.set_phase') return `导演阶段 ${args.eventId ?? 'event'} -> ${args.phase ?? 'phase'}`;
  if (step.skill === 'director.end_event') return `导演结束 ${args.eventId ?? 'event'}`;
  if (step.skill === 'vehicle.drop_off_passengers') return `乘客下车：${formatArgValue(args.passengers ?? [])}`;
  if (step.skill === 'vehicle.pick_up_passengers') return `乘客上车离开：${formatArgValue(args.passengers ?? [])}`;
  if (step.skill.startsWith('vehicle.')) return `${args.vehicleId ?? 'vehicle'}`;
  if (step.skill.startsWith('condition.')) return formatCondition(args);
  return formatArgsInline(args);
}

function formatCondition(args: Record<string, unknown>) {
  return Object.entries(args).map(([key, value]) => `${key}=${formatArgValue(value)}`).join('，');
}

function formatArgsInline(args: Record<string, unknown>) {
  const text = Object.entries(args || {}).map(([key, value]) => `${key}=${formatArgValue(value)}`).join('，');
  return text || '无参数';
}

function formatArgValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function getStepTagColor(skill: string) {
  if (skill.startsWith('condition.')) return 'blue';
  if (skill.startsWith('dialogue.')) return 'volcano';
  if (skill.startsWith('sequence.')) return 'geekblue';
  if (skill.startsWith('camera.')) return 'purple';
  if (skill.startsWith('vehicle.')) return 'cyan';
  if (skill.startsWith('director.')) return 'lime';
  if (skill.includes('memory')) return 'green';
  if (skill.includes('pet')) return 'magenta';
  if (skill === 'action.set_quest_state') return 'gold';
  return 'default';
}

function getStepColor(skill: string) {
  if (skill.startsWith('condition.')) return 'blue';
  if (skill.startsWith('dialogue.')) return 'red';
  if (skill.startsWith('sequence.')) return 'blue';
  if (skill.includes('memory')) return 'green';
  if (skill.startsWith('director.')) return 'green';
  if (skill.startsWith('camera.') || skill.startsWith('vehicle.')) return 'purple';
  return 'gold';
}

const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--px-border)',
  borderRadius: 8,
  padding: 14,
  background: 'var(--px-surface2)',
  ...selectableTextStyle,
};

const dividerStyle: React.CSSProperties = {
  margin: '10px 0 12px',
  borderColor: 'var(--px-border)',
};

const stepRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: 8,
  alignItems: 'start',
  border: '1px solid var(--px-border)',
  borderRadius: 6,
  padding: 9,
  background: 'rgba(255,255,255,0.025)',
  ...selectableTextStyle,
};

const consequenceItemStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: 8,
  alignItems: 'start',
  border: '1px solid var(--px-border)',
  borderRadius: 6,
  padding: 8,
  background: 'rgba(255,255,255,0.025)',
  fontSize: 12,
  ...selectableTextStyle,
};

const reviewItemStyle: React.CSSProperties = {
  border: '1px solid var(--px-border)',
  borderRadius: 6,
  padding: 9,
  color: 'var(--px-text)',
  background: 'rgba(255,255,255,0.025)',
  lineHeight: 1.5,
  ...selectableTextStyle,
};
