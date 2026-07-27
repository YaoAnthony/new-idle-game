import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaPlus, FaTrash, FaEdit, FaCheck, FaTimes, FaInfinity, FaStar, FaSpinner } from 'react-icons/fa';
import { message, Switch } from 'antd';
import { getRarityLabel } from '@timeplan-game/core/economy/rarity';
import {
    useGetDailyQuestPoolQuery,
    useGetDailyQuestSettingsQuery,
    useCreateDailyQuestMutation,
    useUpdateDailyQuestMutation,
    useDeleteDailyQuestMutation,
    useUpdateDailyQuestSettingsMutation,
    type DailyQuest,
} from '../../../../api/systemRtkApi';

interface Props {
    systemId: string;
    variant?: 'page' | 'embedded';
}

interface QuestFormState {
    title: string;
    description: string;
    importance: number;
    isUnlimited: boolean;
    maxCompletions: number;
    isActive: boolean;
}

const EMPTY_FORM: QuestFormState = {
    title: '',
    description: '',
    importance: 3,
    isUnlimited: false,
    maxCompletions: 1,
    isActive: true,
};

const DailyQuestPanel: React.FC<Props> = ({ systemId, variant = 'page' }) => {
    const isEmbedded = variant === 'embedded';
    const { data: poolData, refetch: refetchPool } = useGetDailyQuestPoolQuery({ systemId });
    const { data: settingsData, refetch: refetchSettings } = useGetDailyQuestSettingsQuery({ systemId });

    const [createQuest, { isLoading: isCreatingQuest }] = useCreateDailyQuestMutation();
    const [updateQuest, { isLoading: isUpdatingQuest }] = useUpdateDailyQuestMutation();
    const [deleteQuest] = useDeleteDailyQuestMutation();
    const [updateSettings] = useUpdateDailyQuestSettingsMutation();

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<QuestFormState>(EMPTY_FORM);
    const [dailyCount, setDailyCount] = useState(3);
    const [enabled, setEnabled] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);

    const pool: DailyQuest[] = poolData?.pool || [];
    const settings = settingsData?.settings;
    const isSubmittingQuest = isCreatingQuest || isUpdatingQuest;

    useEffect(() => {
        if (settings) {
            setDailyCount(settings.dailyCount);
            setEnabled(settings.enabled);
        }
    }, [settings]);

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            await updateSettings({ systemId, dailyCount, enabled }).unwrap();
            message.success('设置已保存');
            refetchSettings();
        } catch {
            message.error('保存设置失败');
        } finally {
            setSavingSettings(false);
        }
    };

    const openCreate = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setShowForm(true);
    };

    const openEdit = (q: DailyQuest) => {
        setEditingId(q._id);
        setForm({
            title: q.title,
            description: q.description,
            importance: q.importance || 3,
            isUnlimited: q.isUnlimited,
            maxCompletions: q.maxCompletions,
            isActive: q.isActive,
        });
        setShowForm(true);
    };

    const handleSubmit = async () => {
        if (isSubmittingQuest) {
            return;
        }
        if (!form.title.trim()) {
            message.warning('请填写任务名称');
            return;
        }
        const body = {
            systemId,
            title: form.title.trim(),
            description: form.description,
            importance: form.importance,
            isUnlimited: form.isUnlimited,
            maxCompletions: form.maxCompletions,
            isActive: form.isActive,
        };
        try {
            if (editingId) {
                await updateQuest({ ...body, questId: editingId }).unwrap();
                message.success('已更新');
            } else {
                await createQuest(body).unwrap();
                message.success('已创建');
            }
            setShowForm(false);
            refetchPool();
        } catch {
            message.error('操作失败');
        }
    };

    const handleDelete = async (questId: string) => {
        try {
            await deleteQuest({ systemId, questId }).unwrap();
            message.success('已删除');
            refetchPool();
        } catch {
            message.error('删除失败');
        }
    };

    const handleToggleActive = async (q: DailyQuest) => {
        try {
            await updateQuest({ systemId, questId: q._id, isActive: !q.isActive }).unwrap();
            refetchPool();
        } catch {
            message.error('操作失败');
        }
    };

    return (
        <div className={`${isEmbedded ? 'system-management-panel--embedded p-3 space-y-3' : 'p-6 space-y-6'} h-full overflow-y-auto scrollbar-thin scrollbar-thumb-system-line/20 scrollbar-track-transparent`}>
            {/* Settings */}
            <div className={`rounded-xl border border-system-line/20 bg-system-panel/80 ${isEmbedded ? 'p-3' : 'p-5'}`}>
                <h3 className={`${isEmbedded ? 'text-xs mb-3' : 'text-sm mb-4'} font-bold tracking-widest text-system-accent`}>每日任务设置</h3>
                <div className={`flex flex-wrap items-center ${isEmbedded ? 'gap-3' : 'gap-6'}`}>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-system-muted tracking-wide">每日派发数量</span>
                        <input
                            type="number"
                            min={1}
                            max={20}
                            value={dailyCount}
                            onChange={e => setDailyCount(Math.max(1, Math.min(20, Number(e.target.value))))}
                            className="w-16 text-center px-2 py-1 rounded border border-system-line/25 bg-system-shell/70 text-system-text text-sm focus:outline-none focus:border-system-accent/70"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-system-muted tracking-wide">功能开关</span>
                        <Switch
                            checked={enabled}
                            onChange={setEnabled}
                            checkedChildren="开启"
                            unCheckedChildren="关闭"
                        />
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleSaveSettings}
                        disabled={savingSettings}
                        className={`${isEmbedded ? 'px-3 text-xs' : 'px-4 text-sm'} py-1.5 rounded-lg bg-system-action hover:bg-system-action/80 text-white font-bold tracking-wider transition-colors disabled:opacity-50`}
                    >
                        保存设置
                    </motion.button>
                </div>
            </div>

            {/* Quest pool header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold tracking-widest text-system-text">任务池</h3>
                    <p className="text-xs text-system-muted mt-0.5">共 {pool.length} 个任务 · 每天从中随机抽取 {dailyCount} 个派发给成员</p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={openCreate}
                    className={`flex items-center gap-2 ${isEmbedded ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} rounded-xl bg-system-success/20 hover:bg-system-success/30 border border-system-success/40 text-system-success font-bold tracking-wider transition-colors`}
                >
                    <FaPlus className="text-xs" />
                    新建任务
                </motion.button>
            </div>

            {/* Create/Edit form */}
            {showForm && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-xl border border-system-action/30 bg-system-action/10 ${isEmbedded ? 'p-3 space-y-3' : 'p-5 space-y-4'}`}
                >
                    <h4 className="text-sm font-bold tracking-widest text-system-action">
                        {editingId ? '编辑任务' : '新建任务'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-system-muted tracking-wide block mb-1">任务名称 *</label>
                            <input
                                value={form.title}
                                disabled={isSubmittingQuest}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                placeholder="如：每日签到"
                                className="w-full px-3 py-2 rounded-lg border border-system-line/25 bg-system-shell/70 text-sm text-system-text placeholder:text-system-faint focus:outline-none focus:border-system-accent/70 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-system-muted tracking-wide block mb-1">重要程度</label>
                            <div className="flex items-center gap-1 rounded-lg border border-system-line/25 bg-system-shell/70 px-2 py-2">
                                {[1, 2, 3, 4, 5].map((level) => (
                                    <button
                                        key={level}
                                        type="button"
                                        disabled={isSubmittingQuest}
                                        onClick={() => setForm(f => ({ ...f, importance: level }))}
                                        className={`p-1 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${form.importance >= level ? 'text-yellow-400' : 'text-system-faint hover:text-system-muted'}`}
                                        aria-label={`${level} 星重要度`}
                                    >
                                        <FaStar />
                                    </button>
                                ))}
                                <span className="ml-2 text-xs text-system-muted">金币由系统自动生成</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-system-muted tracking-wide block mb-1">任务描述</label>
                        <textarea
                            value={form.description}
                            disabled={isSubmittingQuest}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            rows={2}
                            placeholder="可选，描述任务内容..."
                            className="w-full px-3 py-2 rounded-lg border border-system-line/25 bg-system-shell/70 text-sm text-system-text placeholder:text-system-faint resize-none focus:outline-none focus:border-system-accent/70 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-system-muted tracking-wide">无限次完成</span>
                            <Switch
                                size="small"
                                checked={form.isUnlimited}
                                disabled={isSubmittingQuest}
                                onChange={v => setForm(f => ({ ...f, isUnlimited: v }))}
                            />
                        </div>
                        {!form.isUnlimited && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-system-muted tracking-wide">每日上限</span>
                                <input
                                    type="number"
                                    min={1}
                                    value={form.maxCompletions}
                                    disabled={isSubmittingQuest}
                                    onChange={e => setForm(f => ({ ...f, maxCompletions: Math.max(1, Number(e.target.value)) }))}
                                    className="w-14 text-center px-2 py-1 rounded border border-system-line/25 bg-system-shell/70 text-sm text-system-text focus:outline-none focus:border-system-accent/70 disabled:cursor-not-allowed disabled:opacity-60"
                                />
                                <span className="text-xs text-system-muted">次</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-system-muted tracking-wide">启用</span>
                            <Switch
                                size="small"
                                checked={form.isActive}
                                disabled={isSubmittingQuest}
                                onChange={v => setForm(f => ({ ...f, isActive: v }))}
                            />
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={handleSubmit}
                            disabled={isSubmittingQuest}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-system-action hover:bg-system-action/80 text-white text-sm font-bold tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSubmittingQuest ? <FaSpinner className="animate-spin" /> : <FaCheck />}
                            {isSubmittingQuest ? (editingId ? '保存中...' : '创建中...') : (editingId ? '保存修改' : '创建')}
                        </motion.button>
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            disabled={isSubmittingQuest}
                            onClick={() => {
                                if (!isSubmittingQuest) {
                                    setShowForm(false);
                                }
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-system-raised/70 hover:bg-system-raised border border-system-line/20 text-system-muted text-sm font-bold tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <FaTimes />
                            取消
                        </motion.button>
                    </div>
                </motion.div>
            )}

            {/* Quest list */}
            {pool.length === 0 ? (
                <div className="text-center py-12 text-system-muted text-sm tracking-widest">
                    暂无任务，点击「新建任务」添加
                </div>
            ) : (
                <div className="space-y-3">
                    {pool.map(q => (
                        <motion.div
                            key={q._id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`rounded-xl border p-4 flex items-center justify-between gap-4 transition-all ${
                                q.isActive
                                    ? 'border-system-line/20 bg-system-panel/70'
                                    : 'border-system-line/10 bg-system-panel/30 opacity-60'
                            }`}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm text-system-text tracking-wide">{q.title}</span>
                                    {q.isUnlimited ? (
                                        <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                                            <FaInfinity className="text-[10px]" /> 无限
                                        </span>
                                    ) : (
                                        <span className="text-xs px-2 py-0.5 rounded bg-system-action/20 text-system-action border border-system-action/30">
                                            每日 {q.maxCompletions} 次
                                        </span>
                                    )}
                                    {!q.isActive && (
                                        <span className="text-xs px-2 py-0.5 rounded bg-system-faint/20 text-system-muted border border-system-line/20">已停用</span>
                                    )}
                                    {(q.rewards?.coins || 0) > 0 && (
                                        <span className="text-xs text-yellow-400">🪙 {q.rewards.coins}</span>
                                    )}
                                    {q.rarity && (
                                        <span className="text-xs px-2 py-0.5 rounded bg-system-raised/70 text-system-muted border border-system-line/20">
                                            {getRarityLabel(q.rarity)}
                                        </span>
                                    )}
                                    {q.importance && (
                                        <span className="text-xs text-yellow-400">
                                            {'★'.repeat(Math.max(1, Math.min(5, Number(q.importance))))}
                                        </span>
                                    )}
                                </div>
                                {q.description && (
                                    <p className="text-xs text-system-muted mt-1 truncate">{q.description}</p>
                                )}
                                {q.rewardReason && (
                                    <p className="text-xs text-system-faint mt-1 truncate">{q.rewardReason}</p>
                                )}
                                <p className="text-xs text-system-faint mt-1">累计完成 {q.totalCompletions} 次</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => handleToggleActive(q)}
                                    className="text-xs text-system-muted hover:text-system-text px-2 py-1 rounded border border-system-line/10 hover:bg-system-raised/70 transition-colors"
                                >
                                    {q.isActive ? '停用' : '启用'}
                                </button>
                                <button
                                    onClick={() => openEdit(q)}
                                    className="p-2 rounded-lg text-system-action hover:bg-system-action/10 transition-colors"
                                >
                                    <FaEdit className="text-sm" />
                                </button>
                                <button
                                    onClick={() => handleDelete(q._id)}
                                    className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    <FaTrash className="text-sm" />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DailyQuestPanel;
