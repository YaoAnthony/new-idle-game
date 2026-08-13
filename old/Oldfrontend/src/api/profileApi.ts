//RTK Query
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

//redux
import { patchOnboarding, setProfile, setStatus, setError } from "../Redux/Features/profileSlice";
import { setGameSettings } from "../Redux/Features/gameSlice";
import { setToken, logout, setUser } from "../Redux/Features/userSlice";

//types
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { RootState } from "../Redux/store";
import type { OnboardingTourStatus, Profile, ProfileOnboarding } from "../Types/Profile";
import type { User } from "../Types/User";

//env
import { getEnv } from "../config/env";
const { backendUrl } = getEnv();

// Token 刷新锁，防止并发刷新
let refreshPromise: Promise<{ accessToken: string; expiresAt: number } | null> | null = null;


// 基础 fetchBaseQuery，自动带 cookie
const rawBaseQuery = fetchBaseQuery({
    baseUrl: backendUrl,
    credentials: "include", // 自动带 HttpOnly cookie
    prepareHeaders: (headers, { getState }) => {
        //console.log("Preparing headers");
        const token = (getState() as RootState).user.accessToken;
        //console.log("Preparing headers", (getState() as RootState).user);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return headers;
    },
});

// 包装一层，处理 401 → 自动刷新
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
    let result = await rawBaseQuery(args, api, extra);
    
    if (Number(result.error?.status) === 401) {

        // 如果已有刷新在进行中，等待它完成
        if (!refreshPromise) {
            refreshPromise = (async () => {
                const refreshRes = await rawBaseQuery(
                    { url: "/auth/refresh", method: "POST" }, // ← 路径/方法按后端实际调整
                    api,
                    extra
                );

                if (refreshRes.data) {
                    const { accessToken, expiresAt } = refreshRes.data as { accessToken: string; expiresAt: number };
                    api.dispatch(setToken({ accessToken, expiresAt }));
                    return { accessToken, expiresAt };
                } else {
                    api.dispatch(logout());
                    return null;
                }
            })().finally(() => {
                // 让下一次 401 可以重新刷新
                refreshPromise = null;
            });
        }

        // 等待当前刷新完成
        const refreshed = await refreshPromise;
        if (refreshed) {
            // 成功刷新后重试原请求
            result = await rawBaseQuery(args, api, extra);
        }
    }

    return result;
};

