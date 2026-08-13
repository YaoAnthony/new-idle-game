import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { message } from 'antd';
import { FaGamepad, FaTasks, FaCogs } from 'react-icons/fa';

import MissionDetail from './MissionDetail';
import { RootState } from '../../../../Redux/store';
import { getEnv } from '../../../../config/env';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import { useLazyGetActiveSystemTasksQuery } from '../../../../api/profileApi';
import { setSelectedSystemId } from '../../../../Redux/Features/systemSlice';
import {
    useLazyGetSystemListQuery,
    useGetMemberTaskCenterQuery,
    useAcceptMissionListMutation,
    useStartMemberTaskMutation,
    useCompleteMemberTaskMutation,
    useFailMemberTaskMutation,
    useRestartMemberTaskMutation,
} from '../../../../api/systemRtkApi';
import { getMemberSystems, isOwnedSystem } from '../../utils/systemRelationship';
import { gameBus } from '../SystemIdleGame/shared/EventBus';
import '../pixelDashboard.css';

type TaskCenterActiveTask = {
    missionListId: string;
    nodeId: string;
    startedAt: string;
} | null;

const Tasks: React.FC = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const targetSystemId = searchParams.get('systemId');
    const targetMissionListId = searchParams.get('missionListId');

    const allSystems = useSelector((state: RootState) => state.system.systems);
    const selectedSystemId = useSelector((state: RootState) => state.system.selectedSystemId);
    const profile = useSelector((state: RootState) => state.profile.profile);
    const accessToken = useSelector((state: RootState) => state.user.accessToken);

    const systems = useMemo(() => getMemberSystems(allSystems, profile?._id), [allSystems, profile?._id]);
    const ownSystems = useMemo(
        () => systems.filter((system) => isOwnedSystem(system, profile?._id)),
        [systems, profile?._id]
    );
    const joinedSystems = useMemo(
        () => systems.filter((system) => !isOwnedSystem(system, profile?._id)),
        [systems, profile?._id]
    );

    const selectedSystem = useMemo(() => {
        if (!systems.length) return null;
        return systems.find((system) => system._id === selectedSystemId) || systems[0];
    }, [systems, selectedSystemId]);

    const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const [triggerGetActiveSystemTasks] = useLazyGetActiveSystemTasksQuery();

    const { data: taskCenterData, refetch, isFetching } = useGetMemberTaskCenterQuery(
        { systemId: selectedSystem?._id || '' },
        { skip: !selectedSystem },
    );

    const [acceptMissionList, { isLoading: isAccepting }] = useAcceptMissionListMutation();
    const [startMemberTask, { isLoading: isStarting }] = useStartMemberTaskMutation();
    const [completeMemberTask, { isLoading: isCompleting }] = useCompleteMemberTaskMutation();
    const [failMemberTask, { isLoading: isFailing }] = useFailMemberTaskMutation();
    const [restartMemberTask, { isLoading: isRestarting }] = useRestartMemberTaskMutation();

    const { backendUrl } = getEnv();
    const updateSseUrl = selectedSystem?._id && accessToken
        ? `${backendUrl}/system/${selectedSystem._id}/updates/events?token=${encodeURIComponent(accessToken)}`
        : null;

    useSSEWithReconnect({
        url: updateSseUrl,
        enabled: Boolean(selectedSystem?._id && accessToken),
        onMessage: (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (!payload?.type || payload.type === 'connected') return;

                if (
                    payload.type === 'mission_list_created'
                    || payload.type === 'mission_list_updated'
                    || payload.type === 'mission_list_deleted'
                    || payload.type === 'mission_node_created'
                    || payload.type === 'mission_node_updated'
                ) {
                    triggerGetSystemList();
                    refetch();
                    message.info('任务中心已更新，页面已自动同步');
                } else if (payload.type === 'system_deleted') {
                    message.info('系统已删除，正在返回首页');
                    triggerGetSystemList();
                    navigate('/dashboard/idle-game');
                }
            } catch (error) {
                console.error('Tasks page update SSE parse error:', error);
            }
        },
    });

    const handleAcceptMissionList = async (missionListId: string, title: string) => {
        if (!selectedSystem?._id) return;
        try {
            await acceptMissionList({ systemId: selectedSystem._id, missionListId }).unwrap();
            message.success(`已接取任务列表「${title}」`);
            refetch();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '接取任务失败');
        }
    };

    const handleStartTask = async (missionListId: string, nodeId: string, title: string) => {
        if (!selectedSystem?._id) return;
        try {
            await startMemberTask({ systemId: selectedSystem._id, missionListId, nodeId }).unwrap();
            message.success(`任务已开始：${title}`);
            refetch();
            triggerGetActiveSystemTasks();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '开始任务失败');
        }
    };

    const handleCompleteTask = async (missionListId: string, nodeId: string, title: string) => {
        if (!selectedSystem?._id) return;
        try {
            const result = await completeMemberTask({ systemId: selectedSystem._id, missionListId, nodeId }).unwrap();
            if (result?.spawnedChest) {
                gameBus.emit('game:chest_spawned', { chest: result.spawnedChest });
            }
            const hasChestReward = (result?.rewards?.coins || 0) > 0 || (result?.rewards?.items?.length || 0) > 0;
            message.success(`节点已完成：${title}${hasChestReward ? '，奖励已发送到游戏内，请前往领取' : ''}`);
            if (result?.mergeBonus?.coins || (result?.mergeBonus?.experience?.length || 0) > 0) {
                message.success(`合流奖励已触发，奖励已发送到游戏内，请前往领取${result.mergeBonus?.tier === 'boss' ? '，并解锁一个 Boss 节点。' : '。'}`);
            }
            if (result?.unlockedMergeNodes?.length) {
                const unlockedTitles = result.unlockedMergeNodes.map((node) => node.title).join('、');
                message.info(`新的合流节点已解锁：${unlockedTitles}`);
            }
            refetch();
            triggerGetSystemList();
            triggerGetActiveSystemTasks();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '完成任务失败');
        }
    };

    const handleFailTask = async (missionListId: string, nodeId: string, title: string) => {
        if (!selectedSystem?._id) return;
        try {
            await failMemberTask({ systemId: selectedSystem._id, missionListId, nodeId }).unwrap();
            message.warning(`节点已失败：${title}`);
            refetch();
            triggerGetActiveSystemTasks();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '标记失败操作失败');
        }
    };

    const handleRestartTask = async (missionListId: string, nodeId: string, title: string) => {
        if (!selectedSystem?._id) return;
        try {
            await restartMemberTask({ systemId: selectedSystem._id, missionListId, nodeId }).unwrap();
            message.success(`已重新挑战：${title}`);
            refetch();
            triggerGetActiveSystemTasks();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '重新挑战失败');
        }
    };

    useEffect(() => {
        triggerGetSystemList();
    }, [triggerGetSystemList]);

    useEffect(() => {
        if (!selectedSystemId && systems.length > 0) {
            dispatch(setSelectedSystemId(systems[0]._id));
        }
    }, [selectedSystemId, systems, dispatch]);

    useEffect(() => {
        if (!targetSystemId) return;
        const exists = systems.some((system) => system._id === targetSystemId);
        if (!exists) return;
        if (selectedSystemId !== targetSystemId) {
            dispatch(setSelectedSystemId(targetSystemId));
        }
    }, [targetSystemId, systems, selectedSystemId, dispatch]);

    const isOwner = selectedSystem ? isOwnedSystem(selectedSystem, profile?._id) : false;
    const missionLists = useMemo(() => taskCenterData?.missionLists || [], [taskCenterData?.missionLists]);

    useEffect(() => {
        if (missionLists.length > 0) {
            if (targetMissionListId && missionLists.some((mission) => mission._id === targetMissionListId)) {
                if (selectedMissionId !== targetMissionListId) {
                    setSelectedMissionId(targetMissionListId);
                }

                if (searchParams.get('missionListId') || searchParams.get('nodeId')) {
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.delete('missionListId');
                    nextParams.delete('nodeId');
                    setSearchParams(nextParams, { replace: true });
                }
                return;
            }

            if (!selectedMissionId || !missionLists.find((mission) => mission._id === selectedMissionId)) {
                setSelectedMissionId(missionLists[0]._id);
            }
        } else {
            setSelectedMissionId(null);
        }
    }, [missionLists, selectedMissionId, targetMissionListId, searchParams, setSearchParams]);

    if (!systems.length) {
        return (
            <section className="pixel-page-shell w-full h-[85vh] flex flex-col overflow-hidden select-none p-8">
                <div className="flex flex-col items-center justify-center h-full text-neutral-400 dark:text-white/40">
                    <FaTasks className="text-7xl mb-6 opacity-40 drop-shadow-md" />
                    <p className="text-2xl font-black tracking-widest mb-2">你还没有可用系统</p>
                    <p className="text-sm font-bold tracking-wider opacity-70">请先创建一个系统，或等待别人邀请你加入系统。</p>
                </div>
            </section>
        );
    }

    return (
        <section className="pixel-page-shell w-full h-[85vh] flex flex-col overflow-hidden select-none relative">
            <div className="pixel-page-header px-8 py-6 relative z-10 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="pixel-icon-tile p-3">
                            <FaGamepad className="text-3xl drop-shadow-md" />
                        </div>
                        <div>
                            <h1 className="pixel-page-title text-3xl font-extrabold">任务中心</h1>
                            <p className="pixel-page-subtitle text-sm font-bold uppercase mt-1">Mission Control Board</p>
                        </div>
                    </div>

                    {isOwner && selectedSystem && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => navigate(`/dashboard/system/${selectedSystem._id}`)}
                            className="pixel-button pixel-button-primary px-6 py-2.5 text-sm font-black tracking-widest transition-all flex items-center gap-2"
                        >
                            <FaCogs className="text-xs" />
                            前往系统管理
                        </motion.button>
                    )}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2 md:gap-3">
                    {ownSystems.map((system) => (
                        <button
                            key={system._id}
                            onClick={() => dispatch(setSelectedSystemId(system._id))}
                            className={`pixel-button px-4 py-2 text-xs md:text-sm font-black tracking-widest transition-all duration-300 relative overflow-hidden ${
                                selectedSystem?._id === system._id
                                    ? 'pixel-button-primary'
                                    : ''
                            }`}
                        >
                            <span className="relative z-10">{system.name}</span>
                            {selectedSystem?._id === system._id && (
                                <motion.div layoutId="taskSystemTab" className="absolute inset-0 bg-neutral-800 dark:bg-[#FFC72C]" style={{ zIndex: 0 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }} />
                            )}
                        </button>
                    ))}

                    {ownSystems.length > 0 && joinedSystems.length > 0 && (
                        <div className="flex items-center gap-1.5 px-1">
                            <div className="w-px h-5 bg-black/15 dark:bg-white/15" />
                            <span className="text-[10px] font-bold tracking-widest text-neutral-400 dark:text-white/30 uppercase">已加入</span>
                            <div className="w-px h-5 bg-black/15 dark:bg-white/15" />
                        </div>
                    )}

                    {joinedSystems.map((system) => (
                        <button
                            key={system._id}
                            onClick={() => dispatch(setSelectedSystemId(system._id))}
                            className={`pixel-button px-4 py-2 text-xs md:text-sm font-black tracking-widest transition-all duration-300 relative overflow-hidden ${
                                selectedSystem?._id === system._id
                                    ? 'pixel-button-primary'
                                    : ''
                            }`}
                        >
                            <span className="relative z-10">{system.name}</span>
                            {selectedSystem?._id === system._id && (
                                <motion.div layoutId="taskSystemTab" className="absolute inset-0 bg-neutral-800 dark:bg-[#FFC72C]" style={{ zIndex: 0 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }} />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-hidden p-4 md:p-8 relative z-10 flex flex-col md:flex-row gap-6">
                {!selectedSystem?.modules?.taskChain ? (
                    <div className="pixel-empty w-full h-full flex items-center justify-center">
                        <div className="text-center">
                            <FaTasks className="text-7xl mb-6 opacity-30 drop-shadow-md mx-auto" />
                            <p className="text-2xl font-black tracking-widest mb-2">任务链模块未开启</p>
                            <p className="text-sm font-bold tracking-wider opacity-70">请前往系统管理页启用任务链模块。</p>
                        </div>
                    </div>
                ) : isFetching && missionLists.length === 0 ? (
                    <div className="pixel-empty w-full h-full flex items-center justify-center">
                        <div className="text-center animate-pulse">
                            <FaTasks className="text-7xl mb-6 opacity-20 drop-shadow-md mx-auto transition-all" />
                            <p className="text-2xl font-black tracking-widest mb-2">任务同步中...</p>
                        </div>
                    </div>
                ) : missionLists.length === 0 ? (
                    <div className="pixel-empty w-full h-full flex items-center justify-center">
                        <div className="text-center">
                            <FaTasks className="text-7xl mb-6 opacity-30 drop-shadow-md mx-auto" />
                            <p className="text-2xl font-black tracking-widest mb-2">暂无任务列表</p>
                            <p className="text-sm font-bold tracking-wider opacity-70">系统中还没有发布可执行的委托。</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="w-full md:w-1/3 md:min-w-[280px] md:max-w-[360px] flex flex-col gap-3 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-black/10 dark:scrollbar-thumb-white/10 scrollbar-track-transparent">
                            {missionLists.map((list) => {
                                const isSelected = selectedMissionId === list._id;
                                const isUrgent = list.listType === 'urgent';
                                return (
                                    <button
                                        key={list._id}
                                        onClick={() => setSelectedMissionId(list._id)}
                                        className={`pixel-card w-full text-left relative overflow-hidden transition-all duration-300 py-4 px-5 group ${
                                            isSelected
                                                ? (isUrgent
                                                    ? 'pixel-card-selected pixel-card-urgent text-red-900 dark:text-red-100'
                                                    : 'pixel-card-selected text-neutral-900 dark:text-white')
                                                : 'text-neutral-700 dark:text-neutral-200'
                                        }`}
                                    >
                                        {isSelected && (
                                            <motion.div layoutId="activeMissionSelection" className={`absolute left-0 top-0 bottom-0 w-1.5 ${isUrgent ? 'bg-red-500' : 'bg-amber-500'}`} />
                                        )}
                                        <div className="flex items-center gap-3 relative z-10">
                                            <div className={`pixel-item-frame w-9 h-9 flex items-center justify-center flex-shrink-0 ${
                                                isUrgent ? 'bg-red-100 dark:bg-red-900/50 text-red-500 border-red-200 dark:border-red-800' : 'bg-amber-100 dark:bg-amber-900/50 text-amber-500 border-amber-200 dark:border-amber-800'
                                            }`}>
                                                <span className="text-xs font-black">{isUrgent ? '!' : '◇'}</span>
                                            </div>
                                            <div className="flex-1 truncate">
                                                <h4 className={`text-sm font-bold truncate ${isSelected ? '' : 'opacity-80'}`}>{list.title}</h4>
                                                <p className="text-[10px] font-bold tracking-widest uppercase opacity-60 mt-0.5">{isUrgent ? '紧急委托' : '主线委托'}</p>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex-1 h-full min-h-[400px]">
                            <MissionDetail
                                mission={missionLists.find((mission) => mission._id === selectedMissionId) || null}
                                storeProducts={selectedSystem?.storeProducts || []}
                                activeTask={(taskCenterData?.activeTask || null) as TaskCenterActiveTask}
                                handleAcceptMissionList={handleAcceptMissionList}
                                handleStartTask={handleStartTask}
                                handleCompleteTask={handleCompleteTask}
                                handleFailTask={handleFailTask}
                                handleRestartTask={handleRestartTask}
                                isAccepting={isAccepting}
                                isCompleting={isCompleting}
                                isFailing={isFailing}
                                isStarting={isStarting}
                                isRestarting={isRestarting}
                            />
                        </div>
                    </>
                )}
            </div>
        </section>
    );
};

export default Tasks;
