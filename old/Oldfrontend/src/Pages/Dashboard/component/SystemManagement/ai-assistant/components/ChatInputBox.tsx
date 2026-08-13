import React from 'react';
import { motion } from 'framer-motion';
import { FaPaperPlane, FaSpinner } from 'react-icons/fa';

interface Props {
    input: string;
    isLoading: boolean;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
    onChange: (value: string) => void;
    onSend: () => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

const ChatInputBox: React.FC<Props> = ({ input, isLoading, inputRef, onChange, onSend, onKeyDown }) => {
    return (
        <div className="px-4 py-3 border-t border-system-line/25 bg-system-shell/85">
            <div className="flex items-end gap-2">
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    disabled={isLoading}
                    rows={1}
                    placeholder="描述你的目标，按 Enter 发送..."
                    className="flex-1 resize-none bg-black/35 border border-system-line/25 px-4 py-2.5 text-sm text-system-text placeholder:text-system-faint focus:outline-none focus:border-system-accent/70 focus:ring-2 focus:ring-system-accent/15 transition-all max-h-32 overflow-y-auto scrollbar-none disabled:opacity-50"
                    style={{ lineHeight: '1.5' }}
                />
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onSend}
                    disabled={!input.trim() || isLoading}
                    className="w-10 h-10 border border-system-action/45 bg-system-action/90 text-white flex items-center justify-center shadow-lg shadow-system-action/10 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shrink-0"
                >
                    {isLoading ? <FaSpinner className="animate-spin text-sm" /> : <FaPaperPlane className="text-sm" />}
                </motion.button>
            </div>
            <p className="text-[10px] text-system-muted mt-1.5 pl-1">Shift+Enter 换行 · Enter 发送</p>
        </div>
    );
};

export default ChatInputBox;
