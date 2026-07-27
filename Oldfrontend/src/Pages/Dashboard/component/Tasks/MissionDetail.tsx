import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Mission, StoreProduct } from '../../../../Types/System';
import { getRarityLabel } from '@timeplan-game/core/economy/rarity';
import { FaPlay, FaCheck, FaTimes, FaRedo, FaGift, FaMapMarkerAlt, FaLock, FaQuestion, FaCrown, FaLink, FaStar, FaHourglassHalf } from 'react-icons/fa';
import { goldIcon } from '../../../../assets';
import RewardBadge from '../../../../Component/RewardBadge';
import '../pixelDashboard.css';

type ActiveTaskSnapshot = {
    missionListId: string;
    nodeId: string;
    startedAt: string;
} | null;

const pad = (value: number) => String(Math.max(0, Math.floor(value))).padStart(2, '0');

const rarityTextClasses: Record<string, string> = {
    common: 'text-neutral-600 dark:text-white/55 border-neutral-300/60 dark:border-white/15 bg-neutral-100/70 dark:bg-white/5',
    rare: 'text-blue-700 dark:text-blue-200 border-blue-300/70 dark:border-blue-300/25 bg-blue-100/70 dark:bg-blue-400/10',
    epic: 'text-fuchsia-700 dark:text-fuchsia-200 border-fuchsia-300/70 dark:border-fuchsia-300/25 bg-fuchsia-100/70 dark:bg-fuchsia-400/10',
    legendary: 'text-amber-700 dark:text-amber-200 border-amber-300/70 dark:border-amber-300/25 bg-amber-100/70 dark:bg-amber-400/10',
    mythic: 'text-amber-700 dark:text-amber-200 border-amber-300/70 dark:border-amber-300/25 bg-amber-100/70 dark:bg-amber-400/10',
};

const formatHMS = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    return `${pad(safe / 3600)}:${pad((safe % 3600) / 60)}:${pad(safe % 60)}`;
};

