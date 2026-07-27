import React, { useEffect, useMemo, useState } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import {
    Background,
    BackgroundVariant,
    Controls,
    Handle,
    MarkerType,
    Position,
    ReactFlow,
    ReactFlowProvider,
    type Edge,
    type Node,
    type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FaCoins, FaCrown, FaEdit, FaLink, FaPlus, FaProjectDiagram, FaSpinner, FaStar, FaTrash } from 'react-icons/fa';
import { getRarityLabel } from '@timeplan-game/core/economy/rarity';

export type TaskGraphStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface TaskGraphNode {
    id: string;
    parentId: string | null;
    prerequisiteIds?: string[];
    title: string;
    description?: string;
    timeCostMinutes?: number;
    childrenIds?: string[];
    status: TaskGraphStatus;
    badgeText?: string;
    isMergeNode?: boolean;
    nodeKind?: 'standard' | 'milestone' | 'boss';
    progressText?: string;
    rewardHint?: string;
    rarity?: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
    rewardCoins?: number;
    rewardReason?: string;
}

interface TaskGraphCanvasProps {
    nodes: TaskGraphNode[];
    rootNodeId?: string | null;
    onNodeClick?: (nodeId: string) => void;
    onCreateChild?: (parentId: string | null) => void;
    onDeleteNode?: (nodeId: string) => void;
    readonly?: boolean;
    compact?: boolean;
    className?: string;
    showLegend?: boolean;
    emptyTitle?: string;
    emptyCtaLabel?: string;
    theme?: 'default' | 'system';
}

type EdgeKind = 'primary' | 'prerequisite';

type TaskFlowNodeData = {
    task: TaskGraphNode;
    childCount: number;
    incomingCount: number;
    readonly: boolean;
    compact: boolean;
    isSystemTheme: boolean;
    onNodeClick?: (nodeId: string) => void;
    onCreateChild?: (parentId: string | null) => void;
    onDeleteNode?: (nodeId: string) => void;
};

type TaskFlowNode = Node<TaskFlowNodeData, 'task'>;
type TaskFlowEdge = Edge<{ kind: EdgeKind }>;

const elk = new ELK();

const statusLabels: Record<TaskGraphStatus, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    failed: 'Failed',
};

const systemStatusClasses: Record<TaskGraphStatus, string> = {
    pending: 'border-system-line/35 bg-system-raised/95 text-system-text',
    in_progress: 'border-system-action/45 bg-system-action/12 text-system-action',
    completed: 'border-system-success/40 bg-system-success/12 text-system-success',
    failed: 'border-system-danger/40 bg-system-danger/12 text-system-danger',
};

const defaultStatusClasses: Record<TaskGraphStatus, string> = {
    pending: 'border-gray-300 bg-gray-100 text-gray-700',
    in_progress: 'border-blue-400 bg-blue-50 text-blue-700',
    completed: 'border-green-400 bg-green-50 text-green-700',
    failed: 'border-red-400 bg-red-50 text-red-700',
};

const systemKindClasses: Record<NonNullable<TaskGraphNode['nodeKind']>, string> = {
    standard: '',
    milestone: 'ring-1 ring-system-accent/45 bg-system-accent/10',
    boss: 'ring-1 ring-system-violet/45 bg-system-violet/10',
};

const systemRarityClasses: Record<NonNullable<TaskGraphNode['rarity']>, string> = {
    common: 'border-system-line/25 bg-system-raised/45 text-system-muted',
    rare: 'border-system-action/30 bg-system-action/12 text-system-action',
    epic: 'border-system-violet/35 bg-system-violet/12 text-system-violet',
    legendary: 'border-amber-300/40 bg-amber-300/12 text-amber-200',
    mythic: 'border-amber-400/45 bg-amber-400/12 text-amber-300',
};

const defaultKindClasses: Record<NonNullable<TaskGraphNode['nodeKind']>, string> = {
    standard: '',
    milestone: 'ring-2 ring-amber-300/80 bg-gradient-to-br from-amber-50/80 to-white',
    boss: 'ring-2 ring-fuchsia-300/80 bg-gradient-to-br from-fuchsia-50/80 to-white',
};

function dedupeIds(ids: Array<string | null | undefined>) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

