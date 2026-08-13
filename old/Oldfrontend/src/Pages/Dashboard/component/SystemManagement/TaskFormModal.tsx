import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { message } from 'antd';
import { FaChevronDown, FaCoins, FaPlus, FaTimes, FaRobot } from 'react-icons/fa';

import Modal from '../../../../Component/Modal';
import { useCreateMissionNodeMutation, useUpdateMissionNodeMutation, useLazyGetSystemListQuery } from '../../../../api/systemRtkApi';
import { useAiFillTaskMutation } from '../../../../api/profileStateRtkApi';

// ── Types ────────────────────────────────────────────────────────────────────

type MissionNodeLite = {
    nodeId: string;
    title: string;
    childrenNodeIds: string[];
};

type MissionListLite = {
    _id: string;
    title: string;
    rootNodeId?: string | null;
    taskTree: MissionNodeLite[];
};

type RewardItemOption = {
    key: string;
    label: string;
    source: 'store' | 'obtainable';
};

type ExperienceEntry = { name: string; value: number };
type ItemEntry      = { itemKey: string; quantity: number };
type UnlockEntry    = { missionId: string; title: string; description: string };

export type EditableNode = {
    nodeId: string;
    title: string;
    description?: string;
    content?: string;
    notice?: string;
    timeCostMinutes: number;
    canInterrupt?: boolean;
    rewards?: {
        coins?: number;
        experience?: ExperienceEntry[];
        items?: ItemEntry[];
        unlockMissions?: UnlockEntry[];
    };
};

type TaskFormModalProps = {
    visible: boolean;
    onClose: () => void;
    systemId: string;
    selectedMissionList?: MissionListLite;
    rewardItemOptions: RewardItemOption[];
    initialParentNodeId?: string;
    /** 传入时为编辑模式 */
    editNode?: EditableNode;
};

// ── Initial state helper ─────────────────────────────────────────────────────

const createInitialForm = (parentNodeId = '') => ({
    parentNodeId,
    title: '',
    description: '',
    content: '',
    notice: '',
    timeCostMinutes: 30,
    canInterrupt: true,
    items: [] as ItemEntry[],
    unlockMissions: [] as UnlockEntry[],
});

// ── Sub-components ────────────────────────────────────────────────────────────

const inputCls =
    'w-full bg-white dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 outline-none transition-all text-sm';

const labelCls = 'text-xs font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase mb-1.5 block';

// ── Main Component ────────────────────────────────────────────────────────────

