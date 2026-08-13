import type { Message } from '../types';

export const getAiAssistantStorageKey = (systemId: string) => `ai_chat_${systemId}`;

export const loadAiAssistantMessages = (systemId: string, fallback: Message[]): Message[] => {
    try {
        const raw = sessionStorage.getItem(getAiAssistantStorageKey(systemId));
        if (raw) return JSON.parse(raw) as Message[];
    } catch (_) {
        // ignore storage errors
    }
    return fallback;
};

export const saveAiAssistantMessages = (systemId: string, messages: Message[]) => {
    try {
        sessionStorage.setItem(getAiAssistantStorageKey(systemId), JSON.stringify(messages));
    } catch (_) {
        // ignore storage errors
    }
};

export const clearAiAssistantMessages = (systemId: string) => {
    try {
        sessionStorage.removeItem(getAiAssistantStorageKey(systemId));
    } catch (_) {
        // ignore storage errors
    }
};