function buildEdges(nodes: TaskGraphNode[]): TaskFlowEdge[] {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges: TaskFlowEdge[] = [];

    for (const node of nodes) {
        if (node.parentId && nodeIds.has(node.parentId)) {
            edges.push(createEdge(node.parentId, node.id, 'primary'));
        }

        for (const prerequisiteId of node.prerequisiteIds || []) {
            if (!prerequisiteId || prerequisiteId === node.parentId || !nodeIds.has(prerequisiteId)) continue;
            edges.push(createEdge(prerequisiteId, node.id, 'prerequisite'));
        }
    }

    return edges;
}

function createEdge(from: string, to: string, kind: EdgeKind): TaskFlowEdge {
    const isPrimary = kind === 'primary';
    return {
        id: `${kind}:${from}->${to}`,
        source: from,
        target: to,
        type: 'smoothstep',
        animated: !isPrimary,
        data: { kind },
        markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isPrimary ? '#818cf8' : '#f59e0b',
            width: 16,
            height: 16,
        },
        style: {
            stroke: isPrimary ? '#818cf8' : '#f59e0b',
            strokeWidth: isPrimary ? 2.5 : 2,
            strokeDasharray: isPrimary ? undefined : '7 6',
        },
    };
}

function buildNodeMetrics(nodes: TaskGraphNode[]) {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const childCounts = new Map<string, number>();
    const incomingCounts = new Map<string, number>();

    for (const node of nodes) {
        childCounts.set(node.id, (node.childrenIds || []).filter((id) => nodeIds.has(id)).length);
        incomingCounts.set(
            node.id,
            dedupeIds([node.parentId, ...(node.prerequisiteIds || [])]).filter((id) => nodeIds.has(id)).length,
        );
    }

    return { childCounts, incomingCounts };
}

async function layoutTaskGraph(
    nodes: TaskFlowNode[],
    edges: TaskFlowEdge[],
    nodeWidth: number,
    nodeHeight: number,
) {
    const graph = await elk.layout({
        id: 'task-graph',
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.edgeRouting': 'ORTHOGONAL',
            'elk.spacing.nodeNode': '42',
            'elk.layered.spacing.nodeNodeBetweenLayers': '116',
            'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
            'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
            'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        },
        children: nodes.map((node) => ({
            id: node.id,
            width: nodeWidth,
            height: nodeHeight,
        })),
        edges: edges.map((edge) => ({
            id: edge.id,
            sources: [edge.source],
            targets: [edge.target],
        })),
    });

    const positions = new Map((graph.children || []).map((node) => [node.id, {
        x: Number(node.x || 0),
        y: Number(node.y || 0),
    }]));

    return nodes.map((node) => ({
        ...node,
        position: positions.get(node.id) || node.position,
    }));
}

