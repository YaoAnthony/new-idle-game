import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FaCheckCircle, FaRobot } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ProposalPreview from './ProposalPreviewV2';
import type { Message, Proposal } from '../types';

interface Props {
    messages: Message[];
    isLoading: boolean;
    confirmingIdx: number | null;
    bottomRef: React.RefObject<HTMLDivElement | null>;
    onConfirm: (messageIndex: number, proposal: Proposal) => void;
    onOther: (messageIndex: number, text: string) => void;
}

const ChatMessageList: React.FC<Props> = ({ messages, isLoading, confirmingIdx, bottomRef, onConfirm, onOther }) => {
    return (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin scrollbar-thumb-system-line/20 scrollbar-track-transparent select-text">
            <AnimatePresence initial={false}>
                {messages.map((message, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        {message.role === 'assistant' && (
                            <div className="w-7 h-7 border border-system-line/25 bg-system-raised/70 text-system-accent flex items-center justify-center mr-2 mt-0.5 shrink-0">
                                <FaRobot className="text-[10px]" />
                            </div>
                        )}
                        <div className={`flex flex-col gap-2 w-full ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                            {message.content && (
                                <div
                                    className={`px-4 py-3 border text-sm leading-relaxed select-text max-w-[min(92%,860px)] ${
                                        message.role === 'user'
                                            ? 'bg-system-accent/16 border-system-accent/35 text-system-text whitespace-pre-wrap'
                                            : message.isAction
                                            ? 'bg-system-success/12 border-system-success/30 text-system-success'
                                            : 'bg-system-panel/80 border-system-line/20 text-system-text'
                                    }`}
                                >
                                    {message.isAction && (
                                        <div className="flex items-center gap-1.5 mb-2 text-system-success text-[11px] font-black tracking-widest">
                                            <FaCheckCircle />
                                            任务列表已创建
                                        </div>
                                    )}
                                    {message.role === 'user' ? (
                                        message.content
                                    ) : (
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                                                strong: ({ children }) => <strong className="font-black">{children}</strong>,
                                                em: ({ children }) => <em className="italic">{children}</em>,
                                                ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
                                                ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
                                                li: ({ children }) => <li className="leading-snug">{children}</li>,
                                                code: ({ children }) => (
                                                    <code className="px-1 py-0.5 bg-black/30 border border-system-line/10 font-mono text-[12px] text-system-accent">{children}</code>
                                                ),
                                                h1: ({ children }) => <h1 className="font-black text-base mb-1">{children}</h1>,
                                                h2: ({ children }) => <h2 className="font-black text-sm mb-1">{children}</h2>,
                                                h3: ({ children }) => <h3 className="font-bold text-sm mb-0.5">{children}</h3>,
                                                hr: () => <hr className="border-current opacity-20 my-2" />,
                                            }}
                                        >
                                            {message.content}
                                        </ReactMarkdown>
                                    )}
                                </div>
                            )}

                            {message.preview && (
                                <div className="w-full max-w-none">
                                    <ProposalPreview
                                        proposal={message.preview}
                                        onConfirm={() => onConfirm(index, message.preview!)}
                                        onOther={(text) => onOther(index, text)}
                                        isConfirming={confirmingIdx === index}
                                    />
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>

            {isLoading && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                    <div className="w-7 h-7 border border-system-line/25 bg-system-raised/70 text-system-accent flex items-center justify-center mr-2 mt-0.5 shrink-0">
                        <FaRobot className="text-[10px]" />
                    </div>
                    <div className="px-4 py-3 border border-system-line/20 bg-system-panel/80 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-system-accent/70 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-system-accent/70 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-system-accent/70 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                </motion.div>
            )}

            <div ref={bottomRef} />
        </div>
    );
};

export default ChatMessageList;
