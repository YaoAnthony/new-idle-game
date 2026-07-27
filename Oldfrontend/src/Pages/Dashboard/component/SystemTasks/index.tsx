import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { message } from 'antd';
import { FaGamepad, FaArrowLeft, FaTasks, FaPlay, FaCheck, FaHistory, FaRedo, FaTimes } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import { patchSystemLotteryPools } from '../../../../Redux/Features/systemSlice';
import { getEnv } from '../../../../config/env';
import type { LotteryPool } from '../../../../Types/Lottery';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import {
    useAcceptMissionListMutation,
    useCompleteMemberTaskMutation,
    useFailMemberTaskMutation,
    useGetMemberTaskCenterQuery,
    useRestartMemberTaskMutation,
    useStartMemberTaskMutation,
    useLazyGetSystemListQuery,
} from '../../../../api/systemRtkApi';
import { gameBus } from '../SystemIdleGame/shared/EventBus';

/**
 * SystemTasks - 系统任务大厅页面
 * 显示该系统的所有任务，成员可以接取任务
 */
const SystemTasks: React.FC = () => {
    const { systemId } = useParams<{ systemId: string }>();
    const navigate = useNavigate();
    
    const dispatch = useDispatch();
    const systems = useSelector((state: RootState) => state.system.systems);
    const accessToken = useSelector((state: RootState) => state.user.accessToken);
    const currentSystem = systems.find(sys => sys._id === systemId);
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const { data: taskCenterData, refetch, isFetching } = useGetMemberTaskCenterQuery(
        { systemId: systemId || '' },
        { skip: !systemId }
    );
    const [acceptMissionList, { isLoading: isAccepting }] = useAcceptMissionListMutation();
    const [startMemberTask, { isLoading: isStarting }] = useStartMemberTaskMutation();
    const [completeMemberTask, { isLoading: isCompleting }] = useCompleteMemberTaskMutation();
    const [failMemberTask, { isLoading: isFailing }] = useFailMemberTaskMutation();
    const [restartMemberTask, { isLoading: isRestarting }] = useRestartMemberTaskMutation();

    useEffect(() => {
        if (systems.length === 0) {
            triggerGetSystemList();
        }
    }, [systems.length, triggerGetSystemList]);

    const { backendUrl } = getEnv();
    const updateSseUrl = systemId && accessToken
        ? `${backendUrl}/system/${systemId}/updates/events?token=${encodeURIComponent(accessToken)}`
        : null;

    useSSEWithReconnect({
        url: updateSseUrl,
        enabled: Boolean(systemId && accessToken),
        onMessage: (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (!payload?.type || payload.type === 'connected') return;

                if (payload.type === 'lottery_pools_updated' && payload.systemId === systemId) {
                    // Surgical update — only lotteryPools slice
                    dispatch(patchSystemLotteryPools({
                        systemId: payload.systemId as string,
                        lotteryPools: payload.lotteryPools as LotteryPool[],
                    }));
                } else if (
                    payload.type === 'mission_list_created'
                    || payload.type === 'mission_list_updated'
                    || payload.type === 'mission_list_deleted'
                    || payload.type === 'mission_node_created'
                ) {
                    triggerGetSystemList();
                    refetch();
                    message.info('系统任务已更新，已自动同步');
                } else if (payload.type === 'system_deletion_started') {
                    message.warning(`系统即将删除：${payload.systemName || payload.systemId}`);
                } else if (payload.type === 'system_deletion_cleaning_profiles_started') {
                    message.info('系统删除中：正在清理成员数据');
                } else if (payload.type === 'system_deletion_cleaning_profiles_completed') {
                    message.info('系统删除中：成员数据清理完成');
                } else if (payload.type === 'system_deletion_deleting_system') {
                    message.info('系统删除中：正在删除系统');
                } else if (payload.type === 'system_deleted') {
                    message.info('系统已删除，正在返回首页');
                    triggerGetSystemList();
                    navigate('/dashboard/idle-game');
                }
            } catch (error) {
                console.error('SystemTasks update SSE parse error:', error);
            }
        },
    });

    const missionLists = taskCenterData?.missionLists || [];
    const activeTask = taskCenterData?.activeTask || null;

    const sortedHistory = useMemo(() => {
        const history = taskCenterData?.history || [];
        return [...history].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [taskCenterData?.history]);

    const handleAcceptMissionList = async (missionListId: string, title: string) => {
        if (!systemId) return;
        try {
            await acceptMissionList({ systemId, missionListId }).unwrap();
            message.success(`已接取任务列表：${title}`);
            refetch();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '接取任务列表失败');
        }
    };

    const handleStartTask = async (missionListId: string, nodeId: string, title: string) => {
        if (!systemId) return;
        try {
            await startMemberTask({ systemId, missionListId, nodeId }).unwrap();
            message.success(`任务已开始：${title}`);
            refetch();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '开始任务失败');
        }
    };

    const handleCompleteTask = async (missionListId: string, nodeId: string, title: string) => {
        if (!systemId) return;
        try {
            const result = await completeMemberTask({ systemId, missionListId, nodeId }).unwrap();
            if (result?.spawnedChest) {
                gameBus.emit('game:chest_spawned', { chest: result.spawnedChest });
            }
            const hasChestReward = (result?.rewards?.coins || 0) > 0 || (result?.rewards?.items?.length || 0) > 0;
            message.success(`任务完成：${title}${hasChestReward ? '，奖励已发送到游戏内，请前往领取' : ''}`);
            refetch();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '完成任务失败');
        }
    };

    const handleFailTask = async (missionListId: string, nodeId: string, title: string) => {
        if (!systemId) return;
        try {
            await failMemberTask({ systemId, missionListId, nodeId }).unwrap();
            message.warning(`任务已失败：${title}`);
            refetch();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '任务失败操作失败');
        }
    };

    const handleRestartTask = async (missionListId: string, nodeId: string, title: string) => {
        if (!systemId) return;
        try {
            await restartMemberTask({ systemId, missionListId, nodeId }).unwrap();
            message.success(`任务已重开：${title}`);
            refetch();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '任务重开失败');
        }
    };

    if (!currentSystem) {
        return null;
    }

    return (
        <section className="w-full h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md overflow-auto text-white font-sans select-none p-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => navigate(`/dashboard/system/${systemId}`)}
                    className="text-white/70 hover:text-[#FFC72C] transition-colors"
                >
                    <FaArrowLeft className="text-xl" />
                </motion.button>
                <div className="flex items-center gap-3">
                    <FaGamepad className="text-3xl text-[#FFC72C]" />
                    <div>
                        <h1 className="text-3xl font-bold tracking-widest">任务大厅</h1>
                        <p className="text-white/50 text-sm tracking-wider mt-1">
                            {currentSystem.name} - 可接取任务
                        </p>
                    </div>
                </div>
            </div>

            {activeTask && (
                <div className="mb-6 bg-blue-500/15 border border-blue-500/30 rounded-xl p-4">
                    <p className="text-blue-300 text-sm tracking-wider mb-1">当前进行中任务</p>
                    <p className="text-lg font-bold">{activeTask.nodeId}</p>
                    <p className="text-white/60 text-xs">开始时间：{new Date(activeTask.startedAt).toLocaleString()}</p>
                </div>
            )}

            {isFetching ? (
                <div className="flex flex-col items-center justify-center flex-1 text-white/30">
                    <FaTasks className="text-6xl mb-4 opacity-50" />
                    <p className="text-xl tracking-widest mb-2">任务加载中...</p>
                </div>
            ) : missionLists.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-white/30">
                    <FaTasks className="text-6xl mb-4 opacity-50" />
                    <p className="text-xl tracking-widest mb-2">该系统暂无任务</p>
                    <p className="text-sm">请等待系统管理员发布任务列表</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {missionLists.map((list) => (
                        <div key={list._id} className="bg-white/5 border border-white/10 rounded-xl p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                <div>
                                    <h3 className="text-xl font-bold tracking-wider">{list.title}</h3>
                                    <p className="text-sm text-white/60">{list.description || '暂无描述'}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-1 rounded ${list.listType === 'urgent' ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300'}`}>
                                        {list.listType === 'urgent' ? '紧急任务' : '主线任务'}
                                    </span>
                                    {list.accepted ? (
                                        <span className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-300">已接取</span>
                                    ) : (
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            disabled={isAccepting}
                                            className="bg-[#FFC72C] hover:bg-white text-black px-3 py-1 rounded text-sm font-bold"
                                            onClick={() => handleAcceptMissionList(list._id, list.title)}
                                        >
                                            接取列表
                                        </motion.button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {list.nodes.map((node) => (
                                    <div key={node.nodeId} className="bg-black/30 border border-white/10 rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="font-bold tracking-wider">{node.title}</p>
                                            {node.completed ? (
                                                <span className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-300">已完成</span>
                                            ) : node.isActive ? (
                                                <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-300">进行中</span>
                                            ) : node.failed ? (
                                                <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300">已失败</span>
                                            ) : (
                                                <span className="text-xs px-2 py-1 rounded bg-white/10 text-white/70">未开始</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-white/60 mb-2">{node.description || node.content || '暂无任务描述'}</p>
                                        <p className="text-xs text-white/50 mb-4">预计耗时：{node.timeCostMinutes} 分钟</p>

                                        <div className="flex items-center gap-2">
                                            {!node.completed && !node.isActive && (
                                                <motion.button
                                                    whileHover={{ scale: 1.03 }}
                                                    whileTap={{ scale: 0.97 }}
                                                    disabled={!node.canStart || isStarting}
                                                    className="bg-blue-500 hover:bg-blue-400 text-white px-3 py-1 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                                    onClick={() => handleStartTask(list._id, node.nodeId, node.title)}
                                                >
                                                    <FaPlay /> 开始
                                                </motion.button>
                                            )}

                                            {node.isActive && (
                                                <>
                                                    <motion.button
                                                        whileHover={{ scale: 1.03 }}
                                                        whileTap={{ scale: 0.97 }}
                                                        disabled={isCompleting}
                                                        className="bg-emerald-500 hover:bg-emerald-400 text-black px-3 py-1 rounded text-sm font-bold flex items-center gap-1"
                                                        onClick={() => handleCompleteTask(list._id, node.nodeId, node.title)}
                                                    >
                                                        <FaCheck /> 完成
                                                    </motion.button>
                                                    <motion.button
                                                        whileHover={{ scale: 1.03 }}
                                                        whileTap={{ scale: 0.97 }}
                                                        disabled={isFailing}
                                                        className="bg-red-500 hover:bg-red-400 text-white px-3 py-1 rounded text-sm flex items-center gap-1"
                                                        onClick={() => handleFailTask(list._id, node.nodeId, node.title)}
                                                    >
                                                        <FaTimes /> 失败
                                                    </motion.button>
                                                </>
                                            )}

                                            {node.failed && (
                                                <motion.button
                                                    whileHover={{ scale: 1.03 }}
                                                    whileTap={{ scale: 0.97 }}
                                                    disabled={!node.canRestart || isRestarting}
                                                    className="bg-purple-500 hover:bg-purple-400 text-white px-3 py-1 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                                    onClick={() => handleRestartTask(list._id, node.nodeId, node.title)}
                                                >
                                                    <FaRedo /> 重开
                                                </motion.button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-6 bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                    <FaHistory className="text-white/60" />
                    <h3 className="text-lg font-bold tracking-wider">任务历史</h3>
                </div>
                {sortedHistory.length === 0 ? (
                    <p className="text-sm text-white/50">暂无任务历史</p>
                ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {sortedHistory.map((item) => (
                            <div key={item._id} className="bg-black/20 border border-white/10 rounded px-3 py-2 text-sm">
                                <p className="font-bold text-white/90">{item.taskTitle || item.eventType}</p>
                                <p className="text-white/60 text-xs">{item.eventType} · {new Date(item.timestamp).toLocaleString()}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

export default SystemTasks;
