import React from 'react';
import TaskGraphCanvas, { type TaskGraphNode } from './task-graph/TaskGraphCanvas';

export interface MissionNodeReward {
    experience?: Array<{ name: string; value: number }>;
    coins?: number;
    items?: Array<{ itemKey: string; quantity: number }>;
    unlockMissions?: Array<{ missionId: string; title: string; description?: string }>;
}

export interface MissionNode {
    nodeId: string;
    parentNodeId: string | null;
    prerequisiteNodeIds?: string[];
    title: string;
    description?: string;
    content?: string;
    notice?: string;
    timeCostMinutes: number;
    canInterrupt?: boolean;
    rewards?: MissionNodeReward;
    rarity?: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
    rewardReason?: string;
    childrenNodeIds: string[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface TaskDependencyGraphProps {
    taskTree: MissionNode[];
    rootNodeId: string | null | undefined;
    onNodeClick: (nodeId: string) => void;
    onPhantomClick: (parentId: string | null) => void;
    onNodeDelete?: (nodeId: string) => void;
}

const TaskDependencyGraph: React.FC<TaskDependencyGraphProps> = ({
    taskTree,
    rootNodeId,
    onNodeClick,
    onPhantomClick,
    onNodeDelete,
}) => {
    const graphNodes: TaskGraphNode[] = taskTree.map((node) => {
        const incomingCount = new Set([node.parentNodeId, ...(node.prerequisiteNodeIds || [])].filter(Boolean)).size;
        const isMergeNode = incomingCount > 1;
        const nodeKind = isMergeNode ? (incomingCount >= 3 ? 'boss' : 'milestone') : 'standard';

        return {
            id: node.nodeId,
            parentId: node.parentNodeId,
            prerequisiteIds: node.prerequisiteNodeIds || [],
            title: node.title,
            description: node.description,
            timeCostMinutes: node.timeCostMinutes,
            childrenIds: node.childrenNodeIds,
            status: node.status,
            isMergeNode,
            nodeKind,
            badgeText: isMergeNode ? (nodeKind === 'boss' ? 'Boss Gate' : 'Merge Gate') : undefined,
            progressText: isMergeNode ? `Needs all ${incomingCount} incoming branches to clear.` : undefined,
            rewardHint: isMergeNode ? (nodeKind === 'boss' ? 'Boss-tier merge reward node' : 'Milestone reward node') : undefined,
            rarity: node.rarity || 'common',
            rewardCoins: node.rewards?.coins || 0,
            rewardReason: node.rewardReason || '',
        };
    });

    return (
        <TaskGraphCanvas
            nodes={graphNodes}
            rootNodeId={rootNodeId}
            onNodeClick={onNodeClick}
            onCreateChild={onPhantomClick}
            onDeleteNode={onNodeDelete}
            readonly={false}
            compact
            showLegend
            theme="system"
            className="bg-system-bg/70 text-system-text"
        />
    );
};

export default TaskDependencyGraph;
