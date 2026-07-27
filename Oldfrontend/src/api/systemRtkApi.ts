import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { RootState } from '../Redux/store';
import { getEnv } from '../config/env';
import { setToken, logout } from '../Redux/Features/userSlice';
import { patchWalletCoins, setProfile } from '../Redux/Features/profileSlice';
import {
    setInventory,
    setProfileStateError,
    setProfileStateLoading,
    setWalletCoins,
    type InventoryItem,
} from '../Redux/Features/profileStateSlice';
import {
    addSystem,
    patchSystemRelationship,
    removeSystem,
    setCurrentSystem,
    setSelectedSystemId,
    setSystemError,
    setSystemLoading,
    setSystems,
    type SystemLite,
} from '../Redux/Features/systemSlice';
import type {
    AddSystemAttributePayload,
    AddSystemItemPayload,
    CreateMissionListPayload,
    CreateMissionNodePayload,
    CreateStoreProductPayload,
    CreateSystemPayload,
    UserAttributeCategory,
} from './systemApi';

import type { EconomyRarity, Mission, StoreProduct, SystemMemberSummary } from '../Types/System';
import type { GameChest } from '../Types/Profile';
import { DrawResult, LotteryHistoryRecord, LotteryPityCounter } from '../Types/Lottery';
import type { GameSaveV2 } from '../Pages/Dashboard/component/SystemIdleGame/persistence/save/GameSaveTypes';
import { getMemberSystems, isMemberSystem } from '../utils/systemRelationship';

export interface DailyQuest {
    _id: string;
    title: string;
    description: string;
    rewards: { experience?: { name: string; value: number }[]; coins?: number; items?: { itemKey: string; quantity: number }[] };
    rarity?: EconomyRarity;
    importance?: number;
    rewardReason?: string;
    isUnlimited: boolean;
    maxCompletions: number;
    totalCompletions: number;
    isActive: boolean;
}

export interface UserDailyQuestStatus {
    questId: string;
    title: string;
    description: string;
    rewards: DailyQuest['rewards'];
    rarity?: DailyQuest['rarity'];
    importance?: number;
    rewardReason?: string;
    isUnlimited: boolean;
    maxCompletions: number;
    completedCount: number;
    completed: boolean;
}

const normalizeStoreType = (value: CreateStoreProductPayload['type']) => {
    if (value === 'consumables') return 'item';
    if (value === 'cache chance') return 'lottery_chance';
    return value;
};

const { backendUrl } = getEnv();

const rawBaseQuery = fetchBaseQuery({
    baseUrl: backendUrl,
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
        const token = (getState() as RootState).user.accessToken;
        if (token) headers.set('Authorization', `Bearer ${token}`);
        return headers;
    },
});


const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
    args,
    api,
    extraOptions
) => {
    let result = await rawBaseQuery(args, api, extraOptions);

    // Only refresh on 401 (token expired/invalid). A 403 is a genuine permission error
    // and should NOT trigger a token refresh or logout — it would create an incorrect logout loop.
    if (result.error?.status === 401) {
        const refreshResult = await rawBaseQuery({ url: '/auth/refresh', method: 'POST' }, api, extraOptions);
        if (refreshResult.data) {
            const { accessToken, expiresAt } = refreshResult.data as { accessToken: string; expiresAt: number };
            api.dispatch(setToken({ accessToken, expiresAt }));
            result = await rawBaseQuery(args, api, extraOptions);
        } else {
            api.dispatch(logout());
        }
    }

    return result;
};

