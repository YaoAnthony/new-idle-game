import { useEffect, useRef, useState } from 'react';
import { useAiTaskChatMutation, useAiTaskConfirmMutation, useLazyGetSystemListQuery } from '../../../../../../api/systemRtkApi';
import type { Message, Proposal } from '../types';
import { clearAiAssistantMessages, loadAiAssistantMessages, saveAiAssistantMessages } from '../utils/storage';

interface Options {
    systemId: string;
    systemName: string;
    onCreated: (missionListId: string) => void;
}

const isStructuralValidationFailure = (message: string) =>
    /limit|child|root node|prerequisite|parent node|graph/i.test(message);

export const useAiAssistantChatV2 = ({ systemId, systemName, onCreated }: Options) => {
    const greeting: Message = {
        role: 'assistant',
        content: `I am the task planning assistant for "${systemName}". Tell me the goal you want to accomplish. I can plan item rewards, and the system will generate coin rewards automatically from the economy rules.`,
    };

    const [messages, setMessages] = useState<Message[]>(() => loadAiAssistantMessages(systemId, [greeting]));
    const [input, setInput] = useState('');
    const [confirmingIdx, setConfirmingIdx] = useState<number | null>(null);
    const [aiTaskChat, { isLoading }] = useAiTaskChatMutation();
    const [aiTaskConfirm] = useAiTaskConfirmMutation();
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        saveAiAssistantMessages(systemId, messages);
    }, [messages, systemId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const toHistory = (items: Message[]) =>
        items
            .filter((_, index) => index > 0)
            .map((message) => ({
                role: message.role,
                content: message.content,
            }));

    const appendAssistantReply = (reply: string, proposal?: Proposal) => {
        setMessages((prev) => [
            ...prev,
            {
                role: 'assistant',
                content: reply,
                preview: proposal,
            },
        ]);
    };

    const send = async (overrideText?: string) => {
        const text = (overrideText ?? input).trim();
        if (!text || isLoading) return;

        const userMessage: Message = { role: 'user', content: text };
        const nextMessages = [...messages, userMessage];
        setMessages(nextMessages);
        if (!overrideText) setInput('');

        try {
            const response = await aiTaskChat({ systemId, messages: toHistory(nextMessages) }).unwrap();
            appendAssistantReply(response.reply, response.action === 'preview' ? response.proposal : undefined);
        } catch (error) {
            const err = error as { data?: { message?: string } };
            appendAssistantReply(err?.data?.message || 'The AI service is temporarily unavailable. Please try again shortly.');
        }
    };

    const autoReviseFromValidation = async (validationMessage: string) => {
        const revisionPrompt = [
            'The last proposal failed system validation.',
            `Validation error: ${validationMessage}`,
            'Please redesign the task plan so it fully satisfies the graph limits.',
            'Keep the same user goal, mention that you found the issue, and return a corrected preview instead of the invalid one.',
        ].join('\n');

        const revisionIntro: Message = {
            role: 'assistant',
            content: `I found a structural problem in the previous draft and I am redesigning it now.\n\n${validationMessage}`,
        };

        const nextMessages = [...messages, revisionIntro];
        setMessages(nextMessages);

        try {
            const response = await aiTaskChat({
                systemId,
                messages: [
                    ...toHistory(nextMessages),
                    { role: 'user', content: revisionPrompt },
                ],
            }).unwrap();
            appendAssistantReply(response.reply, response.action === 'preview' ? response.proposal : undefined);
        } catch (error) {
            const err = error as { data?: { message?: string } };
            appendAssistantReply(err?.data?.message || 'I tried to auto-revise the plan, but the retry failed.');
        }
    };

    const confirmProposal = async (messageIndex: number, proposal: Proposal) => {
        setConfirmingIdx(messageIndex);
        try {
            const response = await aiTaskConfirm({ systemId, proposal }).unwrap();
            setMessages((prev) =>
                prev.map((message, index) =>
                    index === messageIndex
                        ? { ...message, preview: undefined, isAction: true, content: response.reply }
                        : message,
                ),
            );
            await triggerGetSystemList().unwrap();
            const missionList = response.missionList as { _id?: string };
            if (missionList?._id) onCreated(missionList._id);
        } catch (error) {
            const err = error as { data?: { message?: string } };
            const messageText = err?.data?.message || 'Create failed. Please try again.';

            if (isStructuralValidationFailure(messageText)) {
                setMessages((prev) =>
                    prev.map((message, index) =>
                        index === messageIndex ? { ...message, preview: undefined } : message,
                    ),
                );
                await autoReviseFromValidation(messageText);
            } else {
                appendAssistantReply(messageText);
            }
        } finally {
            setConfirmingIdx(null);
        }
    };

    const requestRevision = async (_messageIndex: number, text: string) => {
        await send(text);
    };

    const reset = () => {
        clearAiAssistantMessages(systemId);
        setMessages([greeting]);
    };

    return {
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
    };
};