const TaskNodeCard: React.FC<NodeProps<TaskFlowNode>> = ({ data }) => {
    const {
        task,
        childCount,
        incomingCount,
        readonly,
        compact,
        isSystemTheme,
        onNodeClick,
        onCreateChild,
        onDeleteNode,
    } = data;

    const statusClass = isSystemTheme ? systemStatusClasses[task.status] : defaultStatusClasses[task.status];
    const kindClass = task.nodeKind
        ? isSystemTheme ? systemKindClasses[task.nodeKind] : defaultKindClasses[task.nodeKind]
        : '';
    const description = task.description?.trim() || 'No description yet.';

    const stop = (
        event: React.MouseEvent | React.PointerEvent,
    ) => event.stopPropagation();

    return (
        <div
            className={`${compact ? 'rounded-xl' : 'rounded-2xl'} relative h-full overflow-hidden border-2 shadow-xl shadow-black/10 transition-transform hover:-translate-y-0.5 ${statusClass} ${kindClass}`}
        >
            <Handle
                type="target"
                position={Position.Left}
                className="!h-2.5 !w-2.5 !border !border-system-line/40 !bg-system-bg"
            />
            <Handle
                type="source"
                position={Position.Right}
                className="!h-2.5 !w-2.5 !border !border-system-line/40 !bg-system-accent"
            />

            <div className={`${compact ? 'p-3' : 'p-4'} flex h-full min-h-0 flex-col`}>
                <div className={`${compact ? 'gap-2' : 'gap-3'} flex items-start justify-between`}>
                    <div className="min-w-0">
                        <p className={`${compact ? 'text-xs' : 'text-sm'} line-clamp-2 font-black leading-tight tracking-wide`}>
                            {task.title}
                        </p>
                        <div className={`${compact ? 'gap-1.5' : 'gap-2'} mt-1 flex flex-wrap items-center`}>
                            <p className={`${compact ? 'text-[10px]' : 'text-[11px]'} uppercase tracking-[0.22em] opacity-70`}>
                                {statusLabels[task.status]}
                            </p>
                            {task.badgeText && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${isSystemTheme ? 'border border-system-line/20 bg-black/20 text-system-muted' : 'bg-slate-500/15 text-slate-700'}`}>
                                    {task.badgeText}
                                </span>
                            )}
                        </div>
                    </div>

                    {task.isMergeNode && (
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                            isSystemTheme
                                ? task.nodeKind === 'boss'
                                    ? 'border border-system-violet/35 bg-system-violet/12 text-system-violet'
                                    : 'border border-system-accent/35 bg-system-accent/12 text-system-accent'
                                : task.nodeKind === 'boss'
                                    ? 'border border-fuchsia-300 bg-fuchsia-100 text-fuchsia-700'
                                    : 'border border-amber-300 bg-amber-100 text-amber-700'
                        }`}>
                            {task.nodeKind === 'boss' ? <FaCrown className="text-[9px]" /> : <FaStar className="text-[9px]" />}
                            {task.nodeKind === 'boss' ? 'Boss' : 'Merge'}
                        </span>
                    )}
                </div>

                <div className={`${compact ? 'mt-2 space-y-1.5 text-[11px]' : 'mt-3 space-y-2 text-xs'} min-h-0 flex-1 overflow-hidden`}>
                    <div className={`${compact ? 'line-clamp-3 rounded-lg px-2.5 py-1.5' : 'line-clamp-4 rounded-xl px-3 py-2'} overflow-hidden leading-relaxed ${isSystemTheme ? 'border border-system-line/15 bg-black/18 text-system-text/80' : 'bg-white/65 text-slate-600'}`}>
                        {description}
                    </div>
                    <div className={`${compact ? 'text-[10px]' : 'text-[11px]'} flex items-center justify-between font-semibold uppercase tracking-[0.16em] opacity-80`}>
                        <span>{Math.max(1, task.timeCostMinutes || 0)} min</span>
                        <span>{childCount}/3 children</span>
                    </div>
                    {incomingCount > 1 && (
                        <div className={`rounded-lg border px-2.5 py-1.5 text-[10px] leading-relaxed ${isSystemTheme ? 'border-system-accent/35 bg-system-accent/10 text-system-text/82' : 'border-amber-300 bg-amber-50 text-amber-700'}`}>
                            <div className="mb-0.5 flex items-center gap-1 font-bold uppercase tracking-[0.14em]">
                                <FaLink className="text-[9px]" />
                                {task.nodeKind === 'boss' ? 'Boss Gate' : 'Merge Gate'}
                            </div>
                            <span className="line-clamp-2">
                                {task.progressText || 'Needs every incoming branch to be completed.'}
                            </span>
                        </div>
                    )}
                    {(task.rarity || (task.rewardCoins || 0) > 0 || task.rewardReason) && (
                        <div className={`overflow-hidden rounded-lg border px-2.5 py-1.5 text-[10px] leading-relaxed ${isSystemTheme ? 'border-system-line/15 bg-black/18 text-system-muted' : 'border-slate-200 bg-white/70 text-slate-600'}`}>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {task.rarity && (
                                    <span className={`rounded-full border px-1.5 py-0.5 font-bold tracking-[0.12em] ${isSystemTheme ? systemRarityClasses[task.rarity] : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                                        {getRarityLabel(task.rarity)}
                                    </span>
                                )}
                                {(task.rewardCoins || 0) > 0 && (
                                    <span className="inline-flex min-w-0 max-w-full items-center gap-1 font-bold text-amber-500">
                                        <FaCoins className="text-[9px]" />
                                        <span className="truncate">{task.rewardCoins} 金币</span>
                                    </span>
                                )}
                            </div>
                            {task.rewardReason && (
                                <p className={`mt-1 ${compact ? 'line-clamp-1' : 'line-clamp-2'} opacity-80`}>
                                    {task.rewardReason}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {!readonly && (
                    <div
                        className={`${compact ? 'mt-2 gap-1.5' : 'mt-3 gap-2'} nodrag nopan flex shrink-0 flex-wrap items-center justify-center`}
                        style={{ pointerEvents: 'auto' }}
                        onPointerDownCapture={stop}
                        onPointerDown={stop}
                        onMouseDownCapture={stop}
                        onMouseDown={stop}
                    >
                        {onNodeClick && (
                            <button
                                type="button"
                                className={`${compact ? 'rounded-md p-1.5 text-xs' : 'rounded-lg p-2'} nodrag nopan text-system-action transition-colors hover:bg-system-action/12 hover:text-blue-200`}
                                onPointerDownCapture={stop}
                                onPointerDown={stop}
                                onMouseDownCapture={stop}
                                onMouseDown={stop}
                                onClick={(event) => {
                                    stop(event);
                                    onNodeClick(task.id);
                                }}
                                title="Edit node"
                            >
                                <FaEdit />
                            </button>
                        )}
                        {onDeleteNode && (
                            <button
                                type="button"
                                className={`${compact ? 'rounded-md p-1.5 text-xs' : 'rounded-lg p-2'} nodrag nopan text-system-danger transition-colors hover:bg-system-danger/12 hover:text-red-200`}
                                onPointerDownCapture={stop}
                                onPointerDown={stop}
                                onMouseDownCapture={stop}
                                onMouseDown={stop}
                                onClick={(event) => {
                                    stop(event);
                                    onDeleteNode(task.id);
                                }}
                                title="Delete node"
                            >
                                <FaTrash />
                            </button>
                        )}
                        {onCreateChild && childCount < 3 && (
                            <button
                                type="button"
                                className={`${compact ? 'rounded-md p-1.5 text-xs' : 'rounded-lg p-2'} nodrag nopan text-system-success transition-colors hover:bg-system-success/12 hover:text-green-200`}
                                onPointerDownCapture={stop}
                                onPointerDown={stop}
                                onMouseDownCapture={stop}
                                onMouseDown={stop}
                                onClick={(event) => {
                                    stop(event);
                                    onCreateChild(task.id);
                                }}
                                title="Add child node"
                            >
                                <FaPlus />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const nodeTypes = {
    task: TaskNodeCard,
};

const TaskGraphCanvas: React.FC<TaskGraphCanvasProps> = ({
    nodes,
    rootNodeId,
    onNodeClick,
    onCreateChild,
    onDeleteNode,
    readonly = false,
    compact = false,
    className = '',
    showLegend = true,
    emptyTitle = 'No task nodes yet. Create the first root task to start your workflow.',
    emptyCtaLabel = 'Create Root Task',
    theme = 'default',
}) => {
    const isSystemTheme = theme === 'system';
    const nodeWidth = compact ? 268 : 304;
    const nodeHeight = compact ? 236 : 252;
    const { childCounts, incomingCounts } = useMemo(() => buildNodeMetrics(nodes), [nodes]);
    const graphEdges = useMemo(() => buildEdges(nodes), [nodes]);
    const [flowNodes, setFlowNodes] = useState<TaskFlowNode[]>([]);
    const [layoutPending, setLayoutPending] = useState(false);
    const orderedTasks = useMemo(() => {
        if (!rootNodeId) return nodes;
        return [...nodes].sort((a, b) => {
            if (a.id === rootNodeId) return -1;
            if (b.id === rootNodeId) return 1;
            return 0;
        });
    }, [nodes, rootNodeId]);

    const baseNodes = useMemo<TaskFlowNode[]>(() => (
        orderedTasks.map((task, index) => ({
            id: task.id,
            type: 'task',
            className: 'nopan',
            position: {
                x: (index % 3) * (nodeWidth + 96),
                y: Math.floor(index / 3) * (nodeHeight + 64),
            },
            width: nodeWidth,
            height: nodeHeight,
            draggable: false,
            selectable: false,
            data: {
                task,
                childCount: childCounts.get(task.id) || 0,
                incomingCount: incomingCounts.get(task.id) || 0,
                readonly,
                compact,
                isSystemTheme,
                onNodeClick,
                onCreateChild,
                onDeleteNode,
            },
        }))
    ), [
        childCounts,
        compact,
        incomingCounts,
        isSystemTheme,
        nodeHeight,
        nodeWidth,
        onCreateChild,
        onDeleteNode,
        onNodeClick,
        orderedTasks,
        readonly,
    ]);

    useEffect(() => {
        let cancelled = false;
        setLayoutPending(true);
        layoutTaskGraph(baseNodes, graphEdges, nodeWidth, nodeHeight)
            .then((layoutedNodes) => {
                if (!cancelled) setFlowNodes(layoutedNodes);
            })
            .catch((error) => {
                console.warn('[TaskGraphCanvas] failed to layout task graph with ELK', error);
                if (!cancelled) setFlowNodes(baseNodes);
            })
            .finally(() => {
                if (!cancelled) setLayoutPending(false);
            });
        return () => {
            cancelled = true;
        };
    }, [baseNodes, graphEdges, nodeHeight, nodeWidth]);

    const shellClassName = compact
        ? 'task-graph-flow-shell w-full h-full min-h-[300px] overflow-hidden rounded-lg'
        : 'task-graph-flow-shell w-full h-full min-h-[320px] overflow-hidden rounded-xl';

    if (nodes.length === 0) {
        return (
            <div className={`${shellClassName} ${className}`}>
                <div className={`${compact ? 'p-6 gap-3' : 'p-8 gap-4'} flex h-full min-h-full flex-col items-center justify-center`}>
                    <p className={`${compact ? 'text-xs' : 'text-sm'} ${isSystemTheme ? 'text-system-muted' : 'text-gray-500'} text-center font-bold tracking-widest`}>
                        {emptyTitle}
                    </p>
                    {!readonly && onCreateChild && (
                        <button
                            type="button"
                            onClick={() => onCreateChild(null)}
                            className={`${compact ? 'px-4 text-xs rounded-md' : 'px-6 rounded-lg'} flex items-center gap-2 ${isSystemTheme ? 'border border-system-action/50 bg-system-action/90 hover:bg-system-action text-white' : 'bg-blue-500 hover:bg-blue-400 text-white'} py-2 font-bold transition-colors`}
                        >
                            <FaPlus /> {emptyCtaLabel}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={`${shellClassName} ${className}`}>
            <ReactFlowProvider>
                <div className="relative h-full min-h-0 overflow-hidden">
                    {showLegend && (
                        <div className={`${compact ? 'left-3 top-3 gap-3 px-2 py-1.5 text-[10px]' : 'left-4 top-4 gap-4 px-3 py-2 text-xs'} pointer-events-none absolute z-20 flex flex-wrap items-center rounded-lg border ${isSystemTheme ? 'border-system-line/20 bg-system-shell/82 text-system-muted' : 'border-white/60 bg-white/80 text-slate-500'} shadow-lg shadow-black/12 backdrop-blur`}>
                            <span className={`${compact ? 'gap-1.5' : 'gap-2'} inline-flex items-center`}>
                                <span className={`${compact ? 'w-6' : 'w-8'} h-0.5 bg-indigo-400`} />
                                Primary parent
                            </span>
                            <span className={`${compact ? 'gap-1.5' : 'gap-2'} inline-flex items-center`}>
                                <span className={`${compact ? 'w-6' : 'w-8'} h-0.5 border-t-2 border-dashed border-amber-400`} />
                                Shared prerequisite
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <FaProjectDiagram />
                                Merge nodes unlock after all incoming branches finish.
                            </span>
                        </div>
                    )}

                    {layoutPending && (
                        <div className="pointer-events-none absolute bottom-3 left-3 z-20 inline-flex items-center gap-2 rounded-md border border-system-line/20 bg-system-shell/82 px-3 py-1.5 text-[10px] font-bold tracking-widest text-system-muted shadow-lg shadow-black/12">
                            <FaSpinner className="animate-spin" />
                            LAYOUT
                        </div>
                    )}

                    <ReactFlow
                        className="task-graph-flow"
                        nodes={flowNodes.length ? flowNodes : baseNodes}
                        edges={graphEdges}
                        nodeTypes={nodeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.22, duration: 360 }}
                        minZoom={0.28}
                        maxZoom={1.45}
                        nodesDraggable={false}
                        nodesConnectable={false}
                        elementsSelectable={false}
                        noDragClassName="nodrag"
                        noPanClassName="nopan"
                        panOnScroll
                        zoomOnDoubleClick={false}
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background
                            id="task-graph-grid"
                            variant={BackgroundVariant.Lines}
                            gap={32}
                            color={isSystemTheme ? 'rgba(238,221,173,0.13)' : 'rgba(100,116,139,0.22)'}
                            bgColor={isSystemTheme ? 'rgba(14,15,20,0.86)' : 'rgba(248,250,252,0.92)'}
                        />
                        <Controls
                            className={isSystemTheme ? 'task-graph-flow-controls task-graph-flow-controls--system' : 'task-graph-flow-controls'}
                            showInteractive={false}
                            position="bottom-right"
                        />
                    </ReactFlow>
                </div>
            </ReactFlowProvider>
        </div>
    );
};

export default TaskGraphCanvas;