const ActiveTaskTimer: React.FC<{
    missionId: string;
    node: Mission['nodes'][number];
    activeTask: ActiveTaskSnapshot;
}> = ({ missionId, node, activeTask }) => {
    const [nowMs, setNowMs] = useState(Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const activeStartedAt = activeTask?.missionListId === missionId && activeTask.nodeId === node.nodeId
        ? activeTask.startedAt
        : node.startedAt;
    const startedAtMs = activeStartedAt ? new Date(activeStartedAt).getTime() : Number.NaN;
    const elapsed = Number.isNaN(startedAtMs)
        ? 0
        : Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
    const required = Math.max(60, Number(node.timeCostMinutes || 1) * 60);
    const remaining = Math.max(0, required - elapsed);
    const overtime = Math.max(0, elapsed - required);
    const isOvertime = overtime > 0;

    return (
        <div className={`pixel-card flex w-full items-center justify-between gap-4 px-4 py-3 ${
            isOvertime
                ? 'pixel-card-urgent text-rose-900 dark:text-rose-50'
                : 'text-emerald-950 dark:text-emerald-50'
        }`}>
            <div className="flex min-w-0 items-center gap-2 text-xs font-black tracking-widest">
                <FaHourglassHalf className={isOvertime ? 'text-rose-500' : 'text-emerald-500'} />
                <span>{isOvertime ? '已超时' : '倒计时'}</span>
            </div>
            <div className={`shrink-0 font-mono text-lg font-black ${
                isOvertime
                    ? 'text-rose-600 dark:text-rose-300'
                    : 'text-emerald-700 dark:text-emerald-300'
            }`}>
                {isOvertime ? `+${formatHMS(overtime)}` : formatHMS(remaining)}
            </div>
        </div>
    );
};

interface MissionDetailProps {
    mission: Mission | null;
    storeProducts: StoreProduct[];
    activeTask: ActiveTaskSnapshot;
    handleAcceptMissionList: (missionListId: string, title: string) => void;
    handleStartTask: (missionListId: string, nodeId: string, title: string) => void;
    handleCompleteTask: (missionListId: string, nodeId: string, title: string) => void;
    handleFailTask: (missionListId: string, nodeId: string, title: string) => void;
    handleRestartTask: (missionListId: string, nodeId: string, title: string) => void;
    isAccepting: boolean;
    isCompleting: boolean;
    isFailing: boolean;
    isStarting: boolean;
    isRestarting: boolean;
}

const MissionDetail: React.FC<MissionDetailProps> = ({
    mission,
    storeProducts,
    activeTask,
    handleAcceptMissionList,
    handleStartTask,
    handleCompleteTask,
    handleFailTask,
    handleRestartTask,
    isAccepting,
    isCompleting,
    isFailing,
    isStarting,
    isRestarting,
}) => {
    const findItemByKey = (itemKey: string): StoreProduct | undefined => {
        return storeProducts.find((product) => product._id === itemKey);
    };

    if (!mission) {
        return (
            <div className="pixel-empty h-full w-full flex items-center justify-center">
                <div className="text-center">
                    <FaMapMarkerAlt className="text-6xl mb-4 mx-auto opacity-20" />
                    <p className="text-lg font-bold tracking-widest">请先选择一个委托</p>
                </div>
            </div>
        );
    }

    const { listType, title, description, accepted, nodes = [] } = mission;
    const isUrgent = listType === 'urgent';
    const visibleNodes = nodes.filter((node) => !node.completed);
    const nodeTitleMap = new Map(nodes.map((node) => [node.nodeId, node.title]));
    const isFullyCompleted = accepted && nodes.length > 0 && nodes.every((node) => node.completed);

    const jumpToNode = (nodeId: string) => {
        const target = document.getElementById(`mission-node-${nodeId}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    return (
        <div className="pixel-section relative h-full w-full flex flex-col overflow-hidden group">
            <div className="pixel-page-header relative z-10 overflow-hidden min-h-[180px] flex flex-col justify-end">
                <div className="relative z-10 px-8 pt-8 pb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <span className={`pixel-chip text-[10px] font-black uppercase tracking-widest px-2 py-0.5 flex items-center gap-1.5 ${
                            isUrgent
                                ? 'text-red-700'
                                : ''
                        }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${isUrgent ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
                            {isUrgent ? '紧急委托' : '主线委托'}
                        </span>
                        <span className="text-xs font-bold text-neutral-500 dark:text-white/40 tracking-widest flex items-center gap-1 drop-shadow-sm">
                            <FaMapMarkerAlt /> 委托追踪
                        </span>
                    </div>
                    <h2 className="pixel-page-title text-3xl font-black mb-3">{title}</h2>
                    <p className="pixel-page-subtitle text-sm font-medium leading-relaxed max-w-2xl">
                        {description || '当前委托还没有更多说明。'}
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 z-10">
                <AnimatePresence mode="wait">
                    {!accepted ? (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="pixel-empty flex flex-col items-center justify-center p-12"
                        >
                            <FaLock className="text-4xl text-neutral-400 dark:text-white/30 mb-4" />
                            <p className="text-sm font-bold text-neutral-500 dark:text-white/50 tracking-widest mb-6 px-10 text-center">
                                你目前尚未接取该委托，接取后才能开始推进其中的任务节点。
                            </p>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                disabled={isAccepting}
                                className={`pixel-button pixel-button-primary px-8 py-3 text-sm font-black tracking-widest transition-all disabled:opacity-50 ${
                                    isUrgent
                                        ? 'pixel-card-urgent'
                                        : ''
                                }`}
                                onClick={() => handleAcceptMissionList(mission._id, mission.title)}
                            >
                                接取委托
                            </motion.button>
                        </motion.div>
                    ) : isFullyCompleted ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center p-12 text-neutral-500 dark:text-amber-500/50">
                            <FaCheck className="text-6xl mb-4 opacity-50 drop-shadow-md" />
                            <p className="text-xl font-black tracking-widest">委托已完成</p>
                            <p className="text-sm font-bold opacity-60 mt-2">这条任务线已经全部推进完成。</p>
                        </motion.div>
                    ) : visibleNodes.length === 0 ? (
                        <div className="text-center py-10 opacity-50">
                            <p className="text-sm font-bold tracking-widest">暂无未完成节点</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {visibleNodes.map((node) => (
                                <motion.div
                                    key={node.nodeId}
                                    id={`mission-node-${node.nodeId}`}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={`pixel-card p-6 ${node.isLocked ? '' : 'pixel-card-selected'}`}
                                >
                                    <div className="flex items-center justify-between gap-4 mb-3">
                                        <h3 className="text-lg font-bold text-neutral-800 dark:text-white flex items-center gap-2">
                                            {node.isLocked ? <FaLock className="text-[10px] text-slate-500" /> : <FaPlay className="text-[10px] text-amber-500" />}
                                            {node.title}
                                        </h3>
                                        <div className="flex items-center gap-2 flex-wrap justify-end">
                                            {node.isMergeNode && (
                                                <span className={`pixel-chip text-[10px] font-black tracking-widest uppercase px-2 py-0.5 flex items-center gap-1 ${
                                                    node.mergeTier === 'boss'
                                                        ? 'text-fuchsia-700'
                                                        : ''
                                                }`}>
                                                    {node.mergeTier === 'boss' ? <FaCrown className="text-[10px]" /> : <FaStar className="text-[10px]" />}
                                                    {node.mergeTier === 'boss' ? 'Boss 节点' : '里程碑节点'}
                                                </span>
                                            )}
                                            <span className="pixel-chip text-[10px] font-bold tracking-widest uppercase px-2 py-0.5">
                                                {node.timeCostMinutes} min
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-sm text-neutral-600 dark:text-white/70 leading-relaxed mb-6">
                                        {node.description || node.content || '暂无描述，你可以将它视作这一阶段的目标。'}
                                    </p>

                                    {node.isLocked && (
                                        <div className="pixel-empty mb-6 px-4 py-3">
                                            <p className="text-xs font-black tracking-widest text-slate-600 dark:text-slate-300 mb-2">
                                                该节点暂未解锁，需要先完成以下前置条件
                                            </p>
                                            {node.isMergeNode && (
                                                <div className="pixel-card mb-3 px-3 py-2 text-xs">
                                                    <div className="flex items-center gap-2 font-black tracking-widest mb-1">
                                                        <FaLink className="text-[11px]" />
                                                        合流解锁条件
                                                    </div>
                                                    <div>
                                                        当前进度 {node.completedPrerequisiteCount || 0}/{node.totalPrerequisiteCount || 0}
                                                        {node.completedPrerequisiteTitles && node.completedPrerequisiteTitles.length > 0 ? `：${node.completedPrerequisiteTitles.join('、')}` : ''}
                                                    </div>
                                                    <div className="mt-1">
                                                        仍需完成 {node.remainingPrerequisiteCount || 0} 项：{(node.blockedByTitles || []).join('、')}
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                {(node.blockedByNodeIds || []).map((blockedNodeId, index) => (
                                                    <button
                                                        key={blockedNodeId}
                                                        onClick={() => jumpToNode(blockedNodeId)}
                                                        className="pixel-button text-xs px-2.5 py-1 transition-colors"
                                                    >
                                                        {(node.blockedByTitles && node.blockedByTitles[index]) || nodeTitleMap.get(blockedNodeId) || blockedNodeId}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {!node.isLocked && node.isMergeNode && (
                                        <div className={`pixel-card mb-6 px-4 py-3 ${
                                            node.mergeTier === 'boss'
                                                ? 'pixel-card-urgent'
                                                : ''
                                        }`}>
                                            <div className={`text-xs font-black tracking-widest mb-2 flex items-center gap-2 ${
                                                node.mergeTier === 'boss' ? 'text-fuchsia-700 dark:text-fuchsia-200' : 'text-amber-700 dark:text-amber-200'
                                            }`}>
                                                {node.mergeTier === 'boss' ? <FaCrown /> : <FaStar />}
                                                {node.mergeTier === 'boss' ? 'Boss 合流节点已解锁' : '里程碑节点已解锁'}
                                            </div>
                                            <p className="text-xs text-neutral-600 dark:text-white/70 leading-relaxed">
                                                这是一个合流节点，需要前置分支全部完成后才会解锁。你已经抵达关键进度，可以继续向更高阶段推进了。
                                            </p>
                                        </div>
                                    )}

                                    {node.rewards && ((node.rewards.coins ?? 0) > 0 || (node.rewards.experience && node.rewards.experience.length > 0) || (node.rewards.items && node.rewards.items.length > 0)) && (
                                        <div className="mb-6 flex flex-col gap-2">
                                            <p className="text-[11px] font-bold text-neutral-500 dark:text-white/40 tracking-widest flex items-center gap-1">
                                                <FaGift className="text-amber-500" />
                                                完成奖励
                                                {node.rarity && (
                                                    <span className={`ml-1 rounded-full border px-1.5 py-0.5 text-[10px] tracking-wider ${rarityTextClasses[node.rarity] || rarityTextClasses.common}`}>
                                                        {getRarityLabel(node.rarity)}
                                                    </span>
                                                )}
                                            </p>
                                            {node.rewardReason && (
                                                <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-white/45">
                                                    {node.rewardReason}
                                                </p>
                                            )}
                                            <div className="flex gap-4 overflow-x-auto pb-2 pt-2 px-1 -mx-1 scrollbar-hide">
                                                {(node.rewards.coins ?? 0) > 0 && (
                                                    <RewardBadge
                                                        theme="amber"
                                                        icon={<img src={goldIcon} alt="Gold Coin" className="w-full h-full object-contain drop-shadow-sm" />}
                                                        value={node.rewards.coins ?? 0}
                                                        tooltipTitle="金币奖励"
                                                        tooltipDesc="完成该节点后可获得的金币奖励。"
                                                    />
                                                )}
                                                {node.rewards.experience?.map((exp, idx) => (
                                                    <RewardBadge
                                                        key={`exp-${idx}`}
                                                        theme="purple"
                                                        label={exp.name.substring(0, 2)}
                                                        value={exp.value}
                                                        tooltipTitle={`属性经验：${exp.name}`}
                                                        tooltipDesc={`完成该目标后可提升 ${exp.name} ${exp.value} 点成长经验。`}
                                                    />
                                                ))}
                                                {node.rewards.items?.map((item, idx) => {
                                                    const itemData = findItemByKey(item.itemKey);
                                                    const itemName = itemData?.name || item.itemKey;
                                                    const itemRarity = itemData?.rarity || 'common';
                                                    const itemImage = itemData?.image;

                                                    return (
                                                        <RewardBadge
                                                            key={`item-${idx}`}
                                                            rarity={itemRarity}
                                                            icon={itemImage ? <img src={itemImage} alt={itemName} className="w-full h-full object-contain drop-shadow-sm" /> : <FaQuestion className="text-neutral-400" />}
                                                            value={`x${item.quantity}`}
                                                            tooltipTitle={`道具：${itemName}`}
                                                            tooltipDesc={`数量：${item.quantity}\n稀有度：${itemData?.rarity || '未知'}\n${itemData?.description || '查看详情可获得更多信息。'}`}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {node.isMergeNode && node.mergeBonusPreview && (((node.mergeBonusPreview.coins ?? 0) > 0) || (node.mergeBonusPreview.experience?.length || 0) > 0) && (
                                        <div className={`pixel-card mb-6 px-4 py-3 ${
                                            node.mergeTier === 'boss'
                                                ? 'pixel-card-urgent'
                                                : ''
                                        }`}>
                                            <div className={`text-xs font-black tracking-widest mb-2 flex items-center gap-2 ${
                                                node.mergeTier === 'boss' ? 'text-fuchsia-700 dark:text-fuchsia-200' : 'text-amber-700 dark:text-amber-200'
                                            }`}>
                                                <FaGift />
                                                合流额外奖励
                                            </div>
                                            <div className="flex flex-wrap gap-3 text-xs text-neutral-700 dark:text-white/80">
                                                {(node.mergeBonusPreview.coins ?? 0) > 0 && <span>金币 +{node.mergeBonusPreview.coins}</span>}
                                                {(node.mergeBonusPreview.experience || []).map((exp, index) => (
                                                    <span key={`${exp.name}-${index}`}>{exp.name} +{exp.value}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap items-center gap-3">
                                        {node.isActive && (
                                            <ActiveTaskTimer
                                                missionId={mission._id}
                                                node={node}
                                                activeTask={activeTask}
                                            />
                                        )}

                                        {!node.completed && !node.isActive && node.canStart && (
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                disabled={isStarting}
                                                className="pixel-button pixel-button-primary px-5 py-2 text-xs font-bold tracking-widest flex items-center gap-2 disabled:opacity-50"
                                                onClick={() => handleStartTask(mission._id, node.nodeId, node.title)}
                                            >
                                                <FaPlay className="text-xs" /> 开始任务
                                            </motion.button>
                                        )}

                                        {node.isActive && (
                                            <>
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    disabled={isCompleting}
                                                    className="pixel-button pixel-button-primary px-5 py-2 text-xs font-black tracking-widest flex items-center gap-2 disabled:opacity-50"
                                                    onClick={() => handleCompleteTask(mission._id, node.nodeId, node.title)}
                                                >
                                                    <FaCheck className="text-xs" /> 完成任务
                                                </motion.button>
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    disabled={isFailing}
                                                    className="pixel-button px-5 py-2 text-xs font-bold tracking-widest flex items-center gap-2 disabled:opacity-50"
                                                    onClick={() => handleFailTask(mission._id, node.nodeId, node.title)}
                                                >
                                                    <FaTimes className="text-xs" /> 标记失败
                                                </motion.button>
                                            </>
                                        )}

                                        {node.failed && node.canRestart && (
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                disabled={isRestarting}
                                                className="pixel-button px-5 py-2 text-xs font-bold tracking-widest flex items-center gap-2 disabled:opacity-50"
                                                onClick={() => handleRestartTask(mission._id, node.nodeId, node.title)}
                                            >
                                                <FaRedo className="text-xs" /> 重新挑战
                                            </motion.button>
                                        )}

                                        {node.isLocked && (
                                            <span className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-300">
                                                等待前置任务完成后解锁
                                            </span>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default MissionDetail;