export const systemRtkApi = createApi({
    reducerPath: 'systemRtkApi',
    baseQuery: baseQueryWithReauth,
    tagTypes: ['System', 'SystemList', 'SystemMembers', 'MemberTasks', 'DailyQuests'],
    endpoints: (builder) => ({
        createSystem: builder.mutation<{ success: boolean; system: Record<string, unknown> }, CreateSystemPayload>({
            query: (body) => ({
                url: '/system/create',
                method: 'POST',
                body,
            }),
            invalidatesTags: ['SystemList'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setSystemLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    const system = data.system as unknown as SystemLite;
                    dispatch(addSystem(system));
                    dispatch(setCurrentSystem(data.system));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to create system';
                    dispatch(setSystemError(message));
                }
            },
        }),

        getSystemList: builder.query<{ systems: SystemLite[] }, void>({
            query: () => '/system/list',
            providesTags: ['SystemList'],
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                dispatch(setSystemLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    const systems = data.systems || [];
                    const joinedSystems = getMemberSystems(systems);
                    const selectedSystemId = (getState() as RootState).system.selectedSystemId;
                    const selectedStillExists = Boolean(
                        selectedSystemId && joinedSystems.some((system) => system._id === selectedSystemId)
                    );

                    dispatch(setSystems(systems));
                    if (!selectedStillExists) {
                        dispatch(setSelectedSystemId(joinedSystems[0]?._id || null));
                    }
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to load systems';
                    dispatch(setSystemError(message));
                }
            },
        }),

        getSystemDetail: builder.query<{ system: Record<string, unknown> }, { systemId: string }>({
            query: ({ systemId }) => `/system/${systemId}`,
            providesTags: (_result, _error, arg) => [{ type: 'System', id: arg.systemId }],
            async onQueryStarted(arg, { dispatch, queryFulfilled }) {
                dispatch(setSystemLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    const system = data.system as unknown as SystemLite;
                    if (isMemberSystem(system)) {
                        dispatch(setSelectedSystemId(arg.systemId));
                    }
                    dispatch(setCurrentSystem(data.system));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to load system detail';
                    dispatch(setSystemError(message));
                }
            },
        }),

        getSystemMembers: builder.query<{ members: SystemMemberSummary[] }, { systemId: string }>({
            query: ({ systemId }) => `/system/${systemId}/members`,
            providesTags: (_result, _error, arg) => [{ type: 'SystemMembers', id: arg.systemId }],
        }),

        searchSystem: builder.query<{ system: SystemLite }, { systemId: string }>({
            query: ({ systemId }) => `/system/search/${systemId}`,
            async onQueryStarted(_arg, { queryFulfilled }) {
                try {
                    await queryFulfilled;
                } catch (err) {
                    console.error('Search system error:', err);
                }
            },
        }),
        joinSystem: builder.mutation<{ success: boolean; system: Record<string, unknown> }, { systemId: string }>({
            query: ({ systemId }) => ({
                url: `/system/${systemId}/join`,
                method: 'POST',
                body: {},
            }),
            invalidatesTags: (_res, _err, arg) => [
                'SystemList',
                { type: 'SystemMembers', id: arg.systemId },
                { type: 'DailyQuests', id: arg.systemId },
            ],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data?.system) {
                        dispatch(addSystem(data.system as unknown as SystemLite));
                    }
                } catch (err) {
                    console.error('Join system error:', err);
                }
            },
        }),
        leaveSystem: builder.mutation<{ success: boolean; systemId: string; ownerMembershipOnly?: boolean }, { systemId: string }>({
            query: ({ systemId }) => ({
                url: `/system/${systemId}/leave`,
                method: 'POST',
                body: {},
            }),
            invalidatesTags: (_res, _err, arg) => ['SystemList', { type: 'SystemMembers', id: arg.systemId }],
            async onQueryStarted({ systemId }, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;

                    if (data.ownerMembershipOnly) {
                        dispatch(patchSystemRelationship({ systemId, isOwner: true, isMember: false }));

                        const state = getState() as RootState;
                        const currentProfile = state.profile.profile;
                        if (currentProfile) {
                            dispatch(setProfile({
                                ...currentProfile,
                                inventory: (currentProfile.inventory || []).filter(
                                    (entry) => String(entry.sourceSystem || '') !== String(systemId)
                                ),
                            }));
                        }
                        return;
                    }

                    dispatch(removeSystem(systemId));

                    const state = getState() as RootState;
                    const currentProfile = state.profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            systems: (currentProfile.systems || []).filter((item) => item._id !== systemId),
                            inventory: (currentProfile.inventory || []).filter(
                                (entry) => String(entry.sourceSystem || '') !== String(systemId)
                            ),
                        }));
                    }
                } catch (err) {
                    console.error('Leave system error:', err);
                }
            },
        }),
        deleteSystem: builder.mutation<{ success: boolean; systemId: string }, { systemId: string }>({
            query: ({ systemId }) => ({
                url: `/system/${systemId}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_res, _err, arg) => ['SystemList', { type: 'SystemMembers', id: arg.systemId }],
            async onQueryStarted({ systemId }, { dispatch, getState, queryFulfilled }) {
                try {
                    await queryFulfilled;
                    dispatch(removeSystem(systemId));

                    const state = getState() as RootState;
                    const currentProfile = state.profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            systems: (currentProfile.systems || []).filter((item) => item._id !== systemId),
                            inventory: (currentProfile.inventory || []).filter(
                                (entry) => String(entry.sourceSystem || '') !== String(systemId)
                            ),
                        }));
                    }
                } catch (err) {
                    console.error('Delete system error:', err);
                }
            },
        }),
        initSixAttributeBoards: builder.mutation<{ success: boolean }, { systemId: string }>({
            query: ({ systemId }) => ({
                url: `/system/${systemId}/attributes/init-six-boards`,
                method: 'POST',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        addSystemAttribute: builder.mutation<
            { success: boolean },
            { systemId: string } & AddSystemAttributePayload
        >({
            query: ({ systemId, ...body }) => ({
                url: `/system/${systemId}/attributes`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        markSystemAttributeUsed: builder.mutation<
            { success: boolean },
            { systemId: string; category: UserAttributeCategory; attributeName: string; used?: boolean }
        >({
            query: ({ systemId, category, attributeName, used = true }) => ({
                url: `/system/${systemId}/attributes/${category}/${encodeURIComponent(attributeName)}/mark-used`,
                method: 'PATCH',
                body: { used },
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        deleteSystemAttribute: builder.mutation<
            { success: boolean },
            { systemId: string; category: UserAttributeCategory; attributeName: string }
        >({
            query: ({ systemId, category, attributeName }) => ({
                url: `/system/${systemId}/attributes/${category}/${encodeURIComponent(attributeName)}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        addSystemItem: builder.mutation<{ success: boolean }, { systemId: string } & AddSystemItemPayload>({
            query: ({ systemId, ...body }) => ({
                url: `/system/${systemId}/items`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        createMissionList: builder.mutation<
            { success: boolean },
            { systemId: string } & CreateMissionListPayload
        >({
            query: ({ systemId, ...body }) => ({
                url: `/system/${systemId}/mission-lists`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        updateMissionList: builder.mutation<
            { success: boolean },
            { systemId: string; missionListId: string } & CreateMissionListPayload
        >({
            query: ({ systemId, missionListId, ...body }) => ({
                url: `/system/${systemId}/mission-lists/${missionListId}`,
                method: 'PATCH',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        deleteMissionList: builder.mutation<
            { success: boolean },
            { systemId: string; missionListId: string }
        >({
            query: ({ systemId, missionListId }) => ({
                url: `/system/${systemId}/mission-lists/${missionListId}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        createMissionNode: builder.mutation<
            { success: boolean },
            { systemId: string; missionListId: string } & CreateMissionNodePayload
        >({
            query: ({ systemId, missionListId, ...body }) => ({
                url: `/system/${systemId}/mission-lists/${missionListId}/nodes`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        deleteMissionNode: builder.mutation<
            { success: boolean; deletedNodeIds: string[] },
            { systemId: string; missionListId: string; nodeId: string }
        >({
            query: ({ systemId, missionListId, nodeId }) => ({
                url: `/system/${systemId}/mission-lists/${missionListId}/nodes/${nodeId}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        updateMissionNode: builder.mutation<
            { success: boolean },
            {
                systemId: string;
                missionListId: string;
                nodeId: string;
                title: string;
                description?: string;
                content?: string;
                notice?: string;
                timeCostMinutes: number;
                canInterrupt?: boolean;
                rewards?: {
                    coins?: number;
                    experience?: Array<{ name: string; value: number }>;
                    items?: Array<{ itemKey: string; quantity: number }>;
                    unlockMissions?: Array<{ missionId: string; title: string; description?: string }>;
                };
            }
        >({
            query: ({ systemId, missionListId, nodeId, ...body }) => ({
                url: `/system/${systemId}/mission-lists/${missionListId}/nodes/${nodeId}`,
                method: 'PATCH',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        getMemberTaskCenter: builder.query<
            {
                success: boolean;
                missionLists: Array<Mission>;
                activeTask: {
                    missionListId: string;
                    nodeId: string;
                    startedAt: string;
                } | null;
                history: Array<{
                    _id: string;
                    eventType: string;
                    missionListId: string;
                    nodeId?: string | null;
                    taskTitle?: string;
                    timestamp: string;
                }>;
                completedCount: number;
            },
            { systemId: string }
        >({
            query: ({ systemId }) => `/system/${systemId}/member/tasks`,
            providesTags: (_res, _err, arg) => [{ type: 'MemberTasks', id: arg.systemId }],
        }),

        acceptMissionList: builder.mutation<
            { success: boolean; missionListId: string },
            { systemId: string; missionListId: string }
        >({
            query: ({ systemId, missionListId }) => ({
                url: `/system/${systemId}/member/mission-lists/${missionListId}/accept`,
                method: 'POST',
                body: {},
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'MemberTasks', id: arg.systemId }],
        }),

        startMemberTask: builder.mutation<
            { success: boolean },
            { systemId: string; missionListId: string; nodeId: string }
        >({
            query: ({ systemId, missionListId, nodeId }) => ({
                url: `/system/${systemId}/member/mission-lists/${missionListId}/nodes/${encodeURIComponent(nodeId)}/start`,
                method: 'POST',
                body: {},
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'MemberTasks', id: arg.systemId }],
        }),

        completeMemberTask: builder.mutation<
            {
                success: boolean;
                rewards?: {
                    experience?: Array<{ name: string; value: number }>;
                    coins?: number;
                    items?: Array<{ itemKey: string; quantity: number }>;
                };
                gameSave?: GameSaveV2;
                mask?: unknown;
                maskProgress?: { level: number; progress: number; required: number };
                previousMask?: unknown;
                previousMaskProgress?: { level: number; progress: number; required: number };
                maskConfiguration?: GameSaveV2['worldStatus']['configuration'];
                previousMaskConfiguration?: GameSaveV2['worldStatus']['configuration'];
                levelUps?: number;
                completedNodeId?: string;
                missionListCompleted?: boolean;
                spawnedChest?: GameChest | null;
                mergeBonus?: {
                    tier?: 'milestone' | 'boss' | null;
                    coins?: number;
                    experience?: Array<{ name: string; value: number }>;
                } | null;
                unlockedMergeNodes?: Array<{
                    nodeId: string;
                    title: string;
                    mergeTier?: 'milestone' | 'boss' | null;
                }>;
            },
            { systemId: string; missionListId: string; nodeId: string; roomId?: string | null }
        >({
            query: ({ systemId, missionListId, nodeId, roomId }) => ({
                url: `/system/${systemId}/member/mission-lists/${missionListId}/nodes/${encodeURIComponent(nodeId)}/complete`,
                method: 'POST',
                body: roomId ? { roomId } : {},
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'MemberTasks', id: arg.systemId }],
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile && data.gameSave) {
                        dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave }));
                    }
                } catch {
                    // mutation caller owns user-facing error copy
                }
            },
        }),

        failMemberTask: builder.mutation<
            { success: boolean; failedNodeId: string },
            { systemId: string; missionListId: string; nodeId: string }
        >({
            query: ({ systemId, missionListId, nodeId }) => ({
                url: `/system/${systemId}/member/mission-lists/${missionListId}/nodes/${encodeURIComponent(nodeId)}/fail`,
                method: 'POST',
                body: {},
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'MemberTasks', id: arg.systemId }],
        }),

        restartMemberTask: builder.mutation<
            { success: boolean },
            { systemId: string; missionListId: string; nodeId: string }
        >({
            query: ({ systemId, missionListId, nodeId }) => ({
                url: `/system/${systemId}/member/mission-lists/${missionListId}/nodes/${encodeURIComponent(nodeId)}/restart`,
                method: 'POST',
                body: {},
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'MemberTasks', id: arg.systemId }],
        }),

        getMemberCurrentTask: builder.query<
            {
                success: boolean;
                activeTask: {
                    missionListId: string;
                    missionListTitle: string;
                    nodeId: string;
                    nodeTitle: string;
                    description?: string;
                    timeCostMinutes?: number;
                    startedAt: string;
                } | null;
            },
            { systemId: string }
        >({
            query: ({ systemId }) => `/system/${systemId}/member/tasks/current`,
            providesTags: (_res, _err, arg) => [{ type: 'MemberTasks', id: arg.systemId }],
        }),

        getMemberTaskHistory: builder.query<
            {
                success: boolean;
                history: Array<{
                    _id: string;
                    eventType: string;
                    missionListId: string;
                    nodeId?: string | null;
                    taskTitle?: string;
                    timestamp: string;
                }>;
            },
            { systemId: string }
        >({
            query: ({ systemId }) => `/system/${systemId}/member/tasks/history`,
            providesTags: (_res, _err, arg) => [{ type: 'MemberTasks', id: arg.systemId }],
        }),

        createStoreProduct: builder.mutation<
            { success: boolean; storeProducts: StoreProduct[] },
            { systemId: string } & CreateStoreProductPayload
        >({
            query: ({ systemId, type, ...body }) => ({
                url: `/system/${systemId}/store-products`,
                method: 'POST',
                body: {
                    ...body,
                    type: normalizeStoreType(type),
                },
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        updateStoreProduct: builder.mutation<
            { success: boolean; storeProducts: StoreProduct[] },
            { systemId: string; productId: string } & Partial<CreateStoreProductPayload>
        >({
            query: ({ systemId, productId, type, ...body }) => ({
                url: `/system/${systemId}/store-products/${productId}`,
                method: 'PATCH',
                body: {
                    ...body,
                    ...(type && { type: normalizeStoreType(type) }),
                },
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        deleteStoreProduct: builder.mutation<
            { success: boolean; storeProducts: StoreProduct[] },
            { systemId: string; productId: string }
        >({
            query: ({ systemId, productId }) => ({
                url: `/system/${systemId}/store-products/${productId}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        repriceStoreProduct: builder.mutation<
            { success: boolean; storeProducts: StoreProduct[]; product: StoreProduct },
            { systemId: string; productId: string }
        >({
            query: ({ systemId, productId }) => ({
                url: `/system/${systemId}/store-products/${productId}/reprice`,
                method: 'POST',
                body: {},
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        toggleStoreProductListing: builder.mutation<
            { success: boolean; storeProducts: StoreProduct[] },
            { systemId: string; productId: string }
        >({
            query: ({ systemId, productId }) => ({
                url: `/system/${systemId}/store-products/${productId}/listing`,
                method: 'PATCH',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        purchaseStoreProduct: builder.mutation<
            {
                success: boolean;
                message: string;
                wallet?: { coins: number };
                inventory?: InventoryItem[];
                purchase: {
                    productId: string;
                    productName: string;
                    quantity: number;
                    unitPrice: number;
                    totalCost: number;
                    remainingCoins: number;
                };
            },
            { systemId: string; productId: string; quantity?: number }
        >({
            query: ({ systemId, productId, quantity = 1 }) => ({
                url: `/system/${systemId}/member/store-products/${productId}/purchase`,
                method: 'POST',
                body: { quantity },
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setProfileStateLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    const coins = data.wallet?.coins ?? data.purchase.remainingCoins;
                    dispatch(setWalletCoins(coins));
                    dispatch(patchWalletCoins(coins));
                    if (data.inventory) dispatch(setInventory(data.inventory));
                    dispatch(setProfileStateLoading(false));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to purchase product';
                    dispatch(setProfileStateError(message));
                }
            },
        }),

        // ── Lottery Pool CRUD ───────────────────────────────────────────────
        createLotteryPool: builder.mutation<
            { success: boolean; lotteryPools: unknown[] },
            { systemId: string; name: string; description?: string; image?: string; drawMode?: 'simple' | 'genshin'; consume?: { type: string; itemKey?: string | null; quantity?: number } }
        >({
            query: ({ systemId, ...body }) => ({
                url: `/system/${systemId}/lottery-pools`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        updateLotteryPool: builder.mutation<
            { success: boolean; lotteryPools: unknown[] },
            { systemId: string; poolId: string; name?: string; description?: string; image?: string; canGetNothing?: boolean; consume?: { type: string; itemKey?: string | null; quantity?: number } }
        >({
            query: ({ systemId, poolId, ...body }) => ({
                url: `/system/${systemId}/lottery-pools/${poolId}`,
                method: 'PATCH',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        deleteLotteryPool: builder.mutation<
            { success: boolean },
            { systemId: string; poolId: string }
        >({
            query: ({ systemId, poolId }) => ({
                url: `/system/${systemId}/lottery-pools/${poolId}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        generatePoolDescription: builder.mutation<
            { success: boolean; description: string },
            { systemId: string; poolId: string }
        >({
            query: ({ systemId, poolId }) => ({
                url: `/system/${systemId}/lottery-pools/${poolId}/generate-description`,
                method: 'POST',
                body: {},
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        // ── Simple mode prizes ──────────────────────────────────────────────
        addSimplePrize: builder.mutation<
            { success: boolean },
            { systemId: string; poolId: string; type: 'item' | 'coins'; productId?: string | null; quantity: number; probability: number }
        >({
            query: ({ systemId, poolId, ...body }) => ({
                url: `/system/${systemId}/lottery-pools/${poolId}/simple-prizes`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        deleteSimplePrize: builder.mutation<
            { success: boolean },
            { systemId: string; poolId: string; prizeId: string }
        >({
            query: ({ systemId, poolId, prizeId }) => ({
                url: `/system/${systemId}/lottery-pools/${poolId}/simple-prizes/${prizeId}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        // ── Genshin tier management ─────────────────────────────────────────
        updateGenshinTier: builder.mutation<
            { success: boolean },
            { systemId: string; poolId: string; tierIndex: number; name?: string; baseRate?: number; softPityStart?: number; hardPityLimit?: number; softPityIncrement?: number }
        >({
            query: ({ systemId, poolId, tierIndex, ...body }) => ({
                url: `/system/${systemId}/lottery-pools/${poolId}/genshin-tiers/${tierIndex}`,
                method: 'PATCH',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        addGenshinTierItem: builder.mutation<
            { success: boolean },
            { systemId: string; poolId: string; tierIndex: number; type: 'item' | 'coins'; productId?: string | null; quantity: number }
        >({
            query: ({ systemId, poolId, tierIndex, ...body }) => ({
                url: `/system/${systemId}/lottery-pools/${poolId}/genshin-tiers/${tierIndex}/items`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        deleteGenshinTierItem: builder.mutation<
            { success: boolean },
            { systemId: string; poolId: string; tierIndex: number; itemId: string }
        >({
            query: ({ systemId, poolId, tierIndex, itemId }) => ({
                url: `/system/${systemId}/lottery-pools/${poolId}/genshin-tiers/${tierIndex}/items/${itemId}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        // ── Draw ────────────────────────────────────────────────────────────
        drawLotteryPool: builder.mutation<
            {
                success: boolean;
                draws: DrawResult[];
                draw: DrawResult | null;
                pityCount: number;
                consumed?: { type: string; itemKey: string | null; quantity: number } | null;
            },
            { systemId: string; poolId: string; count?: number }
        >({
            query: ({ systemId, poolId, count = 1 }) => ({
                url: `/system/${systemId}/member/lottery-pools/${poolId}/draw`,
                method: 'POST',
                body: { count },
            }),
        }),

        getMemberLotteryPity: builder.query<
            { success: boolean; pityCounters: LotteryPityCounter[] },
            { systemId: string }
        >({
            query: ({ systemId }) => `/system/${systemId}/member/lottery/pity`,
        }),

        getMemberLotteryHistory: builder.query<
            { success: boolean; history: LotteryHistoryRecord[] },
            { systemId: string; limit?: number }
        >({
            query: ({ systemId, limit = 30 }) => `/system/${systemId}/member/lottery/history?limit=${limit}`,
        }),

        // ── Daily Quests ─────────────────────────────────────────────────────
        getDailyQuestSettings: builder.query<
            { success: boolean; settings: { dailyCount: number; enabled: boolean } },
            { systemId: string }
        >({
            query: ({ systemId }) => `/system/${systemId}/daily-quests/settings`,
        }),

        updateDailyQuestSettings: builder.mutation<
            { success: boolean; settings: { dailyCount: number; enabled: boolean } },
            { systemId: string; dailyCount?: number; enabled?: boolean }
        >({
            query: ({ systemId, ...body }) => ({
                url: `/system/${systemId}/daily-quests/settings`,
                method: 'PATCH',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, { type: 'DailyQuests', id: arg.systemId }],
        }),

        getDailyQuestPool: builder.query<
            { success: boolean; pool: DailyQuest[] },
            { systemId: string }
        >({
            query: ({ systemId }) => `/system/${systemId}/daily-quests/pool`,
            providesTags: (_res, _err, arg) => [{ type: 'DailyQuests', id: arg.systemId }],
        }),

        createDailyQuest: builder.mutation<
            { success: boolean; pool: DailyQuest[] },
            { systemId: string; title: string; description?: string; importance?: number; isUnlimited?: boolean; maxCompletions?: number; isActive?: boolean }
        >({
            query: ({ systemId, ...body }) => ({
                url: `/system/${systemId}/daily-quests/pool`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, { type: 'DailyQuests', id: arg.systemId }],
        }),

        updateDailyQuest: builder.mutation<
            { success: boolean; pool: DailyQuest[] },
            { systemId: string; questId: string; title?: string; description?: string; importance?: number; isUnlimited?: boolean; maxCompletions?: number; isActive?: boolean }
        >({
            query: ({ systemId, questId, ...body }) => ({
                url: `/system/${systemId}/daily-quests/pool/${questId}`,
                method: 'PATCH',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, { type: 'DailyQuests', id: arg.systemId }],
        }),

        deleteDailyQuest: builder.mutation<
            { success: boolean; pool: DailyQuest[] },
            { systemId: string; questId: string }
        >({
            query: ({ systemId, questId }) => ({
                url: `/system/${systemId}/daily-quests/pool/${questId}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, { type: 'DailyQuests', id: arg.systemId }],
        }),

        getMemberDailyQuests: builder.query<
            { success: boolean; quests: UserDailyQuestStatus[]; date: string; message?: string },
            { systemId: string }
        >({
            query: ({ systemId }) => `/system/${systemId}/member/daily-quests`,
            providesTags: (_res, _err, arg) => [{ type: 'DailyQuests', id: arg.systemId }],
        }),

        completeDailyQuest: builder.mutation<
            {
                success: boolean;
                quests: UserDailyQuestStatus[];
                rewards: object;
                wallet?: { coins: number };
                gameSave?: GameSaveV2;
                mask?: unknown;
                maskProgress?: { level: number; progress: number; required: number };
                previousMask?: unknown;
                previousMaskProgress?: { level: number; progress: number; required: number };
                maskConfiguration?: GameSaveV2['worldStatus']['configuration'];
                previousMaskConfiguration?: GameSaveV2['worldStatus']['configuration'];
                levelUps?: number;
            },
            { systemId: string; questId: string; roomId?: string | null }
        >({
            query: ({ systemId, questId, roomId }) => ({
                url: `/system/${systemId}/member/daily-quests/${questId}/complete`,
                method: 'POST',
                body: roomId ? { roomId } : {},
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'DailyQuests', id: arg.systemId }],
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (typeof data.wallet?.coins === 'number') {
                        dispatch(setWalletCoins(data.wallet.coins));
                        dispatch(patchWalletCoins(data.wallet.coins));
                    }
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile && data.gameSave) {
                        dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave }));
                    }
                } catch (err) {
                    console.error('Complete daily quest error:', err);
                }
            },
        }),

        aiTaskChat: builder.mutation<
            {
                reply: string;
                action: string | null;
                proposal?: {
                    title: string;
                    listType: string;
                    description: string;
                    rewardGoalSummary?: string;
                    rewardTargetCoins?: number | null;
                    rewardPlanningMode?: 'user_specified' | 'ai_suggested';
                    rewardPlanningNote?: string;
                    nodes: Array<{
                        tempId: string;
                        parentTempId: string | null;
                        prerequisiteTempIds?: string[];
                        title: string;
                        description?: string;
                        timeCostMinutes: number;
                        rewards?: {
                            experience?: Array<{ name: string; value: number }>;
                            coins?: number;
                            items?: Array<{ itemKey: string; quantity: number }>;
                        };
                    }>;
                    mode?: 'create_new_list' | 'attach_to_existing_list';
                    structureType?: 'linear' | 'branched' | 'merge';
                    attachTargetMissionListId?: string | null;
                    attachTargetMissionListTitle?: string;
                    attachTargetNodeId?: string | null;
                    attachTargetNodeTitle?: string;
                };
                missionList?: object;
            },
            { systemId: string; messages: Array<{ role: string; content: string }> }
        >({
            query: ({ systemId, messages }) => ({
                url: `/system/${systemId}/ai-task-chat`,
                method: 'POST',
                body: { messages },
            }),
        }),

        aiTaskConfirm: builder.mutation<
            { success: boolean; reply: string; action: string; missionList: object },
            {
                systemId: string;
                proposal: {
                    title: string;
                    listType: string;
                    description: string;
                    rewardGoalSummary?: string;
                    rewardTargetCoins?: number | null;
                    rewardPlanningMode?: 'user_specified' | 'ai_suggested';
                    rewardPlanningNote?: string;
                    nodes: Array<{
                        tempId: string;
                        parentTempId: string | null;
                        prerequisiteTempIds?: string[];
                        title: string;
                        description?: string;
                        timeCostMinutes: number;
                        rewards?: {
                            experience?: Array<{ name: string; value: number }>;
                            coins?: number;
                            items?: Array<{ itemKey: string; quantity: number }>;
                        };
                    }>;
                    mode?: 'create_new_list' | 'attach_to_existing_list';
                    structureType?: 'linear' | 'branched' | 'merge';
                    attachTargetMissionListId?: string | null;
                    attachTargetMissionListTitle?: string;
                    attachTargetNodeId?: string | null;
                    attachTargetNodeTitle?: string;
                };
            }
        >({
            query: ({ systemId, proposal }) => ({
                url: `/system/${systemId}/ai-task-confirm`,
                method: 'POST',
                body: { proposal },
            }),
        }),
    }),
});

export const {
    useCreateSystemMutation,
    useGetSystemListQuery,
    useGetSystemDetailQuery,
    useGetSystemMembersQuery,
    useLazyGetSystemListQuery,
    useLazyGetSystemDetailQuery,
    useLazySearchSystemQuery,
    useJoinSystemMutation,
    useLeaveSystemMutation,
    useDeleteSystemMutation,
    useInitSixAttributeBoardsMutation,
    useAddSystemAttributeMutation,
    useMarkSystemAttributeUsedMutation,
    useDeleteSystemAttributeMutation,
    useAddSystemItemMutation,
    useCreateMissionListMutation,
    useUpdateMissionListMutation,
    useDeleteMissionListMutation,
    useCreateMissionNodeMutation,
    useDeleteMissionNodeMutation,
    useUpdateMissionNodeMutation,
    useGetMemberTaskCenterQuery,
    useLazyGetMemberTaskCenterQuery,
    useAcceptMissionListMutation,
    useStartMemberTaskMutation,
    useCompleteMemberTaskMutation,
    useFailMemberTaskMutation,
    useRestartMemberTaskMutation,
    useGetMemberCurrentTaskQuery,
    useLazyGetMemberCurrentTaskQuery,
    useGetMemberTaskHistoryQuery,
    useLazyGetMemberTaskHistoryQuery,
    useCreateStoreProductMutation,
    useUpdateStoreProductMutation,
    useDeleteStoreProductMutation,
    useRepriceStoreProductMutation,
    useToggleStoreProductListingMutation,
    usePurchaseStoreProductMutation,
    useCreateLotteryPoolMutation,
    useUpdateLotteryPoolMutation,
    useDeleteLotteryPoolMutation,
    useGeneratePoolDescriptionMutation,
    useAddSimplePrizeMutation,
    useDeleteSimplePrizeMutation,
    useUpdateGenshinTierMutation,
    useAddGenshinTierItemMutation,
    useDeleteGenshinTierItemMutation,
    useDrawLotteryPoolMutation,
    useGetMemberLotteryHistoryQuery,
    useLazyGetMemberLotteryHistoryQuery,
    useGetMemberLotteryPityQuery,
    useLazyGetMemberLotteryPityQuery,
    useGetDailyQuestSettingsQuery,
    useLazyGetDailyQuestSettingsQuery,
    useUpdateDailyQuestSettingsMutation,
    useGetDailyQuestPoolQuery,
    useLazyGetDailyQuestPoolQuery,
    useCreateDailyQuestMutation,
    useUpdateDailyQuestMutation,
    useDeleteDailyQuestMutation,
    useGetMemberDailyQuestsQuery,
    useLazyGetMemberDailyQuestsQuery,
    useCompleteDailyQuestMutation,
    useAiTaskChatMutation,
    useAiTaskConfirmMutation,
} = systemRtkApi;
