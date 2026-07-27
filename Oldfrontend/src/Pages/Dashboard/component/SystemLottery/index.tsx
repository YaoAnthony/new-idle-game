import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Modal, message } from 'antd';
import { FaDice, FaScroll, FaShieldAlt, FaStar, FaGem } from 'react-icons/fa';
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceDot,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import { RootState } from '../../../../Redux/store';
import { patchSystemLotteryPools } from '../../../../Redux/Features/systemSlice';
import { getEnv } from '../../../../config/env';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import {
    useDrawLotteryPoolMutation,
    useGetMemberLotteryHistoryQuery,
    useGetMemberLotteryPityQuery,
    useLazyGetSystemListQuery,
} from '../../../../api/systemRtkApi';
import { useLazyGetProfileAndUserQuery } from '../../../../api/profileApi';
import { useLazyGetProfileStateQuery } from '../../../../api/profileStateRtkApi';

import { DrawResult, GenshinTier, LotteryHistoryRecord, LotteryPool, TierPity } from '../../../../Types/Lottery';
import GachaAnimation from './GachaAnimation';

// ─── Tier display meta ────────────────────────────────────────────────────────
const TIER_META = [
    { index: 0, label: '限定', color: 'text-yellow-300', bg: 'bg-yellow-500/15', border: 'border-yellow-400/30', icon: <FaStar className="text-yellow-400" /> },
    { index: 1, label: '精锐', color: 'text-purple-300', bg: 'bg-purple-500/15', border: 'border-purple-400/30', icon: <FaGem className="text-purple-400" /> },
    { index: 2, label: '普通', color: 'text-gray-400',   bg: 'bg-white/5',        border: 'border-white/10',      icon: <FaDice className="text-gray-400" /> },
];

// ─── History panel ────────────────────────────────────────────────────────────
const HISTORY_RARITY_META = {
    featured: {
        label: '限定',
        accent: '#f8c14a',
        glow: 'rgba(248,193,74,0.28)',
        icon: <FaStar />,
    },
    refined: {
        label: '精锐',
        accent: '#b78cff',
        glow: 'rgba(183,140,255,0.22)',
        icon: <FaGem />,
    },
    won: {
        label: '获得',
        accent: '#7dd3fc',
        glow: 'rgba(125,211,252,0.18)',
        icon: <FaDice />,
    },
    missed: {
        label: '未中',
        accent: '#94a3b8',
        glow: 'rgba(148,163,184,0.12)',
        icon: <FaDice />,
    },
};

const getHistoryRarityMeta = (record: LotteryHistoryRecord) => {
    if (record.tierIndex === 0) return HISTORY_RARITY_META.featured;
    if (record.tierIndex === 1) return HISTORY_RARITY_META.refined;
    if (record.won) return HISTORY_RARITY_META.won;
    return HISTORY_RARITY_META.missed;
};

