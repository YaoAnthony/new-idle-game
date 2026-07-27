import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import Modal from '../../../../Component/Modal';
import type { MissionListType } from '../../../../Types/System';
import { getTaskUnlockAttributeOptions } from './task-chain/attributeOptions';
import type { TaskListFormState } from './task-chain/taskChainForms';

type RewardItemOption = {
    key: string;
    label: string;
    source: 'store' | 'obtainable';
};

type CreateTaskModalProps = {
    visible: boolean;
    isCreatingList: boolean;
    listForm: TaskListFormState;
    rewardItemOptions: RewardItemOption[];
    onClose: () => void;
    onCancel: () => void;
    onCreate: () => void;
    onListFormChange: (nextForm: TaskListFormState) => void;
};

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
    visible,
    isCreatingList,
    listForm,
    rewardItemOptions,
    onClose,
    onCancel,
    onCreate,
    onListFormChange,
}) => {
    const { t } = useTranslation();
    const unlockAttributeOptions = getTaskUnlockAttributeOptions(t);

    return (
        <Modal isOpen={visible} onClose={onClose} title="">
            <div className="w-[95vw] sm:w-[90vw] max-w-4xl max-h-[85vh] overflow-y-auto p-4 sm:p-6 bg-white/90 dark:bg-[#0a0a0a]/90 text-gray-800 dark:text-white rounded-2xl scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-white/20 scrollbar-track-transparent">
                <h4 className="text-md font-bold tracking-widest mb-4 text-blue-600 dark:text-blue-200">创建任务列表</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm text-gray-600 dark:text-white/60 font-bold block mb-2">任务类型</label>
                        <select
                            value={listForm.listType}
                            onChange={(e) => onListFormChange({ ...listForm, listType: e.target.value as MissionListType })}
                            className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-4 py-2 text-gray-800 dark:text-white focus:outline-none focus:border-blue-500"
                        >
                            <option value="mainline">主线任务</option>
                            <option value="urgent">紧急任务</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 dark:text-white/60 font-bold block mb-2">任务列表标题*</label>
                        <input
                            value={listForm.title}
                            onChange={(e) => onListFormChange({ ...listForm, title: e.target.value })}
                            placeholder="如：第一章生存试炼"
                            className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-4 py-2 text-gray-800 dark:text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 dark:text-white/60 font-bold block mb-2">解锁条件</label>
                        <select
                            value={listForm.unlockType}
                            onChange={(e) => onListFormChange({ ...listForm, unlockType: e.target.value as 'direct' | 'attributeLevel' })}
                            className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-4 py-2 text-gray-800 dark:text-white focus:outline-none focus:border-blue-500"
                        >
                            <option value="direct">直接解锁</option>
                            <option value="attributeLevel">属性等级解锁</option>
                        </select>
                    </div>

                    {listForm.unlockType === 'attributeLevel' && (
                        <>
                            <div>
                                <label className="text-sm text-gray-600 dark:text-white/60 font-bold block mb-2">属性名*</label>
                                <select
                                    value={listForm.unlockAttributeName}
                                    onChange={(e) => onListFormChange({
                                        ...listForm,
                                        unlockAttributeName: e.target.value as TaskListFormState['unlockAttributeName'],
                                    })}
                                    className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-4 py-2 text-gray-800 dark:text-white focus:outline-none focus:border-blue-500"
                                >
                                    <option value="">
                                        {t('gameEsc.attributes.selectPlaceholder', { defaultValue: '请选择属性' })}
                                    </option>
                                    {unlockAttributeOptions.map((option) => (
                                        <option key={option.key} value={option.key}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm text-gray-600 dark:text-white/60 font-bold block mb-2">最低等级*</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={listForm.unlockMinLevel}
                                    onChange={(e) => onListFormChange({ ...listForm, unlockMinLevel: parseInt(e.target.value, 10) || 0 })}
                                    className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-4 py-2 text-gray-800 dark:text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="mt-4">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-white/80">
                        <input
                            type="checkbox"
                            checked={listForm.failureEnabled}
                            onChange={(e) => onListFormChange({ ...listForm, failureEnabled: e.target.checked })}
                        />
                        开启失败惩罚机制（任务列表失败后不可重开）
                    </label>
                </div>

                {listForm.failureEnabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div className="bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-lg p-4 shadow-sm dark:shadow-none">
                            <p className="text-sm font-bold text-gray-700 dark:text-white/80 mb-3">积分扣除</p>
                            <input
                                value={listForm.pointPenaltyAttributeName}
                                onChange={(e) => onListFormChange({ ...listForm, pointPenaltyAttributeName: e.target.value })}
                                placeholder="属性名，如：体质"
                                className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded px-3 py-2 text-gray-800 dark:text-white mb-3 focus:outline-none focus:border-blue-500"
                            />
                            <input
                                type="number"
                                min="1"
                                value={listForm.pointPenaltyValue}
                                onChange={(e) => onListFormChange({ ...listForm, pointPenaltyValue: parseInt(e.target.value, 10) || 1 })}
                                className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded px-3 py-2 text-gray-800 dark:text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div className="bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-lg p-4 shadow-sm dark:shadow-none">
                            <p className="text-sm font-bold text-gray-700 dark:text-white/80 mb-3">物品扣除</p>
                            <select
                                value={listForm.itemPenaltyItemKey}
                                onChange={(e) => onListFormChange({ ...listForm, itemPenaltyItemKey: e.target.value })}
                                className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded px-3 py-2 text-gray-800 dark:text-white mb-3 focus:outline-none focus:border-blue-500"
                            >
                                <option value="">不设置</option>
                                {rewardItemOptions.map((item) => (
                                    <option key={item.key} value={item.key}>
                                        {item.label} ({item.source === 'store' ? '商城商品' : item.key})
                                    </option>
                                ))}
                            </select>
                            <input
                                type="number"
                                min="1"
                                value={listForm.itemPenaltyQuantity}
                                onChange={(e) => onListFormChange({ ...listForm, itemPenaltyQuantity: parseInt(e.target.value, 10) || 1 })}
                                className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded px-3 py-2 text-gray-800 dark:text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                )}

                <div className="mt-4">
                    <label className="text-sm text-gray-600 dark:text-white/60 font-bold block mb-2">介绍</label>
                    <textarea
                        rows={3}
                        value={listForm.description}
                        onChange={(e) => onListFormChange({ ...listForm, description: e.target.value })}
                        placeholder="任务列表介绍"
                        className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-4 py-2 text-gray-800 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                </div>

                <div className="flex gap-3 mt-5">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onCreate}
                        disabled={isCreatingList}
                        className="bg-blue-500 hover:bg-blue-400 text-white px-6 py-2 rounded-lg font-bold tracking-widest transition-colors disabled:opacity-50"
                    >
                        {isCreatingList ? '创建中...' : '创建任务列表'}
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onCancel}
                        className="bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-700 dark:text-white px-6 py-2 rounded-lg font-bold tracking-widest transition-colors"
                    >
                        取消
                    </motion.button>
                </div>
            </div>
        </Modal>
    );
};

export default CreateTaskModal;
