import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { message } from 'antd';
import { FaRobot } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import type { MissionList, SystemWithMission } from '../../../../Types/System';
import TaskDependencyGraph from './TaskDependencyGraph';
import TaskFormModal, { type EditableNode } from './TaskFormModal';
import CreateTaskModal from './CreateTaskModal';
import EditTaskModal from './EditTaskModal';
import AiAssistantModal from './ai-assistant/AiAssistantModal';
import DeleteMissionListDialog from './task-chain/components/DeleteMissionListDialog';
import MissionListSidebar from './task-chain/components/MissionListSidebar';
import { useTaskChainPanelController } from './task-chain/hooks/useTaskChainPanelController';
import type { TaskRewardItemOption } from './task-chain/taskChainForms';

type TaskChainPanelProps = {
    systemId: string;
    variant?: 'page' | 'embedded';
};

const TaskChainPanel: React.FC<TaskChainPanelProps> = ({ systemId, variant = 'page' }) => {
    const isEmbedded = variant === 'embedded';
    const systems = useSelector((state: RootState) => state.system.systems);
    const currentSystemData = systems.find((system) => system._id === systemId) as SystemWithMission | undefined;
    const missionLists = useMemo(() => currentSystemData?.missionLists || [], [currentSystemData]);
    const obtainableItems = useMemo(() => currentSystemData?.obtainableItems || [], [currentSystemData]);
    const rewardItemOptions = useMemo<TaskRewardItemOption[]>(() => {
        const options: TaskRewardItemOption[] = [];
        const keySet = new Set<string>();

        for (const product of currentSystemData?.storeProducts || []) {
            if (product.type !== 'item' || keySet.has(product._id)) continue;
            keySet.add(product._id);
            options.push({ key: product._id, label: product.name, source: 'store' });
        }

        for (const item of obtainableItems) {
            if (!item.itemKey || keySet.has(item.itemKey)) continue;
            keySet.add(item.itemKey);
            options.push({ key: item.itemKey, label: item.name || item.itemKey, source: 'obtainable' });
        }

        return options;
    }, [currentSystemData, obtainableItems]);

    const controller = useTaskChainPanelController({ systemId, missionLists });

    return (
        <div className={`${isEmbedded ? 'system-management-panel--embedded p-3' : 'p-3 md:p-5 xl:p-6 2xl:p-8'} h-full overflow-y-auto scrollbar-thin scrollbar-thumb-system-line/20 scrollbar-track-transparent`}>
            <div className={`${isEmbedded ? 'w-full' : 'max-w-[1480px] mx-auto w-full'}`}>
                <div className={`bg-system-panel/80 border border-system-line/20 rounded-lg xl:rounded-xl ${isEmbedded ? 'p-3 mb-3' : 'p-4 xl:p-5 2xl:p-6 mb-4 xl:mb-5 2xl:mb-6'}`}>
                    <h3 className={`${isEmbedded ? 'text-sm' : 'text-base 2xl:text-lg'} font-bold tracking-widest mb-1.5 2xl:mb-2 text-system-accent`}>任务链定义</h3>
                    <p className={`${isEmbedded ? 'text-xs mb-3' : 'text-xs 2xl:text-sm mb-3 2xl:mb-4'} text-system-muted`}>支持主线任务和紧急任务，创建任务树头节点与子任务（每个节点最多 3 个子任务）</p>

                    <div className="flex flex-wrap gap-2 2xl:gap-3">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => controller.setShowListForm(true)}
                            className={`bg-system-action hover:bg-system-action/80 text-white ${isEmbedded ? 'px-3 py-1.5 text-xs' : 'px-4 2xl:px-6 py-2 text-xs 2xl:text-sm'} rounded-md 2xl:rounded-lg font-bold tracking-widest transition-colors`}
                        >
                            + 创建系列任务
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={controller.openEditMissionListModal}
                            disabled={!controller.selectedMissionList}
                            className={`bg-system-raised hover:bg-system-raised/80 border border-system-line/20 text-system-text ${isEmbedded ? 'px-3 py-1.5 text-xs' : 'px-4 2xl:px-6 py-2 text-xs 2xl:text-sm'} rounded-md 2xl:rounded-lg font-bold tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            编辑选中任务列表
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => controller.setShowAiModal(true)}
                            className={`flex items-center gap-2 bg-system-violet hover:bg-system-violet/80 text-white ${isEmbedded ? 'px-3 py-1.5 text-xs' : 'px-4 2xl:px-6 py-2 text-xs 2xl:text-sm'} rounded-md 2xl:rounded-lg font-bold tracking-widest transition-colors`}
                        >
                            <FaRobot className="text-sm" />
                            AI 模式
                        </motion.button>
                    </div>
                </div>

                <div className={`${isEmbedded ? 'grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)] gap-3' : 'grid grid-cols-1 xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)] gap-4 2xl:gap-6'}`}>
                    <MissionListSidebar
                        missionLists={missionLists}
                        isLoading={controller.isLoading}
                        selectedMissionListId={controller.selectedMissionListId}
                        onSelect={controller.setSelectedMissionListId}
                        onRequestDelete={controller.handleRequestDeleteMissionList}
                    />

                    <div
                        className="bg-system-panel/60 border border-system-line/20 rounded-lg xl:rounded-xl p-1 relative overflow-hidden group"
                        style={{
                            height: isEmbedded ? 'clamp(300px, 56vh, 520px)' : 'clamp(420px, 62vh, 680px)',
                        }}
                    >
                        <div className={`${isEmbedded ? 'p-2' : 'p-3 2xl:p-4'} absolute top-0 right-0 z-10 pointer-events-none`}>
                            <h4 className={`${isEmbedded ? 'text-xs' : 'text-xs 2xl:text-base'} font-black tracking-widest text-system-accent`}>任务依赖视图</h4>
                        </div>
                        {!controller.selectedMissionList ? (
                            <div className="h-full flex items-center justify-center bg-system-bg/70 rounded-lg border border-system-line/10">
                                <p className="text-xs 2xl:text-sm text-system-muted font-mono tracking-widest animate-pulse">等待选择任务列表...</p>
                            </div>
                        ) : (
                            <TaskDependencyGraph
                                taskTree={controller.selectedMissionList.taskTree}
                                rootNodeId={controller.selectedMissionList.rootNodeId}
                                onNodeClick={(nodeId) => {
                                    const node = controller.selectedMissionList?.taskTree.find((item: MissionList['taskTree'][number]) => item.nodeId === nodeId);
                                    if (!node) return;
                                    controller.openEditNodeForm({
                                        nodeId: node.nodeId,
                                        title: node.title,
                                        description: node.description,
                                        content: node.content,
                                        notice: node.notice,
                                        timeCostMinutes: node.timeCostMinutes,
                                        canInterrupt: node.canInterrupt,
                                        rewards: node.rewards as EditableNode['rewards'],
                                    });
                                }}
                                onPhantomClick={(parentId) => controller.openCreateNodeForm(parentId || '')}
                                onNodeDelete={controller.isDeletingNode ? undefined : controller.handleDeleteMissionNode}
                            />
                        )}
                    </div>
                </div>

                <TaskFormModal
                    visible={controller.showNodeForm}
                    onClose={controller.closeNodeForm}
                    systemId={systemId}
                    selectedMissionList={controller.selectedMissionList}
                    rewardItemOptions={rewardItemOptions}
                    initialParentNodeId={controller.nodeParentAnchor}
                    editNode={controller.editingNode}
                />

                <CreateTaskModal
                    visible={controller.showListForm}
                    isCreatingList={controller.isCreatingList}
                    listForm={controller.listForm}
                    rewardItemOptions={rewardItemOptions}
                    onListFormChange={controller.setListForm}
                    onCreate={controller.handleCreateMissionList}
                    onClose={() => controller.setShowListForm(false)}
                    onCancel={() => {
                        controller.resetListForm();
                        controller.setShowListForm(false);
                    }}
                />

                <EditTaskModal
                    visible={controller.showEditListForm}
                    selectedTitle={controller.selectedMissionList?.title}
                    isUpdating={controller.isUpdatingList}
                    isDeleting={controller.isDeletingList}
                    listForm={controller.editListForm}
                    rewardItemOptions={rewardItemOptions}
                    onListFormChange={controller.setEditListForm}
                    onSave={controller.handleUpdateMissionList}
                    onDelete={() => {
                        if (controller.selectedMissionList) {
                            controller.handleRequestDeleteMissionList(
                                controller.selectedMissionList._id,
                                controller.selectedMissionList.title,
                                controller.selectedMissionList.taskTree?.length || 0,
                            );
                        }
                    }}
                    onClose={() => controller.setShowEditListForm(false)}
                    onCancel={() => controller.setShowEditListForm(false)}
                />

                <DeleteMissionListDialog
                    deleteTarget={controller.deleteTarget}
                    isDeleting={controller.isDeletingList}
                    onConfirm={controller.handleConfirmDeleteMissionList}
                    onCancel={() => controller.setDeleteTarget(null)}
                />
            </div>

            <AnimatePresence>
                {controller.showAiModal && (
                    <AiAssistantModal
                        systemId={systemId}
                        systemName={currentSystemData?.name || ''}
                        onClose={() => controller.setShowAiModal(false)}
                        onCreated={(id) => {
                            controller.setSelectedMissionListFromCreated(id);
                            message.success('AI 已自动创建任务列表，已为你选中');
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default TaskChainPanel;
