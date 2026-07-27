import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FaExclamationTriangle } from 'react-icons/fa';

type DeleteMissionListDialogProps = {
    deleteTarget: { id: string; title: string; nodeCount: number } | null;
    isDeleting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

const DeleteMissionListDialog: React.FC<DeleteMissionListDialogProps> = ({
    deleteTarget,
    isDeleting,
    onConfirm,
    onCancel,
}) => {
    return (
        <AnimatePresence>
            {deleteTarget && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[10000001] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={onCancel}
                >
                    <motion.div
                        initial={{ scale: 0.92, opacity: 0, y: 12 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.92, opacity: 0, y: 12 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                        onClick={(event) => event.stopPropagation()}
                        className="bg-white dark:bg-[#111] border border-red-300/50 dark:border-red-500/30 rounded-2xl shadow-2xl p-7 w-[90vw] max-w-md"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center shrink-0">
                                <FaExclamationTriangle className="text-red-500 dark:text-red-400 text-lg" />
                            </div>
                            <div>
                                <h3 className="font-black tracking-widest text-gray-900 dark:text-white text-base">删除任务列表</h3>
                                <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">此操作不可撤销</p>
                            </div>
                        </div>

                        <p className="text-sm text-gray-700 dark:text-white/80 mb-2 leading-relaxed">
                            即将删除任务列表 <span className="font-bold text-red-500 dark:text-red-400">《{deleteTarget.title}》</span>
                        </p>
                        <ul className="text-xs text-gray-500 dark:text-white/50 space-y-1 mb-6 pl-4 list-disc">
                            <li>列表内 <span className="font-bold text-gray-700 dark:text-white/80">{deleteTarget.nodeCount}</span> 个任务节点将被一并删除</li>
                            <li>所有成员的接取状态、进行中任务、完成记录将同步清除</li>
                            <li>此操作会通过 SSE 实时通知所有在线成员</li>
                        </ul>

                        <div className="flex gap-3">
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={onConfirm}
                                disabled={isDeleting}
                                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black tracking-widest text-sm transition-colors disabled:opacity-60"
                            >
                                {isDeleting ? '删除中...' : '确认删除'}
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={onCancel}
                                disabled={isDeleting}
                                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-white font-black tracking-widest text-sm transition-colors"
                            >
                                取消
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default DeleteMissionListDialog;
