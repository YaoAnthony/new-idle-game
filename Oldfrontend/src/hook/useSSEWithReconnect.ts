import { useEffect, useRef } from 'react';

interface UseSSEWithReconnectOptions {
    url?: string | null;
    enabled?: boolean;
    initialRetryDelayMs?: number;
    maxRetryDelayMs?: number;
    jitterMs?: number;
    onOpen?: () => void;
    onMessage?: (event: MessageEvent) => void;
    onError?: (event: Event) => void;
}

const DEFAULT_INITIAL_RETRY_DELAY_MS = 1000;
const DEFAULT_MAX_RETRY_DELAY_MS = 20000;
const DEFAULT_JITTER_MS = 250;
const TOKEN_EXPIRY_LEEWAY_SECONDS = 10;

function decodeBase64UrlJson(value: string): unknown {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
}

function getQueryJwtExpiry(url: string): number | null {
    try {
        const parsed = new URL(url, window.location.origin);
        const token = parsed.searchParams.get('token');
        const payload = token?.split('.')[1];
        if (!payload) return null;
        const decoded = decodeBase64UrlJson(payload) as { exp?: unknown };
        const exp = Number(decoded.exp);
        return Number.isFinite(exp) ? exp : null;
    } catch {
        return null;
    }
}

function hasExpiredQueryJwt(url: string): boolean {
    const exp = getQueryJwtExpiry(url);
    if (!exp) return false;
    return exp <= Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_LEEWAY_SECONDS;
}

const useSSEWithReconnect = ({
    url,
    enabled = true,
    initialRetryDelayMs = DEFAULT_INITIAL_RETRY_DELAY_MS,
    maxRetryDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
    jitterMs = DEFAULT_JITTER_MS,
    onOpen,
    onMessage,
    onError,
}: UseSSEWithReconnectOptions): void => {
    const onOpenRef = useRef(onOpen);
    const onMessageRef = useRef(onMessage);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onOpenRef.current = onOpen;
    }, [onOpen]);

    useEffect(() => {
        onMessageRef.current = onMessage;
    }, [onMessage]);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    useEffect(() => {
        if (!enabled || !url) {
            return;
        }

        let source: EventSource | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let reconnectAttempt = 0;
        let closedByEffect = false;

        const clearReconnectTimer = () => {
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        };

        const closeSource = () => {
            if (source) {
                source.close();
                source = null;
            }
        };

        const getDelay = () => {
            const exponentialDelay = Math.min(
                maxRetryDelayMs,
                initialRetryDelayMs * Math.pow(2, reconnectAttempt)
            );
            const randomJitter = Math.floor(Math.random() * jitterMs);
            return exponentialDelay + randomJitter;
        };

        const scheduleReconnect = () => {
            if (closedByEffect) {
                return;
            }
            if (hasExpiredQueryJwt(url)) {
                closeSource();
                return;
            }

            clearReconnectTimer();
            const delay = getDelay();
            reconnectAttempt += 1;
            reconnectTimer = setTimeout(() => {
                connect();
            }, delay);
        };

        const connect = () => {
            if (closedByEffect) {
                return;
            }
            if (hasExpiredQueryJwt(url)) {
                closeSource();
                return;
            }

            clearReconnectTimer();
            closeSource();

            source = new EventSource(url);

            source.onopen = () => {
                reconnectAttempt = 0;
                onOpenRef.current?.();
            };

            source.onmessage = (event) => {
                onMessageRef.current?.(event);
            };

            source.onerror = (event) => {
                onErrorRef.current?.(event);
                closeSource();
                scheduleReconnect();
            };
        };

        connect();

        return () => {
            closedByEffect = true;
            clearReconnectTimer();
            closeSource();
        };
    }, [url, enabled, initialRetryDelayMs, maxRetryDelayMs, jitterMs]);
};

export default useSSEWithReconnect;