export const profileApi = createApi({
    // 在 Redux store 里注册时使用的 key
    reducerPath: "profileApi",

    // 基础请求函数，这里封装了带 refresh token 自动重试逻辑的 baseQuery
    baseQuery: baseQueryWithReauth,          
    
    tagTypes: ["Profile", "User"],

    // 定义各种 API endpoint（query/mutation）
    endpoints: (builder) => ({

        getActiveSystemTasks: builder.query<{
            success: boolean;
            activeTasks: Array<{
                systemId: string;
                systemName: string;
                memberUserId: string;
                memberProfileId: string;
                missionListId: string;
                missionListTitle: string;
                nodeId: string;
                nodeTitle: string;
                startedAt: string;
                timeCostMinutes: number;
                requiredSeconds: number;
                elapsedSeconds: number;
                overtimeSeconds: number;
                isOvertime: boolean;
            }>;
        }, void>({
            query: () => '/profile/active-system-tasks',
            providesTags: ['Profile'],
        }),

        updateOnboardingTour: builder.mutation<
            { success: boolean; onboarding: ProfileOnboarding },
            {
                tourKey: string;
                status: OnboardingTourStatus;
                version?: number;
                snoozedUntil?: string;
            }
        >({
            query: ({ tourKey, status, version = 1, snoozedUntil }) => ({
                url: `/profile/onboarding/tours/${encodeURIComponent(tourKey)}`,
                method: "PATCH",
                body: {
                    status,
                    version,
                    ...(snoozedUntil ? { snoozedUntil } : {}),
                },
            }),
            invalidatesTags: ["Profile"],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(patchOnboarding(data.onboarding));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || "Failed to update onboarding tour";
                    dispatch(setError(message));
                }
            },
        }),

        /**
         * 这个函数用户刷新网页时，同时获取 user 和 profile 信息
         */
        getProfileAndUser: builder.query<{ user: User; profile: Profile }, void>({
            // 请求路径
            query: () => "/profile/getProfileAndUser",
            providesTags: ["Profile", "User"],

            // 请求发起时的副作用逻辑
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                // 设置状态为 "checking"（比如 UI 可以显示 loading）
                dispatch(setStatus("checking"));
                try {
                    // 等待请求完成，拿到后端返回的 user 和 profile
                    const { data } = await queryFulfilled;
                    // 更新 Redux store 里的 profile和 user
                    dispatch(setUser(data.user));
                    dispatch(setProfile(data.profile));
                    dispatch(setGameSettings(
                        data.profile.gameSave?.worldStatus?.settings
                        ?? {},
                    ));
                    dispatch(setStatus("authenticated"));
                } catch (err) {
                    // 错误处理
                    const e = err as { error: FetchBaseQueryError };
                    const status = e.error?.status;

                    if (status === 401) {
                        // 如果是未登录/认证失败 → 清空 profile
                        dispatch(setProfile(null));
                    } else {
                        // 其他错误 → 取出后端 message，或给个默认错误提示
                        const message = (e.error?.data as { message?: string })?.message || "Failed to load profile";
                        dispatch(setError(message));
                    }
                }
            },
        }),

        /**
         * 这个函数仅获取 profile 信息
         * 用于用户登录后，单独刷新 profile
         */
        getProfile: builder.query<Profile, void>({
            // 请求路径
            query: () => "/profile/getProfile",

            // 请求发起时的副作用逻辑
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setStatus("checking"));
                try {
                    // 请求成功 → 更新 Redux store 里的 profile
                    const { data } = await queryFulfilled;
                    dispatch(setProfile(data));
                    dispatch(setGameSettings(
                        data.gameSave?.worldStatus?.settings
                        ?? {},
                    ));
                } catch (err) {
                    // 错误处理（逻辑和上面类似）
                    const e = err as { error: FetchBaseQueryError };
                    const status = e.error?.status;
                    if (status === 401) {
                        dispatch(setProfile(null));
                    } else {
                        const message =
                          (e.error?.data as { message?: string })?.message ||
                          "Failed to load profile";
                        dispatch(setError(message));
                    }
                }
            },
        }),

        /**
         * 这个函数仅获取 user 信息
         */
        renewUser: builder.query<User, void>({
            // 请求路径
            query: () => "/auth/renew",

            // 请求发起时的副作用逻辑
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setStatus("checking"));
                try {
                    // 请求成功 → 更新 Redux store 里的 user
                    const { data } = await queryFulfilled;
                    dispatch(setUser(data));
                } catch (err) {
                    // 错误处理（逻辑和上面类似）
                    const e = err as { error: FetchBaseQueryError };
                    const status = e.error?.status;
                    if (status === 401) {
                        dispatch(logout());
                    } else {
                        const message =
                          (e.error?.data as { message?: string })?.message ||
                          "Failed to load user";
                        dispatch(setError(message));
                    }
                }
            },
        }),

        // -------- Mutations for Subscription --------
        upgradeSubscription: builder.mutation<
            { user: User },
            { 
                level: 'individual' | 'enterprise'; 
                renewalPeriod: 'monthly' | 'yearly',
                couponCode?: string | null;
            }
        >({
            query: ({ level, renewalPeriod, couponCode }) => ({
                url: "/billing/upgrade-subscription",
                method: "POST",
                body: { level, renewalPeriod, couponCode },
            }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setUser(data.user));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || "Failed to upgrade subscription";
                    dispatch(setError(message));
                }
            },
        }),

        downgradeSubscription: builder.mutation<{ user: User }, void>({
            query: () => ({
                url: "/billing/downgrade-subscription",
                method: "POST",
            }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setUser(data.user));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || "Failed to downgrade subscription";
                    dispatch(setError(message));
                }
            },
        }),
    }),
});

export const {
    useGetActiveSystemTasksQuery,
    useGetProfileAndUserQuery,
    useUpdateOnboardingTourMutation,
    useLazyGetActiveSystemTasksQuery,
    useLazyGetProfileAndUserQuery,
    useLazyGetProfileQuery,
    useLazyRenewUserQuery,
    useUpgradeSubscriptionMutation,
    useDowngradeSubscriptionMutation,
} = profileApi;
