import { useEffect, useState, type ReactNode } from 'react';
import {
  FaCalendarCheck,
  FaDice,
  FaInfoCircle,
  FaListUl,
  FaStore,
} from 'react-icons/fa';

import DailyQuestPart from './parts/DailyQuestPart';
import LotteryPart from './parts/LotteryPart';
import StorePart from './parts/StorePart';
import TaskChainPart from './parts/TaskChainPart';
import type { OwnerPlayerSystemToolPart, OwnerPlayerSystemToolsProps } from './types';
import './OwnerPlayerSystemTools.css';

type ToolDefinition = {
  id: OwnerPlayerSystemToolPart | 'overview';
  label: string;
  icon: ReactNode;
};

const OWNER_TOOL_NAV: ToolDefinition[] = [
  { id: 'overview', label: '概览', icon: <FaInfoCircle /> },
  { id: 'task-chain', label: '任务链', icon: <FaListUl /> },
  { id: 'store', label: '系统商城', icon: <FaStore /> },
  { id: 'lottery', label: '祈愿卡池', icon: <FaDice /> },
  { id: 'daily-quests', label: '每日任务', icon: <FaCalendarCheck /> },
];

function renderPart(part: OwnerPlayerSystemToolPart, systemId: string) {
  if (part === 'task-chain') return <TaskChainPart systemId={systemId} />;
  if (part === 'store') return <StorePart systemId={systemId} />;
  if (part === 'lottery') return <LotteryPart systemId={systemId} />;
  return <DailyQuestPart systemId={systemId} />;
}

export default function OwnerPlayerSystemTools({
  systemId,
  initialPart = null,
  overview = null,
}: OwnerPlayerSystemToolsProps) {
  const [activePart, setActivePart] = useState<OwnerPlayerSystemToolPart | null>(initialPart);

  useEffect(() => {
    if (initialPart) setActivePart(initialPart);
  }, [initialPart]);

  return (
    <section className={`owner-player-system-tools ${activePart ? 'is-editing' : ''}`}>
      <div className="owner-player-system-tools__nav" aria-label="系统维护导航">
        {OWNER_TOOL_NAV.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={(tool.id === 'overview' ? !activePart : tool.id === activePart) ? 'is-active' : ''}
            onClick={() => setActivePart(tool.id === 'overview' ? null : tool.id)}
          >
            {tool.icon}
            <span>{tool.label}</span>
          </button>
        ))}
      </div>

      {activePart ? (
        <div className="owner-player-system-tools__editor-shell">
          <div className="owner-player-system-tools__editor">
            {renderPart(activePart, systemId)}
          </div>
        </div>
      ) : (
        <div className="owner-player-system-tools__overview">
          {overview}
        </div>
      )}
    </section>
  );
}
