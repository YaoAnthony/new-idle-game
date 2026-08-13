import React from 'react';
import { FaGamepad, FaTrash } from 'react-icons/fa';

import type { MissionList } from '../../../../../../Types/System';

type MissionListSidebarProps = {
    missionLists: MissionList[];
    isLoading: boolean;
    selectedMissionListId: string;
    onSelect: (missionListId: string) => void;
    onRequestDelete: (listId: string, title: string, nodeCount: number) => void;
};

const MissionListSidebar: React.FC<MissionListSidebarProps> = ({
    missionLists,
    isLoading,
    selectedMissionListId,
    onSelect,
    onRequestDelete,
}) => {
    return (
        <div className="bg-system-panel/70 border border-system-line/20 rounded-lg xl:rounded-xl p-4 2xl:p-5">
            <h4 className="text-sm 2xl:text-base font-bold tracking-widest mb-3 2xl:mb-4 text-system-accent">任务列表</h4>
            {isLoading ? (
                <p className="text-xs 2xl:text-sm text-system-muted">加载中...</p>
            ) : missionLists.length === 0 ? (
                <div className="text-center py-8 2xl:py-12 text-system-muted bg-system-panel/40 rounded-lg xl:rounded-xl border border-dashed border-system-line/30">
                    <FaGamepad className="text-4xl 2xl:text-5xl mb-3 2xl:mb-4 opacity-30 mx-auto" />
                    <p className="text-xs 2xl:text-sm tracking-widest">暂无任务列表，先定义一个任务列表</p>
                </div>
            ) : (
                <div className="space-y-2 2xl:space-y-3">
                    {missionLists.map((list) => (
                        <div
                            key={list._id}
                            className={`relative group rounded-md 2xl:rounded-lg border transition-colors ${selectedMissionListId === list._id
                                ? 'border-system-accent/70 bg-system-accent/10'
                                : 'border-system-line/10 bg-system-bg/30 hover:border-system-line/30'
                            }`}
                        >
                            <button
                                onClick={() => onSelect(list._id)}
                                className="w-full text-left p-3 2xl:p-4 pr-9 2xl:pr-10"
                            >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <p className="min-w-0 truncate text-sm 2xl:text-base font-bold tracking-wider text-system-text">{list.title}</p>
                                    <span className={`shrink-0 text-[10px] 2xl:text-xs px-1.5 2xl:px-2 py-0.5 2xl:py-1 rounded ${list.listType === 'urgent' ? 'bg-system-danger/20 text-system-danger border border-system-danger/25' : 'bg-system-action/20 text-system-action border border-system-action/25'}`}>
                                        {list.listType === 'urgent' ? '紧急' : '主线'}
                                    </span>
                                </div>
                                <p className="text-[11px] 2xl:text-xs text-system-muted mb-0.5 2xl:mb-1">节点数: {list.taskTree?.length || 0}</p>
                                <p className="text-[11px] 2xl:text-xs text-system-muted">状态: {list.hasFailed ? '已失败（不可重开）' : '进行中'}</p>
                            </button>

                            <button
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onRequestDelete(list._id, list.title, list.taskTree?.length || 0);
                                }}
                                title="删除任务列表"
                                className="absolute top-2.5 2xl:top-3 right-2.5 2xl:right-3 opacity-0 group-hover:opacity-100 p-1 2xl:p-1.5 rounded-md 2xl:rounded-lg text-red-400 hover:bg-red-500/10 transition-all duration-150"
                            >
                                <FaTrash className="text-xs" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MissionListSidebar;
