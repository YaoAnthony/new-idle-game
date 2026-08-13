import React from 'react';
import { motion } from 'framer-motion';
import { FaRobot, FaTimes, FaTrashAlt } from 'react-icons/fa';
import ChatInputBox from './components/ChatInputBox';
import ChatMessageList from './components/ChatMessageList';
import { useAiAssistantChatV2 } from './hooks/useAiAssistantChatV2';

interface Props {
    systemId: string;
    systemName: string;
    onClose: () => void;
    onCreated: (missionListId: string) => void;
}

const AiAssistantModal: React.FC<Props> = ({ systemId, systemName, onClose, onCreated }) => {
    const {
        messages,
        input,
        isLoading,
        confirmingIdx,
        bottomRef,
        inputRef,
        setInput,
        send,
        confirmProposal,
        requestRevision,
        reset,
    } = useAiAssistantChatV2({ systemId, systemName, onCreated });

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            send();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-5">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="relative w-full max-w-[min(94vw,1320px)] h-[min(86vh,860px)] flex flex-col bg-system-bg text-system-text shadow-2xl border border-system-line/30 overflow-hidden select-text"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(255,255,255,0.024) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
                    backgroundSize: '28px 28px',
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center gap-3 px-5 py-4 border-b border-system-line/25 bg-system-panel/80">
                    <div className="w-9 h-9 border border-system-line/30 bg-system-raised/70 text-system-accent flex items-center justify-center">
                        <FaRobot className="text-sm" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-black tracking-widest text-system-text text-sm">AI 任务规划助手</h3>
                        <p className="text-[10px] text-system-muted tracking-wider">{systemName}</p>
                    </div>
                    <button
                        onClick={reset}
                        title="清空聊天记录"
                        className="w-8 h-8 flex items-center justify-center text-system-muted hover:text-system-danger hover:bg-system-danger/10 transition-colors"
                    >
                        <FaTrashAlt className="text-xs" />
                    </button>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center text-system-muted hover:text-system-text hover:bg-white/10 transition-colors"
                    >
                        <FaTimes />
                    </button>
                </div>

                <ChatMessageList
                    messages={messages}
                    isLoading={isLoading}
                    confirmingIdx={confirmingIdx}
                    bottomRef={bottomRef}
                    onConfirm={confirmProposal}
                    onOther={requestRevision}
                />

                <ChatInputBox
                    input={input}
                    isLoading={isLoading}
                    inputRef={inputRef}
                    onChange={setInput}
                    onSend={() => send()}
                    onKeyDown={handleKeyDown}
                />
            </motion.div>
        </div>
    );
};

export default AiAssistantModal;
