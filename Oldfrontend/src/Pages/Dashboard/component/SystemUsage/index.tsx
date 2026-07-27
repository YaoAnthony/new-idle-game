import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { message } from 'antd';
import { FaArrowLeft, FaCoins, FaBox, FaChartBar, FaStore, FaGamepad } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import { patchSystemProducts, patchSystemLotteryPools } from '../../../../Redux/Features/systemSlice';
import { getEnv } from '../../../../config/env';
import type { StoreProduct } from '../../../../Types/System';
import type { LotteryPool } from '../../../../Types/Lottery';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import { useGetMemberTaskCenterQuery, useGetMemberCurrentTaskQuery, useLazyGetSystemListQuery } from '../../../../api/systemRtkApi';
import ExistSystemBtn from '../ExistSystemBtn';
/**
 * SystemUsage - 系统成员个人状态页面
 * 显示用户在该系统中的属性、金币、背包等个人信息
 */
const SystemUsage: React.FC = () => {
    const { systemId } = useParams<{ systemId: string }>();
    const navigate = useNavigate();
    
    const systems = useSelector((state: RootState) => state.system.systems);
    const profile = useSelector((state: RootState) => state.profile.profile);
    const accessToken = useSelector((state: RootState) => state.user.accessToken);
    const currentSystem = systems.find(sys => sys._id === systemId);


    const dispatch = useDispatch();
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const { data: currentTaskData, refetch: refetchCurrentTask } = useGetMemberCurrentTaskQuery(
        { systemId: systemId || '' },
        { skip: !systemId }
    );
    const { data: taskCenterData, refetch: refetchTaskCenter } = useGetMemberTaskCenterQuery(
        { systemId: systemId || '' },
        { skip: !systemId }
    );

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

                if (payload.type === 'store_products_updated' && payload.systemId === systemId) {
                    dispatch(patchSystemProducts({
                        systemId: payload.systemId as string,
                        storeProducts: payload.storeProducts as StoreProduct[],
                    }));
                } else if (payload.type === 'lottery_pools_updated' && payload.systemId === systemId) {
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
                    refetchTaskCenter();
                    refetchCurrentTask();
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
                console.error('SystemUsage update SSE parse error:', error);
            }
        },
    });


    if (!currentSystem) {
        return null;
    }

    const missionLists = taskCenterData?.missionLists || [];
    const totalNodes = missionLists.reduce((sum, list) => sum + (list.nodes?.length || 0), 0);
    const completedNodes = missionLists.reduce(
        (sum, list) => sum + (list.nodes?.filter((node) => node.completed).length || 0),
        0
    );
    const activeTask = currentTaskData?.activeTask || null;

    return (
        <section className="w-full h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md overflow-auto text-white font-sans select-none p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => navigate('/dashboard/idle-game')}
                        className="text-white/70 hover:text-[#FFC72C] transition-colors"
                    >
                        <FaArrowLeft className="text-xl" />
                    </motion.button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-widest">
                            {currentSystem.name}
                        </h1>
                        <p className="text-white/50 text-sm tracking-wider mt-1">
                            我在该系统中的个人信息
                        </p>
                    </div>
                </div>

                {/* Exit Button */}
                <ExistSystemBtn />
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Coins */}
                <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-xl p-6"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <FaCoins className="text-3xl text-yellow-400" />
                        <h3 className="text-lg font-bold tracking-wider text-yellow-300">金币</h3>
                    </div>
                    <p className="text-4xl font-bold tracking-wider">
                        {typeof profile?.wallet === 'number' ? profile.wallet : profile?.wallet?.coins || 0}
                    </p>
                    <p className="text-white/50 text-sm mt-2">可用于购买商品和参与活动</p>
                </motion.div>

                {/* Tasks Progress */}
                <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-xl p-6"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <FaChartBar className="text-3xl text-blue-400" />
                        <h3 className="text-lg font-bold tracking-wider text-blue-300">任务进度</h3>
                    </div>
                    <p className="text-4xl font-bold tracking-wider">{completedNodes} / {totalNodes}</p>
                    <p className="text-white/50 text-sm mt-2">已完成 / 总任务数</p>
                </motion.div>

                {/* Inventory */}
                <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-xl p-6"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <FaBox className="text-3xl text-purple-400" />
                        <h3 className="text-lg font-bold tracking-wider text-purple-300">背包物品</h3>
                    </div>
                    <p className="text-4xl font-bold tracking-wider">0</p>
                    <p className="text-white/50 text-sm mt-2">已拥有的物品数量</p>
                </motion.div>
            </div>

            {activeTask && (
                <div className="bg-blue-500/15 border border-blue-500/30 rounded-xl p-6 mb-6">
                    <h2 className="text-xl font-bold tracking-widest mb-2 text-blue-300">正在执行任务</h2>
                    <p className="text-lg font-bold">{activeTask.nodeTitle || activeTask.nodeId}</p>
                    <p className="text-white/60 text-sm mt-1">所属列表：{activeTask.missionListTitle || '-'}</p>
                    <p className="text-white/60 text-sm">预计耗时：{activeTask.timeCostMinutes || 0} 分钟</p>
                    <p className="text-white/60 text-xs mt-2">开始时间：{new Date(activeTask.startedAt).toLocaleString()}</p>
                </div>
            )}

            {/* Quick Navigation */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
                <h2 className="text-2xl font-bold tracking-widest mb-4">快速导航</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Store Navigation */}
                    {currentSystem.modules?.store && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => navigate(`/dashboard/system/${systemId}/store`)}
                            className="bg-gradient-to-br from-[#FFC72C]/20 to-orange-500/20 border border-[#FFC72C]/30 rounded-xl p-6 text-left hover:border-[#FFC72C] transition-all"
                        >
                            <div className="flex items-center gap-4 mb-2">
                                <FaStore className="text-3xl text-[#FFC72C]" />
                                <h3 className="text-xl font-bold tracking-wider">系统商城</h3>
                            </div>
                            <p className="text-white/60 text-sm">浏览并购买系统商品</p>
                        </motion.button>
                    )}

                    {/* Tasks Navigation */}
                    {currentSystem.modules?.taskChain && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => navigate(`/dashboard/system/${systemId}/tasks`)}
                            className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-xl p-6 text-left hover:border-blue-500 transition-all"
                        >
                            <div className="flex items-center gap-4 mb-2">
                                <FaGamepad className="text-3xl text-blue-400" />
                                <h3 className="text-xl font-bold tracking-wider">任务大厅</h3>
                            </div>
                            <p className="text-white/60 text-sm">接取任务并完成挑战</p>
                        </motion.button>
                    )}
                </div>
            </div>

            {/* Attributes Section */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <h2 className="text-2xl font-bold tracking-widest mb-6">六维属性</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {['力量', '体质', '敏捷', '智力', '感知', '魅力'].map((attr, index) => (
                        <div key={index} className="bg-white/5 border border-white/10 rounded-lg p-4">
                            <p className="text-white/70 text-sm tracking-wider mb-2">{attr}</p>
                            <p className="text-2xl font-bold">0</p>
                            <div className="mt-2 w-full bg-white/10 rounded-full h-2">
                                <div className="bg-[#FFC72C] h-2 rounded-full" style={{ width: '0%' }}></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Inventory Preview */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mt-6">
                <h2 className="text-2xl font-bold tracking-widest mb-4">我的背包</h2>
                <div className="flex items-center justify-center h-32 text-white/30">
                    <div className="text-center">
                        <FaBox className="text-5xl mb-2 opacity-50 mx-auto" />
                        <p className="text-lg tracking-widest">背包为空</p>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default SystemUsage;
