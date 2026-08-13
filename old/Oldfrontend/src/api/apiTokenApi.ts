import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { RootState } from "../Redux/store";
import { logout, setToken } from "../Redux/Features/userSlice";
import { getEnv } from "../config/env";

const { backendUrl } = getEnv();

export type ApiTokenProviderCatalog = {
    id: string;
    label: string;
    baseURL: string;
    defaultModel: string;
};

export type ApiTokenUseCaseCatalog = {
    id: string;
    label: string;
    description: string;
    purposes: string[];
};

export type ApiTokenPublicProviderConfig = {
    enabled: boolean;
    baseURL: string;
    model: string;
    hasApiKey: boolean;
    apiKeyPreview: string;
    keySource: "database" | "environment" | "none";
};

export type ApiTokenRouteConfig = {
    provider: string;
    model: string;
};

export type ApiTokenStatus = {
    configured: boolean;
    missingUseCases: string[];
};

export type ApiTokenConfigResponse = {
    catalog: {
        providers: ApiTokenProviderCatalog[];
        useCases: ApiTokenUseCaseCatalog[];
    };
    config: {
        providers: Record<string, ApiTokenPublicProviderConfig>;
        routing: Record<string, ApiTokenRouteConfig>;
    };
    status: ApiTokenStatus;
};

export type SaveApiTokenConfigRequest = {
    providers: Record<string, {
        enabled: boolean;
        baseURL: string;
        model: string;
        apiKey?: string;
        clearApiKey?: boolean;
    }>;
    routing: Record<string, ApiTokenRouteConfig>;
};

export type TestApiTokenProviderRequest = {
    provider?: string;
    purpose?: string;
    model?: string;
    providerConfig?: {
        apiKey?: string;
        baseURL?: string;
        model?: string;
    };
};

let refreshPromise: Promise<{ accessToken: string; expiresAt: number } | null> | null = null;

const rawBaseQuery = fetchBaseQuery({
    baseUrl: backendUrl,
    credentials: "include",
    prepareHeaders: (headers, { getState }) => {
        const token = (getState() as RootState).user.accessToken;
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return headers;
    },
});

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
    let result = await rawBaseQuery(args, api, extra);

    if (Number(result.error?.status) === 401) {
        if (!refreshPromise) {
            refreshPromise = (async () => {
                const refreshRes = await rawBaseQuery({ url: "/auth/refresh", method: "POST" }, api, extra);
                if (refreshRes.data) {
                    const { accessToken, expiresAt } = refreshRes.data as { accessToken: string; expiresAt: number };
                    api.dispatch(setToken({ accessToken, expiresAt }));
                    return { accessToken, expiresAt };
                }
                api.dispatch(logout());
                return null;
            })().finally(() => {
                refreshPromise = null;
            });
        }

        const refreshed = await refreshPromise;
        if (refreshed) result = await rawBaseQuery(args, api, extra);
    }

    return result;
};

export const apiTokenApi = createApi({
    reducerPath: "apiTokenApi",
    baseQuery: baseQueryWithReauth,
    tagTypes: ["ApiTokenConfig"],
    endpoints: (builder) => ({
        getApiTokenConfig: builder.query<ApiTokenConfigResponse, void>({
            query: () => "/token/config",
            providesTags: ["ApiTokenConfig"],
        }),
        getApiTokenStatus: builder.query<ApiTokenStatus, void>({
            query: () => "/token/status",
            providesTags: ["ApiTokenConfig"],
        }),
        saveApiTokenConfig: builder.mutation<ApiTokenConfigResponse, SaveApiTokenConfigRequest>({
            query: (body) => ({
                url: "/token/config",
                method: "PUT",
                body,
            }),
            invalidatesTags: ["ApiTokenConfig"],
        }),
        testApiTokenProvider: builder.mutation<{ ok: boolean; provider: string; model: string; message?: string }, TestApiTokenProviderRequest>({
            query: (body) => ({
                url: "/token/test",
                method: "POST",
                body,
            }),
        }),
    }),
});

export const {
    useGetApiTokenConfigQuery,
    useGetApiTokenStatusQuery,
    useLazyGetApiTokenStatusQuery,
    useSaveApiTokenConfigMutation,
    useTestApiTokenProviderMutation,
} = apiTokenApi;