const formatHistoryTime = (value: string) => {
    const time = new Date(value);
    if (Number.isNaN(time.getTime())) return '';
    return time.toLocaleString([], {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const HistoryPanel: React.FC<{ records: LotteryHistoryRecord[] }> = ({ records }) => (
    <div
        style={{
            border: '1px solid rgba(255,199,44,0.18)',
            background:
                'linear-gradient(180deg, rgba(7,7,22,0.88), rgba(13,10,32,0.78)), repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 8px)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05), 0 18px 50px rgba(0,0,0,0.32)',
        }}
        className="rounded-2xl p-3 sm:p-4"
    >
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-yellow-200/10 pb-3">
            <div>
                <p className="text-[0.65rem] font-black tracking-[0.3em] text-yellow-200/50">WISH ARCHIVE</p>
                <h3 className="mt-1 text-sm font-black tracking-widest text-yellow-100">祈愿历史</h3>
            </div>
            <span className="rounded-lg border border-yellow-200/20 bg-yellow-200/10 px-3 py-1 text-xs font-bold text-yellow-100/80">
                {records.length} 条
            </span>
        </div>

        {records.length === 0 ? (
            <div className="grid min-h-48 place-items-center rounded-xl border border-white/10 bg-black/20 px-6 py-10 text-center">
                <div>
                    <FaScroll className="mx-auto mb-3 text-3xl text-yellow-200/50" />
                    <p className="text-sm font-bold tracking-widest text-yellow-100/75">暂无祈愿记录</p>
                    <p className="mt-2 text-xs text-slate-300/60">开始抽取后，这里会保存每一次结果。</p>
                </div>
            </div>
        ) : (
            <div className="max-h-[calc(85vh-170px)] space-y-2 overflow-y-auto pr-1 scrollbar-hide">
                {records.map((record, index) => {
                    const meta = getHistoryRarityMeta(record);
                    const rewardName = record.reward?.productName || '未获得奖励';
                    const quantity = record.reward?.quantity ?? 1;
                    return (
                        <motion.div
                            key={record._id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.18, delay: Math.min(index * 0.015, 0.18) }}
                            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-3"
                            style={{
                                border: `1px solid ${meta.accent}55`,
                                background:
                                    'linear-gradient(180deg, rgba(15,23,42,0.86), rgba(3,7,18,0.72))',
                                boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.045), 0 0 24px ${meta.glow}`,
                            }}
                        >
                            <div
                                className="grid h-10 w-10 place-items-center rounded-lg text-sm"
                                style={{
                                    border: `1px solid ${meta.accent}77`,
                                    background: `linear-gradient(180deg, ${meta.accent}28, rgba(2,6,23,0.75))`,
                                    color: meta.accent,
                                    boxShadow: `0 0 18px ${meta.glow}`,
                                }}
                            >
                                {meta.icon}
                            </div>

                            <div className="min-w-0">
                                <div className="mb-1 flex min-w-0 items-center gap-2">
                                    <span
                                        className="shrink-0 rounded border px-1.5 py-0.5 text-[0.62rem] font-black tracking-widest"
                                        style={{
                                            borderColor: `${meta.accent}66`,
                                            color: meta.accent,
                                            background: `${meta.accent}16`,
                                        }}
                                    >
                                        {meta.label}
                                    </span>
                                    <p className="truncate text-sm font-bold text-slate-50">
                                        {record.won ? `${rewardName} ×${quantity}` : rewardName}
                                    </p>
                                </div>
                                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-slate-300/60">
                                    <span className="truncate">卡池：{record.poolName}</span>
                                    <span>{formatHistoryTime(record.createdAt)}</span>
                                </div>
                            </div>

                            <div className="text-right">
                                <p className="text-[0.62rem] font-bold tracking-widest text-slate-400/70">ROLL</p>
                                <p className="font-mono text-xs font-bold text-yellow-100/80">
                                    {Number(record.randomValue).toFixed(3)}
                                </p>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        )}
    </div>
);

type RewardPreview = {
    key: string;
    name: string;
    quantity: number;
    label: string;
    accent: string;
    glow: string;
    subtitle: string;
};

const getRewardPreviewMeta = (tierIndex?: number | null) => {
    if (tierIndex === 0) {
        return {
            label: '限定 UP',
            accent: '#f8c14a',
            glow: 'rgba(248,193,74,0.36)',
            subtitle: '本期核心奖励',
        };
    }
    if (tierIndex === 1) {
        return {
            label: '精锐 UP',
            accent: '#b78cff',
            glow: 'rgba(183,140,255,0.28)',
            subtitle: '高阶奖励',
        };
    }
    return {
        label: '常驻奖励',
        accent: '#7dd3fc',
        glow: 'rgba(125,211,252,0.2)',
        subtitle: '池内掉落',
    };
};

const getRewardPreviews = (pool: LotteryPool): RewardPreview[] => {
    if (pool.drawMode === 'genshin') {
        return [...(pool.genshinTiers || [])]
            .sort((a, b) => a.tierIndex - b.tierIndex)
            .flatMap((tier) => tier.items.map((item) => {
                const meta = getRewardPreviewMeta(tier.tierIndex);
                return {
                    key: `${tier.tierIndex}-${item._id}`,
                    name: item.name,
                    quantity: item.quantity,
                    ...meta,
                };
            }));
    }

    return (pool.prizes || []).map((prize) => {
        const meta = getRewardPreviewMeta(prize.probability >= 0.08 ? 2 : 1);
        return {
            key: prize._id,
            name: prize.name,
            quantity: prize.quantity,
            ...meta,
        };
    });
};

// ─── Main component ────────────────────────────────────────────────────────────
type PityCurvePoint = {
    pull: number;
    rate: number;
};

const clampProbability = (value: number) => Math.max(0, Math.min(1, value));

const getPityRateAtPull = (tier: GenshinTier, pull: number) => {
    const hardLimit = Math.max(1, Math.round(tier.hardPityLimit || 90));
    const softStart = Math.min(hardLimit, Math.max(1, Math.round(tier.softPityStart || 74)));
    const baseRate = clampProbability(Number(tier.baseRate || 0));
    const softIncrement = Math.max(0, Number(tier.softPityIncrement || 0));
    const safePull = Math.max(1, Math.round(pull));

    if (safePull >= hardLimit) return 1;
    if (safePull < softStart) return baseRate;

    const softWindow = Math.max(1, hardLimit - softStart);
    const progress = Math.min(1, Math.max(0, (safePull - softStart + 1) / softWindow));
    const easedProgress = progress * progress * (3 - 2 * progress);
    const preHardRate = clampProbability(baseRate + softWindow * softIncrement);

    return clampProbability(baseRate + (preHardRate - baseRate) * easedProgress);
};

const buildPityCurve = (tier: GenshinTier): PityCurvePoint[] => {
    const hardLimit = Math.max(1, Math.round(tier.hardPityLimit || 90));
    return Array.from({ length: hardLimit }, (_, index) => {
        const pull = index + 1;
        return {
            pull,
            rate: Number((getPityRateAtPull(tier, pull) * 100).toFixed(2)),
        };
    });
};

const PityCurveChart: React.FC<{ tier: GenshinTier | null; currentPullCount: number }> = ({ tier, currentPullCount }) => {
    if (!tier) return null;

    const hardLimit = Math.max(1, Math.round(tier.hardPityLimit || 90));
    const softStart = Math.min(hardLimit, Math.max(1, Math.round(tier.softPityStart || 74)));
    const nextPull = Math.min(hardLimit, Math.max(1, Math.round(currentPullCount + 1)));
    const chartData = buildPityCurve(tier);
    const nextRate = Number((getPityRateAtPull(tier, nextPull) * 100).toFixed(2));
    const preHardRate = Number((getPityRateAtPull(tier, Math.max(1, hardLimit - 1)) * 100).toFixed(1));

    return (
        <div className="mt-4 rounded-2xl border border-yellow-100/15 bg-slate-950/45 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-[0.62rem] font-black tracking-[0.22em] text-yellow-100/55">PITY RATE CURVE</p>
                    <p className="mt-1 text-xs font-bold text-slate-100/80">最高奖励出货概率</p>
                </div>
                <span className="rounded-lg border border-cyan-200/25 bg-cyan-200/10 px-2 py-1 font-mono text-[0.65rem] font-black text-cyan-100">
                    下一抽 {nextRate.toFixed(2)}%
                </span>
            </div>

            <div className="h-44 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -18, bottom: 2 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis
                            dataKey="pull"
                            type="number"
                            domain={[1, hardLimit]}
                            tick={{ fill: 'rgba(226,232,240,0.58)', fontSize: 10 }}
                            axisLine={{ stroke: 'rgba(255,255,255,0.14)' }}
                            tickLine={false}
                            tickCount={5}
                        />
                        <YAxis
                            domain={[0, 100]}
                            ticks={[0, 25, 50, 75, 100]}
                            tickFormatter={(value: number) => `${value}%`}
                            tick={{ fill: 'rgba(226,232,240,0.58)', fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            cursor={{ stroke: '#f8c14a', strokeWidth: 1, strokeDasharray: '4 4' }}
                            contentStyle={{
                                border: '1px solid rgba(248,193,74,0.38)',
                                borderRadius: 12,
                                background: 'rgba(2,6,23,0.94)',
                                color: '#f8fafc',
                                boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
                            }}
                            labelFormatter={(label: string | number) => `第 ${label} 抽`}
                            formatter={(value: number | string) => [`${Number(value).toFixed(2)}%`, '概率']}
                        />
                        <ReferenceLine
                            x={softStart}
                            stroke="#f8c14a"
                            strokeDasharray="5 5"
                            label={{ value: '软保底', position: 'insideTopRight', fill: '#fde68a', fontSize: 10 }}
                        />
                        <ReferenceLine
                            x={hardLimit}
                            stroke="#fef3c7"
                            strokeDasharray="3 4"
                            label={{ value: '硬保底', position: 'insideTopRight', fill: '#fef3c7', fontSize: 10 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="rate"
                            name="出货概率"
                            stroke="#f8c14a"
                            strokeWidth={3}
                            dot={false}
                            activeDot={{ r: 5, fill: '#fef3c7', stroke: '#f8c14a', strokeWidth: 2 }}
                        />
                        <ReferenceDot
                            x={nextPull}
                            y={nextRate}
                            r={5}
                            fill="#38bdf8"
                            stroke="#f8fafc"
                            strokeWidth={2}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.62rem] font-bold text-slate-300/55">
                <span>基础 {(tier.baseRate * 100).toFixed(2)}%</span>
                <span>软保底 {softStart} 抽</span>
                <span>硬保底 {hardLimit} 抽</span>
                <span>硬保底前约 {preHardRate}%</span>
            </div>
        </div>
    );
};

const getErrorMessage = (error: unknown, fallback: string) => {
    const err = error as { data?: unknown; error?: string; message?: string };
    if (err?.data && typeof err.data === 'object' && 'message' in err.data) {
        const message = (err.data as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) return message;
    }
    if (typeof err?.error === 'string' && err.error.trim()) return err.error;
    if (typeof err?.message === 'string' && err.message.trim()) return err.message;
    return fallback;
};

interface SystemLotteryProps {
    embedded?: boolean;
    systemIdOverride?: string | null;
}

const SystemLottery: React.FC<SystemLotteryProps> = ({ embedded = false, systemIdOverride = null }) => {
    const { systemId: routeSystemId } = useParams<{ systemId: string }>();
    const systemId = systemIdOverride || routeSystemId;
    const navigate = useNavigate();

    const systems = useSelector((state: RootState) => state.system.systems);
    const accessToken = useSelector((state: RootState) => state.user.accessToken);
    const profile = useSelector((state: RootState) => state.profile.profile);
    const currentSystem = systems.find(s => s._id === systemId);

    const [animDraws, setAnimDraws] = useState<DrawResult[] | null>(null);
    const [poolIdx, setPoolIdx] = useState(0);
    const [showHistory, setShowHistory] = useState(false);
    const [showPoolDetails, setShowPoolDetails] = useState(false);

    const dispatch = useDispatch();
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const [triggerGetProfileAndUser] = useLazyGetProfileAndUserQuery();
    const [triggerGetProfileState] = useLazyGetProfileStateQuery();
    const [drawPool, { isLoading: isDrawing }] = useDrawLotteryPoolMutation();

    const { data: historyData, refetch: refetchHistory } = useGetMemberLotteryHistoryQuery(
        { systemId: systemId || '', limit: 50 },
        { skip: !systemId },
    );
    const { data: pityData, refetch: refetchPity } = useGetMemberLotteryPityQuery(
        { systemId: systemId || '' },
        { skip: !systemId },
    );

    useEffect(() => {
        if (systems.length === 0) triggerGetSystemList();
    }, [systems.length, triggerGetSystemList]);

    // SSE
    const { backendUrl } = getEnv();
    const sseUrl = systemId && accessToken
        ? `${backendUrl}/system/${systemId}/updates/events?token=${encodeURIComponent(accessToken)}`
        : null;

    useSSEWithReconnect({
        url: sseUrl,
        enabled: Boolean(systemId && accessToken),
        onMessage: (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (!payload?.type || payload.type === 'connected') return;

                if (payload.type === 'lottery_pools_updated' && payload.systemId === systemId) {
                    // Surgical update — only lotteryPools slice, no full refetch
                    dispatch(patchSystemLotteryPools({
                        systemId: payload.systemId as string,
                        lotteryPools: payload.lotteryPools as LotteryPool[],
                    }));
                } else if (payload.type === 'lottery_pool_draw_executed') {
                    // Draw happened — refresh history + pity (these are per-user queries, not system cache)
                    refetchHistory();
                    refetchPity();
                } else if (payload.type === 'system_deleted') {
                    navigate('/dashboard/idle-game');
                }
            } catch { /* ignore */ }
        },
    });

    if (!currentSystem) return null;

    const pools = ((currentSystem as unknown as { lotteryPools?: LotteryPool[] }).lotteryPools || []);
    const history = (historyData?.history || []) as LotteryHistoryRecord[];
    const pityCounters = pityData?.pityCounters || [];

    const safePoolIdx = Math.min(poolIdx, Math.max(0, pools.length - 1));
    const pool = pools[safePoolIdx] || null;


    // Pity helpers
    const getSimplePity = (poolId: string) => pityCounters.find(c => c.poolId === poolId)?.pullCount ?? 0;
    const getTierPity = (poolId: string, tierIndex: number): TierPity | undefined => {
        const c = pityCounters.find(x => x.poolId === poolId);
        return c?.tierPities?.find(tp => tp.tierIndex === tierIndex);
    };

    // Affordability
    const canAfford = (p: LotteryPool, count: number): boolean => {
        const q = Math.max(1, Number(p.consume?.quantity || 1)) * count;
        if (p.consume?.type === 'coins') return Number(profile?.wallet?.coins ?? 0) >= q;
        if (p.consume?.type === 'item') {
            const owned = Number((profile?.inventory || []).find(i => i.inventoryKey === p.consume?.itemKey)?.quantity || 0);
            return owned >= q;
        }
        return true;
    };

    const consumeLabel = (p: LotteryPool, count: number) => {
        const q = Math.max(1, Number(p.consume?.quantity || 1)) * count;
        if (p.consume?.type === 'coins') return `${q} 金币`;
        if (p.consume?.type === 'item') return `物品 ×${q}`;
        return '免费';
    };

    const hasConfiguredRewards = (p: LotteryPool): boolean => {
        if (p.drawMode === 'genshin') {
            return (p.genshinTiers || []).some(tier => (tier.items || []).length > 0);
        }
        return (p.prizes || []).length > 0;
    };

    const canDraw = (p: LotteryPool, count: 1 | 10): boolean => {
        return hasConfiguredRewards(p) && canAfford(p, count);
    };

    const refreshAfterDraw = () => {
        void Promise.allSettled([
            triggerGetProfileAndUser().unwrap(),
            triggerGetProfileState().unwrap(),
        ]).then((results) => {
            const rejected = results.filter((result) => result.status === 'rejected');
            if (rejected.length > 0) {
                console.warn('[SystemLottery] post-draw profile refresh failed; draw result already applied', rejected);
            }
        });

        refetchHistory();
        refetchPity();
    };

    const handleDraw = async (count: 1 | 10) => {
        if (!pool || !systemId) return;
        try {
            const res = await drawPool({ systemId, poolId: pool._id, count }).unwrap();
            const draws = res.draws ?? (res.draw ? [res.draw] : []);
            console.log('[SystemLottery] draw succeeded', { poolId: pool._id, count, draws });
            if (draws.length) setAnimDraws(draws);
            else {
                message.info('本次未获得奖励');
                refreshAfterDraw();
            }
        } catch (e) {
            console.error('[SystemLottery] draw request failed', e);
            message.error(getErrorMessage(e, '祈愿失败'));
        }
    };

    // ─── Pool info: tiers (genshin) or prizes (simple) ───────────────────────
    const renderPoolInfo = () => {
        if (!pool) return null;
        if (pool.drawMode === 'genshin') {
            const tiers = ([...(pool.genshinTiers || [])].sort((a, b) => a.tierIndex - b.tierIndex)) as GenshinTier[];
            return (
                <div className="space-y-3">
                    {tiers.map(tier => {
                        const meta = TIER_META[tier.tierIndex];
                        if (!meta) return null;
                        const tp = getTierPity(pool._id, tier.tierIndex);
                        const pityPct = tier.tierIndex < 2 && tier.hardPityLimit > 1
                            ? ((tp?.pullCount ?? 0) / tier.hardPityLimit) * 100
                            : 0;
                        const inSoftPity = (tp?.pullCount ?? 0) >= tier.softPityStart;
                        return (
                            <div key={tier.tierIndex} className={`${meta.bg} border ${meta.border} rounded-xl p-3`}>
                                <div className="flex items-center gap-2 mb-2">
                                    {meta.icon}
                                    <span className={`text-sm font-bold ${meta.color}`}>{tier.name || meta.label}</span>
                                    {tier.tierIndex < 2 && (
                                        <span className="ml-auto text-xs text-white/40">
                                            {(tier.baseRate * 100).toFixed(2)}% · {tier.hardPityLimit}抽保底
                                        </span>
                                    )}
                                </div>

                                {/* Items */}
                                {tier.items.length === 0 ? (
                                    <p className="text-xs text-white/25 pl-1">空</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {tier.items.map(item => (
                                            <span key={item._id} className="text-xs bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white/70">
                                                {item.name} ×{item.quantity}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Pity bar (tier 0 and 1 only) */}
                                {tier.tierIndex < 2 && tier.hardPityLimit > 1 && (
                                    <div className="mt-2">
                                        <div className="flex items-center justify-between text-xs text-white/40 mb-1">
                                            <span className="flex items-center gap-1">
                                                <FaShieldAlt className="text-xs" /> 保底
                                                {inSoftPity && <span className="text-yellow-400 ml-1">（软保底中）</span>}
                                            </span>
                                            <span>{tp?.pullCount ?? 0} / {tier.hardPityLimit}</span>
                                        </div>
                                        <div className="h-1 bg-black/30 rounded-full overflow-hidden">
                                            <motion.div className="h-full rounded-full"
                                                style={{ background: inSoftPity ? 'linear-gradient(90deg,#FFC72C,#FFE08C)' : 'linear-gradient(90deg,#818cf8,#a78bfa)' }}
                                                initial={{ width: 0 }} animate={{ width: `${Math.min(100, pityPct)}%` }}
                                                transition={{ duration: 0.6, ease: 'easeOut' }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        }

        // Simple mode
        const prizes = pool.prizes || [];
        return (
            <div className="space-y-2">
                <p className="text-xs text-white/40 tracking-wider mb-2">奖品列表</p>
                {prizes.length === 0 ? (
                    <p className="text-xs text-white/25">该卡池暂无奖品</p>
                ) : prizes.map(p => (
                    <div key={p._id} className="flex items-center gap-2">
                        <span className="text-xs text-white/70 flex-1 truncate">{p.name} ×{p.quantity}</span>
                        <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, p.probability * 100)}%` }} />
                        </div>
                        <span className="text-xs text-white/40 w-10 text-right">{(p.probability * 100).toFixed(1)}%</span>
                    </div>
                ))}

                {/* Simple pity counter */}
                {(() => {
                    const pc = getSimplePity(pool._id);
                    return pc > 0 ? (
                        <p className="text-xs text-white/30 mt-3">本轮已抽 {pc} 次</p>
                    ) : null;
                })()}
            </div>
        );
    };

    const rewardPreviews = pool ? getRewardPreviews(pool) : [];
    const featuredReward = rewardPreviews[0] || null;
    const secondaryRewards = rewardPreviews.slice(1, 6);
    const featuredTier = pool?.drawMode === 'genshin'
        ? (pool.genshinTiers || []).find((tier) => tier.tierIndex === 0)
        : null;
    const featuredPity = pool ? getTierPity(pool._id, 0) : undefined;
    const featuredPityLimit = featuredTier?.hardPityLimit || 0;
    const featuredPityCount = featuredPity?.pullCount ?? getSimplePity(pool?._id || '');
    const featuredPityPct = featuredPityLimit > 0
        ? Math.min(100, (featuredPityCount / featuredPityLimit) * 100)
        : 0;
    const poolModeLabel = pool?.drawMode === 'genshin' ? '角色活动祈愿' : '命运补给';
    const shellHeight = embedded ? '100%' : '85vh';
    const contentHeight = embedded ? 'calc(100% - clamp(46px, 7vh, 66px))' : 'calc(85vh - 80px)';

    // ─── Layout ────────────────────────────────────────────────────────────────
    return (
        <>
            <AnimatePresence>
                {animDraws && (
                    <GachaAnimation
                        key="anim"
                        draws={animDraws}
                        onClose={() => {
                            setAnimDraws(null);
                            refreshAfterDraw();
                        }}
                        onReplay={(count) => {
                            setAnimDraws(null);
                            void handleDraw(count);
                        }}
                        canReplayOne={pool ? !isDrawing && canDraw(pool, 1) : false}
                        canReplayTen={pool ? !isDrawing && canDraw(pool, 10) : false}
                    />
                )}
            </AnimatePresence>

            <Modal
                open={showPoolDetails}
                onCancel={() => setShowPoolDetails(false)}
                footer={null}
                centered
                className="lottery-detail-modal"
                width={1120}
                closeIcon={<span className="text-yellow-100">×</span>}
                title={<span className="text-sm font-black tracking-[0.24em] text-yellow-100">卡池详情</span>}
                styles={{
                    content: {
                        background: 'linear-gradient(180deg, rgba(8,10,28,0.98), rgba(15,23,42,0.96))',
                        border: '1px solid rgba(248,193,74,0.28)',
                        boxShadow: '0 28px 80px rgba(0,0,0,0.58), inset 0 0 0 1px rgba(255,255,255,0.05)',
                    },
                    header: {
                        background: 'transparent',
                        borderBottom: '1px solid rgba(248,193,74,0.16)',
                        paddingBottom: 12,
                    },
                    body: { paddingTop: 18 },
                    mask: { background: 'rgba(2,6,23,0.72)', backdropFilter: 'blur(5px)' },
                }}
            >
                {pool ? (
                    <div className="max-h-[80vh] overflow-y-auto pr-1 text-slate-100 scrollbar-hide">
                        <div className="mb-4 rounded-2xl border border-yellow-200/20 bg-yellow-100/10 p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="flex items-center gap-2 text-xs font-black tracking-widest text-yellow-100">
                                    <FaShieldAlt /> 命运保底
                                </span>
                                <span className="font-mono text-xs font-black text-yellow-100/80">
                                    {featuredPityLimit > 0
                                        ? `${featuredPityCount}/${featuredPityLimit}`
                                        : `${featuredPityCount} 抽`}
                                </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-black/35">
                                <motion.div
                                    className="h-full rounded-full"
                                    style={{
                                        background: 'linear-gradient(90deg,#38bdf8,#f8c14a,#fef3c7)',
                                        boxShadow: '0 0 18px rgba(248,193,74,0.45)',
                                    }}
                                    initial={{ width: 0 }}
                                    animate={{
                                        width: `${featuredPityLimit > 0 ? featuredPityPct : Math.min(100, featuredPityCount * 10)}%`,
                                    }}
                                    transition={{ duration: 0.7, ease: 'easeOut' }}
                                />
                            </div>
                            <p className="mt-3 text-[0.68rem] leading-5 text-slate-200/60">
                                {featuredPityLimit > 0
                                    ? '距离本期最高奖励越来越近，十连会更有仪式感。'
                                    : '当前卡池记录本轮抽取次数。'}
                            </p>
                            <PityCurveChart
                                tier={featuredTier ?? null}
                                currentPullCount={featuredPityCount}
                            />
                        </div>

                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-black tracking-widest text-slate-50">卡池内容</h3>
                            <span className="text-[0.65rem] font-bold tracking-widest text-slate-300/50">
                                DROP RATE
                            </span>
                        </div>
                        {renderPoolInfo()}
                    </div>
                ) : (
                    <p className="py-8 text-center text-sm text-slate-300/60">当前没有可查看的卡池。</p>
                )}
            </Modal>

            {/* Full screen Genshin-style container */}
            <div className="lottery-shell relative w-full overflow-hidden rounded-xl border border-white/10 select-none xl:rounded-2xl"
                style={{
                    height: shellHeight,
                    background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 50%, #0d0d1a 100%)',
                }}>

                {/* Background pool image */}
                {pool?.image && (
                    <motion.div key={pool._id} className="absolute inset-0 pointer-events-none"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
                        <img
                            src={pool.image} alt=""
                            className="w-full h-full object-cover"
                            style={{
                                opacity: 0.5,
                                mixBlendMode: 'normal',
                                filter: 'brightness(0.58) saturate(1.18) contrast(1.05)',
                            }}
                        />
                        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 20%, #0f0c29 80%)' }} />
                    </motion.div>
                )}

                {/* Gold particle dots (CSS only) */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {[...Array(20)].map((_, i) => (
                        <motion.div key={i}
                            className="absolute rounded-full"
                            style={{
                                width: 2 + (i % 3), height: 2 + (i % 3),
                                left: `${5 + i * 4.8}%`, top: `${10 + (i * 17) % 80}%`,
                                background: i % 3 === 0 ? '#FFC72C' : i % 3 === 1 ? '#818cf8' : '#fff',
                                opacity: 0.15 + (i % 5) * 0.07,
                            }}
                            animate={{ y: [-6, 6, -6], opacity: [0.15, 0.45, 0.15] }}
                            transition={{ duration: 3 + (i % 4), repeat: Infinity, delay: i * 0.2 }}
                        />
                    ))}
                </div>

                {/* Top bar */}
                <div className="lottery-topbar relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pb-2 pt-3 sm:gap-3 sm:px-5 sm:pt-4 xl:px-6 xl:pb-3 xl:pt-5">
                    <div aria-hidden="true" />

                    <div className="flex items-center gap-3 justify-self-center">
                        <FaDice className="text-lg text-[#FFC72C] xl:text-2xl" />
                        <h1 className="text-lg font-bold tracking-[0.16em] text-white sm:text-xl xl:text-2xl xl:tracking-[0.2em]"
                            style={{ textShadow: '0 0 20px rgba(255,199,44,0.4)' }}>
                            祈 愿
                        </h1>
                    </div>

                    <div aria-hidden="true" />
                </div>

                <AnimatePresence mode="wait">
                    {showHistory ? (
                        <motion.div key="history" className="relative z-10 overflow-auto px-3 sm:px-5 xl:px-6"
                            style={{ height: contentHeight }}
                            initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }}>
                            <h2 className="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-white/60 xl:mb-4 xl:text-sm">
                                <FaScroll className="text-[#FFC72C]" /> 祈愿历史
                            </h2>
                            <HistoryPanel records={history} />
                        </motion.div>
                    ) : (
                        <motion.div key="main" className="relative z-10 h-full flex flex-col"
                            style={{ height: contentHeight }}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                            {!pool ? (
                                <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
                                    <div className="grid w-full max-w-md place-items-center gap-2 border border-yellow-200/20 bg-slate-950/55 px-6 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
                                        <FaStar className="text-2xl text-yellow-200/70" />
                                        <strong className="text-sm font-black tracking-widest text-white/80">暂无可用卡池</strong>
                                        <span className="text-xs leading-5 text-white/45">系统配置祈愿卡池后，会显示在这里。</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="lottery-main-grid grid flex-1 min-h-0 grid-cols-[72px_minmax(0,1fr)] gap-2 overflow-hidden px-3 pb-1 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-3 sm:px-5 xl:grid-cols-[112px_minmax(0,1fr)] xl:gap-4 xl:px-6 xl:pb-2">
                                    <aside className="lottery-pool-rail relative z-20 flex min-h-0 flex-col gap-2 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/45 p-1.5 shadow-2xl backdrop-blur-md xl:gap-3 xl:rounded-2xl xl:p-2">
                                        {pools.map((candidate, i) => {
                                            const preview = getRewardPreviews(candidate)[0];
                                            const selected = i === safePoolIdx;
                                            return (
                                                <button
                                                    key={candidate._id}
                                                    type="button"
                                                    onClick={() => {
                                                        setPoolIdx(i);
                                                        setShowHistory(false);
                                                    }}
                                                    className={`group relative aspect-[0.78] shrink-0 overflow-hidden rounded-lg border transition-all duration-200 xl:rounded-xl ${
                                                        selected
                                                            ? 'border-yellow-200 bg-yellow-100/15 shadow-[0_0_24px_rgba(248,193,74,0.38)]'
                                                            : 'border-white/15 bg-white/5 hover:border-cyan-100/55 hover:bg-cyan-100/10'
                                                    }`}
                                                    title={candidate.name}
                                                >
                                                    {candidate.image ? (
                                                        <img
                                                            src={candidate.image}
                                                            alt=""
                                                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                        />
                                                    ) : (
                                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(248,193,74,0.4),transparent_35%),linear-gradient(160deg,rgba(15,23,42,0.96),rgba(49,46,129,0.78))]" />
                                                    )}
                                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
                                                    <div className="absolute left-1 top-1 rounded border border-yellow-100/35 bg-black/35 px-1 py-0.5 text-[0.5rem] font-black tracking-widest text-yellow-100 xl:left-1.5 xl:top-1.5 xl:rounded-md xl:px-1.5 xl:text-[0.58rem]">
                                                        UP
                                                    </div>
                                                    <div className="absolute inset-x-1 bottom-1 text-left xl:inset-x-1.5 xl:bottom-1.5">
                                                        <p className="truncate text-[0.56rem] font-black text-white drop-shadow xl:text-[0.64rem]">
                                                            {preview?.name || candidate.name}
                                                        </p>
                                                        <p className="mt-0.5 truncate text-[0.5rem] font-bold text-slate-200/70 xl:text-[0.55rem]">
                                                            {candidate.drawMode === 'genshin' ? 'EVENT' : 'SUPPLY'}
                                                        </p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </aside>
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={pool._id}
                                                className="lottery-pool-stage h-full min-h-0"
                                            initial={{ opacity: 0, y: 14 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            transition={{ duration: 0.34, ease: 'easeOut' }}
                                        >
                                            <section
                                                className="relative h-full min-h-[300px] overflow-hidden rounded-2xl border border-yellow-200/20 bg-slate-950/75 xl:min-h-[360px] xl:rounded-3xl"
                                                style={{
                                                    boxShadow:
                                                        'inset 0 0 0 1px rgba(255,255,255,0.05), 0 28px 70px rgba(0,0,0,0.38)',
                                                }}
                                            >
                                                {pool.image ? (
                                                    <img
                                                        src={pool.image}
                                                        alt=""
                                                        className="absolute inset-0 h-full w-full object-cover"
                                                        style={{
                                                            opacity: 0.72,
                                                            filter: 'saturate(1.1) contrast(1.05) brightness(0.72)',
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(248,193,74,0.22),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.9),rgba(30,27,75,0.72)_52%,rgba(2,6,23,0.92))]" />
                                                )}
                                                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.94)_0%,rgba(15,23,42,0.76)_42%,rgba(15,23,42,0.18)_100%)]" />
                                                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent" />
                                                <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-yellow-200 via-cyan-200 to-purple-300 opacity-80" />

                                                <div className="relative z-10 flex h-full flex-col justify-between p-3 sm:p-5 xl:p-7">
                                                    <div>
                                                        <div className="mb-2 flex flex-wrap items-center gap-1.5 xl:mb-4 xl:gap-2">
                                                            <span className="rounded-md border border-yellow-200/30 bg-yellow-200/10 px-2 py-1 text-[0.56rem] font-black tracking-[0.16em] text-yellow-100 xl:rounded-lg xl:px-3 xl:text-[0.66rem] xl:tracking-[0.24em]">
                                                                {poolModeLabel}
                                                            </span>
                                                            <span className="rounded-md border border-cyan-200/25 bg-cyan-200/10 px-2 py-1 text-[0.56rem] font-black tracking-[0.16em] text-cyan-100/80 xl:rounded-lg xl:px-3 xl:text-[0.66rem] xl:tracking-[0.24em]">
                                                                EVENT WISH
                                                            </span>
                                                        </div>
                                                        <p className="mb-1 text-[0.58rem] font-black tracking-[0.24em] text-yellow-100/60 xl:mb-2 xl:text-[0.68rem] xl:tracking-[0.34em]">
                                                            本期推荐
                                                        </p>
                                                        <h2
                                                            className="max-w-xl text-2xl font-black leading-tight tracking-widest text-white sm:text-3xl xl:text-5xl"
                                                            style={{ textShadow: '0 0 28px rgba(248,193,74,0.42)' }}
                                                        >
                                                            {pool.name}
                                                        </h2>
                                                        <p className="mt-2 max-w-lg text-xs leading-5 text-slate-100/70 xl:mt-4 xl:text-sm xl:leading-7">
                                                            {pool.description || '命运星轨已经点亮，回应你的祈愿并收下本期奖励。'}
                                                        </p>
                                                    </div>

                                                    <div className="lottery-rewards-grid mt-3 grid gap-2 xl:mt-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(240px,0.72fr)] xl:gap-3">
                                                        <div
                                                            className="relative overflow-hidden rounded-xl border p-3 xl:rounded-2xl xl:p-4"
                                                            style={{
                                                                borderColor: `${featuredReward?.accent || '#f8c14a'}66`,
                                                                background:
                                                                    'linear-gradient(135deg, rgba(15,23,42,0.88), rgba(2,6,23,0.72))',
                                                                boxShadow: `0 0 34px ${featuredReward?.glow || 'rgba(248,193,74,0.22)'}`,
                                                            }}
                                                        >
                                                            <div className="absolute right-3 top-2 text-4xl font-black text-white/[0.04] xl:right-4 xl:top-3 xl:text-6xl">UP</div>
                                                            <div className="relative z-10">
                                                                <span
                                                                    className="inline-flex rounded border px-2 py-0.5 text-[0.55rem] font-black tracking-widest xl:rounded-md xl:py-1 xl:text-[0.62rem]"
                                                                    style={{
                                                                        borderColor: `${featuredReward?.accent || '#f8c14a'}77`,
                                                                        color: featuredReward?.accent || '#f8c14a',
                                                                        background: `${featuredReward?.accent || '#f8c14a'}16`,
                                                                    }}
                                                                >
                                                                    {featuredReward?.label || '本期 UP'}
                                                                </span>
                                                                <h3 className="mt-2 truncate text-lg font-black tracking-wider text-white xl:mt-3 xl:text-2xl">
                                                                    {featuredReward?.name || '等待命运揭晓'}
                                                                </h3>
                                                                <p className="mt-1 text-[0.68rem] font-bold tracking-widest text-slate-300/70 xl:mt-2 xl:text-xs">
                                                                    {featuredReward
                                                                        ? `${featuredReward.subtitle} · 数量 ×${featuredReward.quantity}`
                                                                        : '配置奖励后将展示主推内容'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="lottery-secondary-grid grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-2 xl:gap-2">
                                                            {(secondaryRewards.length > 0 ? secondaryRewards : rewardPreviews.slice(0, 4)).map((reward) => (
                                                                <div
                                                                    key={reward.key}
                                                                    className="min-w-0 rounded-lg border px-2 py-1.5 xl:rounded-xl xl:px-3 xl:py-2"
                                                                    style={{
                                                                        borderColor: `${reward.accent}45`,
                                                                        background: 'rgba(15,23,42,0.66)',
                                                                        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.035), 0 0 16px ${reward.glow}`,
                                                                    }}
                                                                >
                                                                    <p
                                                                        className="mb-1 truncate text-[0.54rem] font-black tracking-widest xl:text-[0.6rem]"
                                                                        style={{ color: reward.accent }}
                                                                    >
                                                                        {reward.label}
                                                                    </p>
                                                                    <p className="truncate text-[0.68rem] font-bold text-slate-50 xl:text-xs">{reward.name}</p>
                                                                    <p className="mt-0.5 text-[0.58rem] text-slate-300/60 xl:mt-1 xl:text-[0.62rem]">×{reward.quantity}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </section>

                                        </motion.div>
                                    </AnimatePresence>
                                </div>
                            )}

                            {/* Bottom: Draw buttons */}
                            {pool && (
                                <div className="lottery-drawbar px-3 pb-3 pt-2 sm:px-5 xl:px-6 xl:pb-5 xl:pt-3">
                                    <div
                                        className="mx-auto flex max-w-3xl flex-col gap-2 rounded-xl border border-yellow-200/20 bg-slate-950/80 p-2 shadow-2xl sm:flex-row sm:items-center xl:gap-3 xl:rounded-2xl xl:p-3"
                                        style={{ boxShadow: '0 -12px 42px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.04)' }}
                                    >
                                        <div className="min-w-0 flex-1 px-1">
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <p className="min-w-0 text-[0.56rem] font-black tracking-[0.18em] text-yellow-100/60 xl:text-[0.64rem] xl:tracking-[0.28em]">
                                                    STELLAR INVOCATION
                                                </p>
                                                <div className="lottery-drawbar-tools flex shrink-0 items-center gap-1.5">
                                                    <button type="button" onClick={() => setShowPoolDetails(true)}>
                                                        卡池详情
                                                    </button>
                                                    <button type="button" onClick={() => setShowHistory(v => !v)}>
                                                        {showHistory ? '返回卡池' : '历史记录'}
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="mt-0.5 truncate text-xs font-bold text-slate-100/80 xl:mt-1 xl:text-sm">
                                                {pool.consume?.type === 'none'
                                                    ? '本次祈愿无需消耗'
                                                    : `消耗：${consumeLabel(pool, 1)} / ${consumeLabel(pool, 10)}`}
                                            </p>
                                        </div>

                                        <div className="flex flex-1 gap-2 sm:max-w-md xl:gap-3">
                                        {/* ×1 */}
                                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                            onClick={() => handleDraw(1)}
                                            disabled={isDrawing || !canDraw(pool, 1)}
                                            className="group relative flex-1 overflow-hidden rounded-lg border border-yellow-200/60 py-2.5 font-black tracking-widest text-black disabled:cursor-not-allowed disabled:opacity-40 xl:rounded-xl xl:py-3.5"
                                            style={{ background: 'linear-gradient(90deg,#c8a84b,#FFC72C,#fff0aa,#FFC72C)', boxShadow: '0 0 24px rgba(255,199,44,0.38)' }}>
                                            <motion.span
                                                className="absolute inset-y-0 -left-1/2 w-1/3 bg-white/35 blur-md"
                                                animate={{ x: ['0%', '460%'] }}
                                                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                                            />
                                            <span className="relative z-10 block text-xs xl:text-sm">
                                            {isDrawing ? '祈愿中...' : !canAfford(pool, 1) ? '消耗不足' : `祈愿 ×1`}
                                            </span>
                                            {canAfford(pool, 1) && pool.consume?.type !== 'none' && (
                                                <span className="relative z-10 block text-[0.68rem] font-bold opacity-70 xl:text-xs">{consumeLabel(pool, 1)}</span>
                                            )}
                                        </motion.button>

                                        {/* ×10 */}
                                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                            onClick={() => handleDraw(10)}
                                            disabled={isDrawing || !canDraw(pool, 10)}
                                            className="relative flex-1 overflow-hidden rounded-lg border border-cyan-200/40 py-2.5 font-black tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-40 xl:rounded-xl xl:py-3.5"
                                            style={{ background: 'linear-gradient(90deg,#0f172a,#1d4ed8,#7c3aed,#f8c14a)', boxShadow: '0 0 28px rgba(56,189,248,0.28)' }}>
                                            <motion.span
                                                className="absolute inset-y-0 -left-1/2 w-1/3 bg-white/30 blur-md"
                                                animate={{ x: ['0%', '480%'] }}
                                                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                                            />
                                            <span className="relative z-10 block text-xs xl:text-sm">
                                            {isDrawing ? '祈愿中...' : !canAfford(pool, 10) ? '消耗不足×10' : `十连祈愿`}
                                            </span>
                                            {canAfford(pool, 10) && pool.consume?.type !== 'none' && (
                                                <span className="relative z-10 block text-[0.68rem] font-bold opacity-75 xl:text-xs">{consumeLabel(pool, 10)}</span>
                                            )}
                                        </motion.button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

            </div>
        </>
    );
};

export default SystemLottery;