const TaskFormModal: React.FC<TaskFormModalProps> = ({
    visible,
    onClose,
    systemId,
    selectedMissionList,
    rewardItemOptions,
    initialParentNodeId,
    editNode,
}) => {
    const isEditMode = !!editNode;
    const [form, setForm] = useState(createInitialForm(initialParentNodeId || ''));
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [createMissionNode, { isLoading: isCreating }] = useCreateMissionNodeMutation();
    const [updateMissionNode, { isLoading: isUpdating }] = useUpdateMissionNodeMutation();
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const [aiFillTask, { isLoading: isAiFilling }] = useAiFillTaskMutation();

    useEffect(() => {
        if (!visible) return;
        if (editNode) {
            setForm({
                parentNodeId: '',
                title:            editNode.title,
                description:      editNode.description || '',
                content:          editNode.content     || '',
                notice:           editNode.notice      || '',
                timeCostMinutes:  editNode.timeCostMinutes,
                canInterrupt:     editNode.canInterrupt ?? true,
                items:            editNode.rewards?.items?.map(i => ({ ...i }))       || [],
                unlockMissions:   editNode.rewards?.unlockMissions?.map(u => ({ missionId: u.missionId, title: u.title, description: u.description || '' })) || [],
            });
        } else {
            setForm(createInitialForm(initialParentNodeId || ''));
        }
        setShowAdvanced(false);
    }, [visible, initialParentNodeId, editNode]);

    const closeAndReset = () => {
        setForm(createInitialForm(initialParentNodeId || ''));
        setShowAdvanced(false);
        onClose();
    };

    // ── AI Fill ───────────────────────────────────────────────────────────────

    const handleAiFill = async () => {
        if (!form.title.trim() && !form.description.trim() && !form.content.trim()) {
            message.warning('请至少填写标题或部分内容，AI 才能补充剩余字段');
            return;
        }
        try {
            const result = await aiFillTask({
                title: form.title,
                description: form.description,
                content: form.content,
                notice: form.notice,
            }).unwrap();
            setForm(f => ({
                ...f,
                title:       result.title       || f.title,
                description: result.description || f.description,
                content:     result.content     || f.content,
                notice:      result.notice      !== undefined ? result.notice : f.notice,
            }));
            message.success('AI 已填充完毕');
        } catch {
            message.error('AI 填充失败，请稍后重试');
        }
    };

    // ── Submit ────────────────────────────────────────────────────────────────

    const buildRewards = () => ({
        items:          form.items.filter(i => i.itemKey),
        unlockMissions: form.unlockMissions.filter(u => u.missionId.trim() && u.title.trim()),
    });

    const handleCreate = async () => {
        if (!selectedMissionList) { message.error('请先选择任务列表'); return; }
        if (!form.title.trim())    { message.error('请填写任务标题');   return; }
        if (!form.timeCostMinutes || form.timeCostMinutes <= 0) {
            message.error('任务耗时必须大于 0 分钟');
            return;
        }

        // ── Edit mode ──────────────────────────────────────────────────────
        if (isEditMode && editNode) {
            try {
                await updateMissionNode({
                    systemId,
                    missionListId: selectedMissionList._id,
                    nodeId:           editNode.nodeId,
                    title:            form.title.trim(),
                    description:      form.description.trim(),
                    content:          form.content.trim(),
                    notice:           form.notice.trim(),
                    timeCostMinutes:  Math.max(1, form.timeCostMinutes),
                    canInterrupt:     form.canInterrupt,
                    rewards:          buildRewards(),
                }).unwrap();
                message.success('任务节点已更新');
                await triggerGetSystemList().unwrap();
                closeAndReset();
            } catch (err) {
                const e = err as { data?: { message?: string } };
                message.error(e?.data?.message || '更新失败');
            }
            return;
        }

        // ── Create mode ────────────────────────────────────────────────────
        const parentNodeId = form.parentNodeId.trim() || null;
        const parent = parentNodeId
            ? selectedMissionList.taskTree.find(n => n.nodeId === parentNodeId)
            : null;

        if (parentNodeId && !parent) { message.error('父任务不存在'); return; }
        if (parent && (parent.childrenNodeIds || []).length >= 3) {
            message.error('每个任务最多只能有 3 个子任务');
            return;
        }
        if (!parentNodeId && selectedMissionList.rootNodeId) {
            message.error('该任务列表已存在头节点，请选择父任务创建子任务');
            return;
        }

        try {
            await createMissionNode({
                systemId,
                missionListId: selectedMissionList._id,
                parentNodeId,
                title:            form.title.trim(),
                description:      form.description.trim(),
                content:          form.content.trim(),
                notice:           form.notice.trim(),
                timeCostMinutes:  Math.max(1, form.timeCostMinutes),
                canInterrupt:     form.canInterrupt,
                rewards:          buildRewards(),
            }).unwrap();

            message.success('任务节点创建成功');
            await triggerGetSystemList().unwrap();
            closeAndReset();
        } catch (err) {
            const e = err as { data?: { message?: string } };
            message.error(e?.data?.message || '创建失败');
        }
    };

    // ── Reward list helpers ───────────────────────────────────────────────────

    const addItem         = () => setForm(f => ({ ...f, items:          [...f.items,          { itemKey: '', quantity: 1 }] }));
    const addUnlock       = () => setForm(f => ({ ...f, unlockMissions: [...f.unlockMissions, { missionId: '', title: '', description: '' }] }));
    const removeItem      = (i: number) => setForm(f => ({ ...f, items:          f.items.filter((_, idx) => idx !== i) }));
    const removeUnlock    = (i: number) => setForm(f => ({ ...f, unlockMissions: f.unlockMissions.filter((_, idx) => idx !== i) }));

    const parentNode = selectedMissionList?.taskTree.find(n => n.nodeId === form.parentNodeId);

    return (
        <Modal isOpen={visible} onClose={closeAndReset} title="">
            <div className="w-[95vw] sm:w-[85vw] max-w-2xl max-h-[85vh] overflow-y-auto p-5 sm:p-7 bg-white dark:bg-[#0d0d0d] text-gray-800 dark:text-white rounded-2xl scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-white/10 scrollbar-track-transparent">

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h4 className="text-base font-black tracking-widest text-indigo-500 dark:text-indigo-400">
                            {isEditMode ? '修改任务节点' : '创建任务节点'}
                        </h4>
                        {selectedMissionList && (
                            <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5 tracking-wide">
                                {selectedMissionList.title}
                            </p>
                        )}
                    </div>
                </div>

                {/* ── Core fields ── */}
                <div className="space-y-4">

                    {/* Title + Time in one row */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <label className={labelCls}>任务标题 *</label>
                            <input
                                value={form.title}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                placeholder="输入任务标题..."
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>耗时（分钟）*</label>
                            <input
                                type="number"
                                min="1"
                                value={form.timeCostMinutes}
                                onChange={e => setForm(f => ({ ...f, timeCostMinutes: parseInt(e.target.value, 10) || 1 }))}
                                className={inputCls}
                            />
                        </div>
                    </div>

                    {/* Content fields with AI button */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className={`${labelCls} mb-0`}>任务描述 / 内容 / 提醒</label>
                            <motion.button
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                onClick={handleAiFill}
                                disabled={isAiFilling}
                                className="flex items-center gap-1.5 text-[11px] font-bold text-purple-500 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 px-3 py-1 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                            >
                                {isAiFilling
                                    ? <><FaRobot className="animate-spin text-[10px]" />AI 填充中...</>
                                    : <><FaRobot className="text-[10px]" />✨ AI 填充</>
                                }
                            </motion.button>
                        </div>

                        <div className="space-y-2">
                            <textarea
                                rows={2}
                                value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="简要描述（一句话概述）..."
                                className={`${inputCls} resize-none`}
                            />
                            <textarea
                                rows={3}
                                value={form.content}
                                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                                placeholder="详细内容（执行步骤、具体要求...）"
                                className={`${inputCls} resize-none`}
                            />
                            <textarea
                                rows={2}
                                value={form.notice}
                                onChange={e => setForm(f => ({ ...f, notice: e.target.value }))}
                                placeholder="⚠️ 注意事项（选填）"
                                className={`${inputCls} resize-none bg-yellow-50/60 dark:bg-yellow-500/5 border-yellow-200 dark:border-yellow-500/20 focus:border-yellow-400 focus:ring-yellow-400/20`}
                            />
                        </div>
                    </div>

                    {/* canInterrupt toggle */}
                    <label className="flex items-center gap-3 cursor-pointer group w-fit">
                        <div
                            onClick={() => setForm(f => ({ ...f, canInterrupt: !f.canInterrupt }))}
                            className={`relative w-10 h-5 rounded-full transition-colors ${form.canInterrupt ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-white/20'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.canInterrupt ? 'translate-x-5' : ''}`} />
                        </div>
                        <span className="text-sm text-gray-600 dark:text-white/60 group-hover:text-gray-800 dark:group-hover:text-white transition-colors">
                            允许任务被中断重置
                        </span>
                    </label>

                    {/* ── Rewards section ── */}
                    <div className="border-t border-gray-100 dark:border-white/10 pt-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold tracking-widest text-amber-600 dark:text-amber-400 uppercase flex items-center gap-2">
                                <FaCoins className="text-amber-500" /> 收益
                            </span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-white/30 mb-3">
                            金币和六维经验会由奖励规则自动生成，这里只设置物品和解锁奖励。
                        </p>

                        {/* Dynamic item entries */}
                        <AnimatePresence>
                            {form.items.map((item, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="flex gap-2 mb-2 items-center"
                                >
                                    <span className="text-sm shrink-0">🎁</span>
                                    <select
                                        value={item.itemKey}
                                        onChange={e => setForm(f => {
                                            const arr = [...f.items];
                                            arr[i] = { ...arr[i], itemKey: e.target.value };
                                            return { ...f, items: arr };
                                        })}
                                        className="flex-1 min-w-0 bg-white dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-gray-900 dark:text-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 outline-none transition-all text-sm"
                                    >
                                        <option value="">选择道具</option>
                                        {rewardItemOptions.map(opt => (
                                            <option key={opt.key} value={opt.key}>
                                                {opt.label} ({opt.source === 'store' ? '商城' : opt.key})
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        type="number"
                                        min="1"
                                        value={item.quantity}
                                        onChange={e => setForm(f => {
                                            const arr = [...f.items];
                                            arr[i] = { ...arr[i], quantity: parseInt(e.target.value, 10) || 1 };
                                            return { ...f, items: arr };
                                        })}
                                        placeholder="数量"
                                        className="shrink-0 w-16 bg-white dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-xl px-2 py-2.5 text-gray-900 dark:text-white focus:border-indigo-400 outline-none text-sm text-center"
                                    />
                                    <button onClick={() => removeItem(i)} className="text-gray-400 hover:text-red-400 transition-colors shrink-0"><FaTimes /></button>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {/* Dynamic unlock missions */}
                        <AnimatePresence>
                            {form.unlockMissions.map((u, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mb-2 p-3 rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5 space-y-2"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-blue-500 dark:text-blue-400">解锁任务 #{i + 1}</span>
                                        <button onClick={() => removeUnlock(i)} className="text-gray-400 hover:text-red-400 transition-colors"><FaTimes /></button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            value={u.missionId}
                                            onChange={e => setForm(f => { const arr = [...f.unlockMissions]; arr[i] = { ...arr[i], missionId: e.target.value }; return { ...f, unlockMissions: arr }; })}
                                            placeholder="Mission List ID"
                                            className={`${inputCls} font-mono text-xs`}
                                        />
                                        <input
                                            value={u.title}
                                            onChange={e => setForm(f => { const arr = [...f.unlockMissions]; arr[i] = { ...arr[i], title: e.target.value }; return { ...f, unlockMissions: arr }; })}
                                            placeholder="任务代号"
                                            className={`${inputCls} text-xs`}
                                        />
                                    </div>
                                    <input
                                        value={u.description}
                                        onChange={e => setForm(f => { const arr = [...f.unlockMissions]; arr[i] = { ...arr[i], description: e.target.value }; return { ...f, unlockMissions: arr }; })}
                                        placeholder="解锁描述（选填）"
                                        className={`${inputCls} text-xs`}
                                    />
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {/* + buttons */}
                        <div className="flex flex-wrap gap-2 mt-2">
                            <button
                                onClick={addItem}
                                className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                <FaPlus className="text-[9px]" /> 添加物品奖励
                            </button>
                            <button
                                onClick={addUnlock}
                                className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                <FaPlus className="text-[9px]" /> 添加解锁任务
                            </button>
                        </div>
                    </div>

                    {/* ── Advanced settings (collapsible, hidden in edit mode) ── */}
                    {!isEditMode && (
                        <div className="border-t border-gray-100 dark:border-white/10 pt-4">
                            <button
                                onClick={() => setShowAdvanced(v => !v)}
                                className="flex items-center gap-2 text-xs font-bold tracking-widest text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition-colors uppercase"
                            >
                                <motion.span
                                    animate={{ rotate: showAdvanced ? 180 : 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <FaChevronDown />
                                </motion.span>
                                高级设置
                            </button>

                            <AnimatePresence>
                                {showAdvanced && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="mt-4 space-y-3 overflow-hidden"
                                    >
                                        {/* Parent node selector */}
                                        <div>
                                            <label className={labelCls}>父任务节点</label>
                                            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl text-xs font-mono text-gray-500 dark:text-gray-400 mb-2">
                                                <span className="truncate flex-1">
                                                    {parentNode ? `${parentNode.title}` : 'ROOT (顶层节点)'}
                                                </span>
                                                {parentNode && (
                                                    <span className="text-indigo-400 text-[10px] shrink-0">
                                                        子任务 {(parentNode.childrenNodeIds || []).length}/3
                                                    </span>
                                                )}
                                            </div>
                                            <select
                                                value={form.parentNodeId}
                                                onChange={e => setForm(f => ({ ...f, parentNodeId: e.target.value }))}
                                                className={inputCls}
                                            >
                                                <option value="">ROOT (顶层节点)</option>
                                                {(selectedMissionList?.taskTree || []).map(node => (
                                                    <option key={node.nodeId} value={node.nodeId}>
                                                        {node.title} — 子任务 {(node.childrenNodeIds || []).length}/3
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                {/* ── Footer buttons ── */}
                <div className="flex gap-3 mt-6 pt-5 border-t border-gray-100 dark:border-white/10">
                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleCreate}
                        disabled={isCreating || isUpdating}
                        className="flex-1 bg-indigo-500 hover:bg-indigo-400 text-white py-3 rounded-xl font-black tracking-widest transition-colors disabled:opacity-50 text-sm"
                    >
                        {isEditMode
                            ? (isUpdating ? '保存中...' : '保存修改')
                            : (isCreating ? '创建中...' : '创建任务')
                        }
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={closeAndReset}
                        className="px-6 py-3 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-600 dark:text-white/50 rounded-xl font-bold tracking-widest transition-colors text-sm"
                    >
                        取消
                    </motion.button>
                </div>
            </div>
        </Modal>
    );
};

export default TaskFormModal;
