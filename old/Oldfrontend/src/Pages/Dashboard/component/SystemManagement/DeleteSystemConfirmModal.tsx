import Modal from "../../../../Component/Modal";

interface DeleteSystemConfirmModalProps {
	isOpen: boolean;
	systemName: string;
	isDeleting: boolean;
	onClose: () => void;
	onConfirm: () => void;
}

const DeleteSystemConfirmModal: React.FC<DeleteSystemConfirmModalProps> = ({
	isOpen,
	systemName,
	isDeleting,
	onClose,
	onConfirm,
}) => {
	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="确 认 终 结 界 域"
		>
			<div className="w-[min(92vw,560px)] p-6 bg-white/50 dark:bg-black/20 rounded-b-2xl">
				<div className="flex flex-col items-center justify-center mb-6">
					<div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center mb-4 text-red-500 text-2xl animate-pulse">
						⚠️
					</div>
					<h3 className="text-xl font-black text-neutral-800 dark:text-white tracking-widest text-center">
						你即将令界域 <span className="text-red-500 dark:text-red-400 underline decoration-red-300 dark:decoration-red-500/50 underline-offset-4">{systemName}</span> 归于寂灭
					</h3>
				</div>
                
				<div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/50 rounded-xl p-4 mb-6 relative overflow-hidden">
					<div className="absolute top-0 left-0 w-1 h-full bg-orange-400 dark:bg-orange-500"></div>
					<p className="text-sm font-medium text-neutral-700 dark:text-white/80 leading-relaxed pl-3">
						一旦降下终末谕令，所有与此界域相连的旅者都将收到感应。该界域所孕育的专属法则、未收纳之物与残留痕迹都将化作尘埃（唯有世界主宰赐下的金币能量得以留存），而这片地界也将自时空中<strong className="text-red-600 dark:text-red-400">永久隐没</strong>。
					</p>
					<p className="text-sm font-black text-red-600 dark:text-red-400 mt-3 pl-3 tracking-wider">
						此乃不可回溯之抉择，还请再三思量。
					</p>
				</div>

				<div className="flex justify-end gap-4 mt-8">
					<button
						type="button"
						onClick={onClose}
						disabled={isDeleting}
						className="px-6 py-2.5 rounded-xl text-sm font-bold tracking-widest border transition-all duration-300 disabled:opacity-50
                        bg-white dark:bg-white/5 text-neutral-600 dark:text-white/70 border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/10 hover:text-neutral-800 dark:hover:text-white shadow-sm"
					>
						暂 且 收 回 谕 令
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={isDeleting}
						className="px-6 py-2.5 rounded-xl text-sm font-black tracking-widest border transition-all duration-300 disabled:opacity-50 shadow-md flex items-center gap-2
                        bg-red-500 hover:bg-red-600 text-white border-transparent
                        dark:bg-red-600 dark:hover:bg-red-500 dark:text-white dark:border-red-500/50 shadow-red-500/30"
					>
						{isDeleting ? '正在引导终焉之力...' : '降 下 终 末 谕 令'}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default DeleteSystemConfirmModal;