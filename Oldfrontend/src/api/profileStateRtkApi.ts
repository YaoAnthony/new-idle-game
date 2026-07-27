import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { RootState } from '../Redux/store';
import { getEnv } from '../config/env';
import { setToken, logout } from '../Redux/Features/userSlice';
import { patchWalletCoins, setProfile } from '../Redux/Features/profileSlice';
import {
    setInventory,
    setProfileAttributes,
    setProfileState,
    setProfileStateError,
    setProfileStateLoading,
    setProfileSkillTree,
    setProfileControls,
    setWalletCoins,
    type InventoryItem,
    type UserAttributeKey,
    type UserAttributeValue,
} from '../Redux/Features/profileStateSlice';
import type { CoinOperation, ProfileAttributePatchPayload } from './profileStateApi';
import type { GameChest } from '../Types/Profile';
import type { ProfileStateResponse as CoreProfileStateResponse } from '@timeplan-game/core/contracts/profile/profileTypes';
import type { ProfileSkillTreeState } from '@timeplan-game/core/protagonist/skillTree';
import type { NpcMemoryEntry, NpcChatResponse } from '../Pages/Dashboard/component/SystemIdleGame/types';
import type { GameInventoryItem, FarmTile, CreatureState } from '../Redux/Features/gameSlice';
import { setGameInventory, setFarmTiles, setGameSettings, setNpcInventory, upsertFarmTile } from '../Redux/Features/gameSlice';
import type { GameSaveMeta, GameSaveV2, TempleSaveState } from '../Pages/Dashboard/component/SystemIdleGame/persistence/save/GameSaveTypes';
import type { StorageChestSave, StorageChestSlotItem } from '../Pages/Dashboard/component/SystemIdleGame/features/storage/StorageChestTypes';
import type {
    BuildingApiResponse,
    BuildingAssemblyResolveRequest,
    BuildingAssemblyResolveResponse,
    BuildingDefinition,
    MoveBuildingRequest,
    PlaceBuildingRequest,
    RotateBuildingRequest,
} from '../Pages/Dashboard/component/SystemIdleGame/features/building/BuildingTypes';
import type {
    AssignGolemRequest,
    AwakenGolemRequest,
    GolemApiResponse,
    SpawnGolemRequest,
} from '../Pages/Dashboard/component/SystemIdleGame/features/golem/GolemTypes';
import type { GameCatalogPayload } from '../Pages/Dashboard/component/SystemIdleGame/features/catalog';
import type {
    NpcTradeExecuteRequest,
    NpcTradeExecuteResponse,
} from '../Pages/Dashboard/component/SystemIdleGame/features/npc/trade/NpcTradeTypes';
import type {
    ClaimPetTravelPhotoRequest,
    PetTravelPhotoResponse,
    SendPetTravelPhotoRequest,
} from '../Pages/Dashboard/component/SystemIdleGame/features/pets/travel/PetTravelTypes';
import type { InputBindingsState } from '../Pages/Dashboard/component/SystemIdleGame/features/input/InputBindingDefinitions';

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

    if (result.error?.status === 401 || result.error?.status === 403) {
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

type ProfileStateResponse = CoreProfileStateResponse<InputBindingsState>;

function syncGameSettingsFromSave(dispatch: (action: unknown) => unknown, gameSave?: GameSaveV2 | null) {
    const settings = gameSave?.worldStatus?.settings;
    if (settings) dispatch(setGameSettings(settings));
}

export type NpcPersonaSkill = {
    npcName: string;
    slug: string;
    filename: string;
    entryType?: 'file' | 'package';
    mode?: string;
    metadata: Record<string, string | number | boolean | string[]>;
    manifest?: Record<string, unknown>;
    content: string;
    body: string;
    files?: Array<{ path: string; content: string; kind?: string }>;
};

export type GameNpcShopItem = {
    id: string;
    name: string;
    role: string;
    title: string;
    description: string;
    price: number;
    owned: boolean;
    pendingArrival?: boolean;
    ownedByDefault?: boolean;
};

export type GameShopItem = {
    shopItemId: string;
    category: 'npc' | 'house' | 'storage' | 'tool' | 'furniture' | 'pet';
    id: string;
    itemId?: string;
    name?: string;
    nameZh?: string;
    title?: string;
    role?: string;
    description?: string;
    price: number;
    owned?: boolean;
    pendingArrival?: boolean;
    ownedByDefault?: boolean;
    blueprintItemId?: string;
    rentPerDay?: number;
    capacity?: number;
    ownedQuantity?: number;
    ownedBlueprintQuantity?: number;
    petId?: string;
    ownerNpcId?: string;
    canSpeak?: boolean;
    visualKey?: string;
    assets?: { avatar?: string };
    avatarUrl?: string;
};

export type GameCatalogResponse = { success: boolean } & GameCatalogPayload;

export type BuildingCatalogResponse = { success: boolean; buildings: BuildingDefinition[] };

export type TempleMaskState = {
    centerWorldId: string;
    centerX: number;
    centerY: number;
    radius: number;
    revealedCells: string[];
    updatedAtGameMinute?: number;
};

export type TempleMaskProgressState = {
    level: number;
    progress: number;
    required: number;
    rewardClaims?: string[];
    updatedAtGameMinute?: number;
};

export type TempleMaskResponse = {
    success: boolean;
    mask: TempleMaskState;
    maskProgress: TempleMaskProgressState;
    previousMask?: TempleMaskState;
    previousMaskProgress?: TempleMaskProgressState;
    maskConfiguration?: GameSaveV2['worldStatus']['configuration'];
    previousMaskConfiguration?: GameSaveV2['worldStatus']['configuration'];
    levelUps?: number;
    temple: TempleSaveState;
    gameSave: GameSaveV2;
};

export type TempleMaskMutationRequest = {
    roomId?: string | null;
    amount: number;
    absoluteGameMinutes?: number;
};

export type GameActorHealthRequest = {
    targetType: 'player' | 'npc';
    targetId?: string;
    amount: number;
    roomId?: string | null;
};

export type GameActorHealthResponse = {
    success: boolean;
    target: {
        targetType: 'player' | 'npc';
        targetId: string;
        health: number;
        maxHealth: number;
        downed: boolean;
    };
    gameSave: GameSaveV2;
};

export type NpcSleepConsolidationRequest = {
    roomId?: string | null;
    npcIds?: string[];
    absoluteGameMinutes: number;
};

export type NpcSleepConsolidationResponse = {
    success: boolean;
    gameSave: GameSaveV2;
    results: Array<{
        npcId: string;
        mode: 'llm' | 'deterministic_only' | 'skipped_no_material';
        newClaimCount: number;
        reflectionCount: number;
        staleCount: number;
    }>;
};

export type StorageChestTransferRef =
    | { container: 'player'; item: StorageChestSlotItem }
    | { container: 'chest'; index: number };

export const profileStateRtkApi = createApi({
    reducerPath: 'profileStateRtkApi',
    baseQuery: baseQueryWithReauth,
    tagTypes: ['ProfileState'],
    endpoints: (builder) => ({
        getProfileState: builder.query<ProfileStateResponse, void>({
            query: () => '/profile/state',
            providesTags: ['ProfileState'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setProfileStateLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setProfileState(data));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to load profile state';
                    dispatch(setProfileStateError(message));
                }
            },
        }),

        updateProfileCoins: builder.mutation<
            { success: boolean; wallet: { coins: number } },
            { amount: number; operation?: CoinOperation }
        >({
            query: (body) => ({
                url: '/profile/state/coins',
                method: 'PATCH',
                body,
            }),
            invalidatesTags: ['ProfileState'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setProfileStateLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                    dispatch(patchWalletCoins(data.wallet.coins));
                    dispatch(setProfileStateLoading(false));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to update coins';
                    dispatch(setProfileStateError(message));
                }
            },
        }),

        updateProfileAttribute: builder.mutation<
            { success: boolean; attributes: Record<UserAttributeKey, UserAttributeValue> },
            { attributeKey: UserAttributeKey } & ProfileAttributePatchPayload
        >({
            query: ({ attributeKey, ...body }) => ({
                url: `/profile/state/attributes/${attributeKey}`,
                method: 'PATCH',
                body,
            }),
            invalidatesTags: ['ProfileState'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setProfileAttributes(data.attributes));
                } catch (err) {
                    const e = err as { error?: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to update attribute';
                    dispatch(setProfileStateError(message));
                }
            },
        }),

        unlockProfileSkill: builder.mutation<
            {
                success: boolean;
                attributes: Record<UserAttributeKey, UserAttributeValue>;
                skillTree: ProfileSkillTreeState;
            },
            { attributeKey: UserAttributeKey; skillId: string }
        >({
            query: (body) => ({
                url: '/profile/state/skills/unlock',
                method: 'POST',
                body,
            }),
            invalidatesTags: ['ProfileState'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setProfileAttributes(data.attributes));
                    dispatch(setProfileSkillTree(data.skillTree));
                } catch (err) {
                    const e = err as { error?: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to unlock skill';
                    dispatch(setProfileStateError(message));
                }
            },
        }),

        updateProfileControls: builder.mutation<
            { success: boolean; controls: InputBindingsState },
            { controls: Partial<InputBindingsState> }
        >({
            query: (body) => ({
                url: '/profile/state/controls',
                method: 'PATCH',
                body,
            }),
            invalidatesTags: ['ProfileState'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setProfileControls(data.controls));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to update controls';
                    dispatch(setProfileStateError(message));
                }
            },
        }),

        purchaseFromSystemStore: builder.mutation<
            {
                success: boolean;
                wallet: { coins: number };
                inventory: InventoryItem[];
            },
            { systemId: string; productId: string; quantity?: number }
        >({
            query: (body) => ({
                url: '/profile/shop/purchase',
                method: 'POST',
                body,
            }),
            invalidatesTags: ['ProfileState'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setProfileStateLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                    dispatch(setInventory(data.inventory));
                    dispatch(setProfileStateLoading(false));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to purchase product';
                    dispatch(setProfileStateError(message));
                }
            },
        }),

        useInventoryItem: builder.mutation<
            { success: boolean; inventory: InventoryItem[] },
            { inventoryKey: string; quantity?: number }
        >({
            query: (body) => ({
                url: '/profile/inventory/use',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setProfileStateLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setInventory(data.inventory));
                    dispatch(setProfileStateLoading(false));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to use inventory item';
                    dispatch(setProfileStateError(message));
                }
            },
        }),

        getGameSave: builder.query<{ success: boolean; gameSave: GameSaveV2; saveMeta?: GameSaveMeta }, string | void>({
            query: (roomId) => roomId ? `/profile/game/save?roomId=${encodeURIComponent(roomId)}` : '/profile/game/save',
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            gameSave: data.gameSave,
                        }));
                    }
                    syncGameSettingsFromSave(dispatch, data.gameSave);
                } catch (_) {}
            },
        }),

        saveGameSave: builder.mutation<
            { success: boolean; gameSave: GameSaveV2; saveMeta?: GameSaveMeta },
            { gameSave: GameSaveV2; roomId?: string | null; saveMeta?: GameSaveMeta | null }
        >({
            query: ({ gameSave, roomId, saveMeta }) => ({
                url: '/profile/game/save',
                method: 'PUT',
                body: { gameSave, roomId, saveMeta: saveMeta ?? gameSave.saveMeta },
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            gameSave: data.gameSave,
                        }));
                    }
                    syncGameSettingsFromSave(dispatch, data.gameSave);
                } catch (_) {}
            },
        }),

        deleteGameSave: builder.mutation<
            { success: boolean; gameSave: GameSaveV2; saveMeta?: GameSaveMeta; wallet: { coins: number }; inventory: InventoryItem[] },
            { roomId?: string | null } | void
        >({
            query: (arg) => ({
                url: '/profile/game/save',
                method: 'DELETE',
                body: arg?.roomId ? { roomId: arg.roomId } : undefined,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...(currentProfile as any),
                            gameSave: data.gameSave,
                        } as any));
                    }
                    syncGameSettingsFromSave(dispatch, data.gameSave);
                    dispatch(setGameInventory([]));
                    dispatch(setWalletCoins(data.wallet.coins));
                    dispatch(setInventory(data.inventory));
                } catch (_) {}
            },
        }),

        getGameNpcShop: builder.query<
            {
                success: boolean;
                wallet: { coins: number };
                unlockedNpcs: string[];
                pendingNpcArrivals?: string[];
                npcs: GameNpcShopItem[];
                catalogVersions?: Record<string, string | number>;
                gameSave: GameSaveV2;
            },
            string | void
        >({
            query: (roomId) => roomId ? `/profile/game/npc-shop?roomId=${encodeURIComponent(roomId)}` : '/profile/game/npc-shop',
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            wallet: data.wallet,
                            gameSave: data.gameSave,
                        }));
                    }
                } catch (_) {}
            },
        }),

        purchaseGameNpc: builder.mutation<
            {
                success: boolean;
                alreadyOwned?: boolean;
                pendingArrival?: boolean;
                npc: GameNpcShopItem;
                wallet: { coins: number };
                unlockedNpcs: string[];
                pendingNpcArrivals?: string[];
                gameSave: GameSaveV2;
            },
            { npcId: string; roomId?: string | null }
        >({
            query: (body) => ({
                url: '/profile/game/npc-shop/purchase',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            wallet: data.wallet,
                            gameSave: data.gameSave,
                        }));
                    }
                } catch (_) {}
            },
        }),

        getGameShop: builder.query<
            {
                success: boolean;
                wallet: { coins: number };
                items: GameShopItem[];
                unlockedNpcs: string[];
                pendingNpcArrivals: string[];
                catalogVersions?: Record<string, string | number>;
                gameSave: GameSaveV2;
            },
            string | void
        >({
            query: (roomId) => roomId ? `/profile/game/shop?roomId=${encodeURIComponent(roomId)}` : '/profile/game/shop',
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                } catch (_) {}
            },
        }),

        getGameCatalogs: builder.query<GameCatalogResponse, void>({
            query: () => '/profile/game/catalogs',
        }),

        getBuildingCatalog: builder.query<BuildingCatalogResponse, void>({
            query: () => '/profile/game/buildings/catalog',
        }),

        getTempleMask: builder.query<TempleMaskResponse, string | void>({
            query: (roomId) => roomId ? `/profile/game/temple/mask?roomId=${encodeURIComponent(roomId)}` : '/profile/game/temple/mask',
        }),

        addMaskRadius: builder.mutation<TempleMaskResponse, TempleMaskMutationRequest>({
            query: (body) => ({
                url: '/profile/game/temple/mask/add',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        dropMaskRadius: builder.mutation<TempleMaskResponse, TempleMaskMutationRequest>({
            query: (body) => ({
                url: '/profile/game/temple/mask/drop',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        addMaskProgress: builder.mutation<TempleMaskResponse, TempleMaskMutationRequest>({
            query: (body) => ({
                url: '/profile/game/temple/mask-progress/add',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        getMemoryAlbum: builder.query<PetTravelPhotoResponse, { roomId?: string | null; worldId?: string } | void>({
            query: (params) => {
                const query = new URLSearchParams();
                if (params?.roomId) query.set('roomId', params.roomId);
                if (params?.worldId) query.set('worldId', params.worldId);
                const suffix = query.toString();
                return suffix ? `/profile/game/pet-travel/album?${suffix}` : '/profile/game/pet-travel/album';
            },
        }),

        sendPetTravelPhoto: builder.mutation<PetTravelPhotoResponse, SendPetTravelPhotoRequest>({
            query: (body) => ({
                url: '/profile/game/pet-travel/send',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.gameInventory) dispatch(setGameInventory(data.gameInventory));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        claimPetTravelPhoto: builder.mutation<PetTravelPhotoResponse, ClaimPetTravelPhotoRequest>({
            query: (body) => ({
                url: '/profile/game/pet-travel/claim-return',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        placeBuilding: builder.mutation<BuildingApiResponse, PlaceBuildingRequest>({
            query: (body) => ({
                url: '/profile/game/buildings/place',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.gameInventory) dispatch(setGameInventory(data.gameInventory as GameInventoryItem[]));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        moveBuilding: builder.mutation<BuildingApiResponse, MoveBuildingRequest>({
            query: (body) => ({
                url: '/profile/game/buildings/move',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        rotateBuilding: builder.mutation<BuildingApiResponse, RotateBuildingRequest>({
            query: (body) => ({
                url: '/profile/game/buildings/rotate',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        removeBuilding: builder.mutation<BuildingApiResponse, { roomId?: string | null; buildingId: string; refundItem?: boolean }>({
            query: (body) => ({
                url: '/profile/game/buildings/remove',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.gameInventory) dispatch(setGameInventory(data.gameInventory as GameInventoryItem[]));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        resolveBuildingAssembly: builder.mutation<BuildingAssemblyResolveResponse, BuildingAssemblyResolveRequest>({
            query: (body) => ({
                url: '/profile/game/buildings/assemblies/resolve',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        consolidateNpcSleepKnowledge: builder.mutation<NpcSleepConsolidationResponse, NpcSleepConsolidationRequest>({
            query: (body) => ({
                url: '/profile/game/npc/ontology/consolidate-sleep',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        clearBuilding: builder.mutation<BuildingApiResponse, { roomId?: string | null; buildingId: string }>({
            query: (body) => ({
                url: '/profile/game/buildings/clear',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.gameInventory) dispatch(setGameInventory(data.gameInventory as GameInventoryItem[]));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        startBuildingUpgrade: builder.mutation<BuildingApiResponse, { roomId?: string | null; buildingId: string; absoluteGameMinutes?: number }>({
            query: (body) => ({
                url: '/profile/game/buildings/upgrade/start',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.wallet) {
                        dispatch(setWalletCoins(data.wallet.coins));
                        dispatch(patchWalletCoins(data.wallet.coins));
                    }
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            wallet: data.wallet ?? currentProfile.wallet,
                            gameSave: data.gameSave as GameSaveV2,
                        }));
                    }
                } catch (_) {}
            },
        }),

        startBuildingRepair: builder.mutation<BuildingApiResponse, { roomId?: string | null; buildingId: string; absoluteGameMinutes?: number }>({
            query: (body) => ({
                url: '/profile/game/buildings/repair/start',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        completeBuildingJobs: builder.mutation<BuildingApiResponse & { completed?: string[] }, { roomId?: string | null; absoluteGameMinutes: number }>({
            query: (body) => ({
                url: '/profile/game/buildings/jobs/complete',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        assignBuildingWorkers: builder.mutation<BuildingApiResponse, { roomId?: string | null; worldId?: string; absoluteGameMinutes: number }>({
            query: (body) => ({
                url: '/profile/game/buildings/workers/assign',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        startBuildingConstruction: builder.mutation<
            BuildingApiResponse,
            {
                roomId?: string | null;
                buildingId: string;
                golemId: string;
                x?: number;
                y?: number;
                cellX?: number;
                cellY?: number;
                absoluteGameMinutes: number;
            }
        >({
            query: (body) => ({
                url: '/profile/game/buildings/workers/start-construction',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        setHouseResident: builder.mutation<
            BuildingApiResponse,
            {
                roomId?: string | null;
                buildingId: string;
                residentNpcId?: string | null;
                residentNpcName?: string | null;
                absoluteGameMinutes?: number;
            }
        >({
            query: (body) => ({
                url: '/profile/game/buildings/house/resident',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        awakenGolem: builder.mutation<GolemApiResponse, AwakenGolemRequest>({
            query: (body) => ({
                url: '/profile/game/golems/awaken',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        spawnGolem: builder.mutation<GolemApiResponse, SpawnGolemRequest>({
            query: (body) => ({
                url: '/profile/game/golems/spawn',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        assignGolem: builder.mutation<GolemApiResponse, AssignGolemRequest>({
            query: (body) => ({
                url: '/profile/game/golems/assign',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        cancelGolemTask: builder.mutation<GolemApiResponse, { roomId?: string | null; golemId: string; absoluteGameMinutes?: number }>({
            query: (body) => ({
                url: '/profile/game/golems/cancel-task',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave as GameSaveV2 }));
                } catch (_) {}
            },
        }),

        purchaseGameShopItem: builder.mutation<
            {
                success: boolean;
                purchase: unknown;
                wallet: { coins: number };
                gameInventory: GameInventoryItem[];
                items: GameShopItem[];
                unlockedNpcs: string[];
                pendingNpcArrivals: string[];
                gameSave: GameSaveV2;
            },
            { shopItemId: string; quantity?: number; roomId?: string | null }
        >({
            query: (body) => ({
                url: '/profile/game/shop/purchase',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                    dispatch(setGameInventory(data.gameInventory));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, wallet: data.wallet, gameSave: data.gameSave }));
                } catch (_) {}
            },
        }),

        getStorageChests: builder.query<
            { success: boolean; storageChests: StorageChestSave[]; gameSave: GameSaveV2 },
            string | void
        >({
            query: (roomId) => roomId ? `/profile/game/storage-chests?roomId=${encodeURIComponent(roomId)}` : '/profile/game/storage-chests',
        }),

        placeStorageChest: builder.mutation<
            { success: boolean; storageChest: StorageChestSave; storageChests: StorageChestSave[]; gameInventory: GameInventoryItem[]; gameSave: GameSaveV2 },
            {
                roomId?: string | null;
                itemId: string;
                x: number;
                y: number;
                facing?: 'down' | 'left' | 'right';
                worldId?: string;
                placementProof: { requestedAtGameMinute: number; footprint: { x: number; y: number; w: number; h: number } };
            }
        >({
            query: (body) => ({
                url: '/profile/game/storage-chests/place',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setGameInventory(data.gameInventory));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave }));
                } catch (_) {}
            },
        }),

        transferStorageChestItem: builder.mutation<
            { success: boolean; storageChest: StorageChestSave; storageChests: StorageChestSave[]; gameInventory: GameInventoryItem[]; gameSave: GameSaveV2 },
            {
                chestId: string;
                roomId?: string | null;
                from: StorageChestTransferRef;
                to: StorageChestTransferRef | { container: 'player' };
                quantity?: number;
                absoluteGameMinutes?: number;
            }
        >({
            query: ({ chestId, ...body }) => ({
                url: `/profile/game/storage-chests/${encodeURIComponent(chestId)}/transfer`,
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setGameInventory(data.gameInventory));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave }));
                } catch (_) {}
            },
        }),

        executeNpcTrade: builder.mutation<NpcTradeExecuteResponse, NpcTradeExecuteRequest>({
            query: (body) => ({
                url: '/profile/game/npc-trade/execute',
                method: 'POST',
                body,
            }),
            async onQueryStarted(request, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                    dispatch(patchWalletCoins(data.wallet.coins));
                    dispatch(setGameInventory(data.gameInventory));
                    dispatch(setNpcInventory({ npcName: request.npcName, inv: data.npcInventory }));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, wallet: data.wallet, gameSave: data.gameSave }));
                } catch (_) {}
            },
        }),

        /**
         * Send a player message to an NPC and receive a short GPT reply.
         * Memory is now owned entirely by the backend — no need to send it.
         */
        npcChat: builder.mutation<
            NpcChatResponse,
            {
                traceId?:        string;
                npcName:        string;
                playerMessage:  string;
                source?:         'targeted' | 'broadcast';
                contextMode?:    'minimal' | 'fast' | 'situated' | 'action';
                allowAsyncMemory?: boolean;
                absoluteGameMinutes:       number;
                playerX?:       number;
                playerY?:       number;
                /** NPC's current view of the world — passed as LLM context. */
                perception?:    string;
                perceptionContext?: Record<string, unknown> | null;
                npcMindContext?: Record<string, unknown> | null;
                /** Player's current game inventory snapshot, newer than persisted save during local play. */
                playerInventory?: Array<{ itemId: string; quantity?: number }>;
                /** NPC's current inventory — so LLM knows what NPC has. */
                npcInventory?:  Record<string, number>;
                /** Familiarity score (0-100) — feeds LLM prompt so tone evolves with relationship. */
                familiarity?:   number;
                /** Total chat count between player + NPC. */
                chatCount?:     number;
                /** When false, backend must not run LLM/MCP tools. */
                agentBrainEnabled?: boolean;
            }
        >({
            query: (body) => ({
                url:    '/profile/npc/chat',
                method: 'POST',
                body,
            }),
        }),

        /**
         * NPC returned from a dispatch mission — backend generates
         * a story + list of items the NPC brought back.
         */
        npcDispatchReturn: builder.mutation<
            { story: string; items: Array<{ itemId: string; qty: number }> },
            { npcName: string; carriedItems: Record<string, number>; absoluteGameMinutes?: number }
        >({
            query: (body) => ({
                url:    '/profile/npc/dispatch-return',
                method: 'POST',
                body,
            }),
        }),

        /** Fetch the full persistent memory array for a named NPC. */
        getNpcMemories: builder.query<
            { memories: NpcMemoryEntry[] },
            string   // npcName
        >({
            query: (npcName) => `/profile/npc/memories/${encodeURIComponent(npcName)}`,
        }),

        /** Fetch the backend persona skill that drives a named NPC. */
        getNpcSkill: builder.query<
            { skill: NpcPersonaSkill },
            string
        >({
            query: (npcName) => `/profile/npc/skills/${encodeURIComponent(npcName)}`,
        }),

        /** Fetch all unopened treasure chests for the current user. */
        getGameChests: builder.query<{ chests: GameChest[] }, string | void>({
            query: (roomId) => ({
                url: roomId ? `/profile/game/chests?roomId=${encodeURIComponent(roomId)}` : '/profile/game/chests',
                headers: { 'Cache-Control': 'no-cache' },
            }),
        }),

        /** Open a chest: backend applies rewards and returns updated wallet + inventory. */
        openChest: builder.mutation<
            { success: boolean; rewards: GameChest['rewards']; wallet: { coins: number }; inventory: InventoryItem[] },
            { chestId: string; roomId?: string | null; localChest?: GameChest | null }
        >({
            query: ({ chestId, roomId, localChest }) => ({
                url:    `/profile/game/chests/${chestId}/open`,
                method: 'POST',
                body:   roomId || localChest ? { roomId, localChest } : undefined,
            }),
        }),

        // ── Game Health ─────────────────────────────────────────────────────

        damageGameActor: builder.mutation<GameActorHealthResponse, GameActorHealthRequest>({
            query: (body) => ({
                url:    '/profile/game/health/damage',
                method: 'POST',
                body,
            }),
        }),

        healGameActor: builder.mutation<GameActorHealthResponse, GameActorHealthRequest>({
            query: (body) => ({
                url:    '/profile/game/health/heal',
                method: 'POST',
                body,
            }),
        }),

        // ── Game Inventory ───────────────────────────────────────────────────

        /** Persist a world item pickup (egg, fruit, crop) to the database. */
        pickupGameItem: builder.mutation<
            { success: boolean; gameInventory: GameInventoryItem[] },
            { itemId: string; quantity: number }
        >({
            query: (body) => ({
                url:    '/profile/game/inventory/pickup',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setGameInventory(data.gameInventory));
                } catch (_) {}
            },
        }),

        /** Persist local game item consumption such as Q-drop or placing furniture. */
        consumeGameItem: builder.mutation<
            { success: boolean; gameInventory: GameInventoryItem[]; hunger?: number },
            { itemId: string; quantity?: number; action?: 'eat' | 'drop' | 'place' | 'consume'; roomId?: string | null }
        >({
            query: (body) => ({
                url:    '/profile/game/inventory/consume',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setGameInventory(data.gameInventory));
                } catch (_) {}
            },
        }),

        /** Load game inventory from server (called on game ready). */
        getGameInventory: builder.query<{ gameInventory: GameInventoryItem[] }, void>({
            query: () => '/profile/game/inventory',
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setGameInventory(data.gameInventory));
                } catch (_) {}
            },
        }),

        // ── Farm ─────────────────────────────────────────────────────────────

        /** Convert a grass tile to tilled farmland. */
        tillFarmTile: builder.mutation<
            { success: boolean; farmTile: FarmTile; droppedSeed: { itemId: string; quantity: number } | null; gameInventory: GameInventoryItem[] },
            { worldId?: string; tx: number; ty: number; itemId?: string; roomId?: string }
        >({
            query: (body) => ({ url: '/profile/game/farm/till', method: 'POST', body }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.farmTile) dispatch(upsertFarmTile(data.farmTile));
                    if (data.gameInventory) dispatch(setGameInventory(data.gameInventory));
                } catch (_) {}
            },
        }),

        /** Water a farm tile. */
        waterFarmTile: builder.mutation<
            { success: boolean; farmTile: FarmTile; farmTiles: FarmTile[] },
            { worldId?: string; tx: number; ty: number; absoluteGameMinutes: number; itemId?: string; roomId?: string }
        >({
            query: (body) => ({ url: '/profile/game/farm/water', method: 'POST', body }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.farmTile) dispatch(upsertFarmTile(data.farmTile));
                } catch (_) {}
            },
        }),

        /** Plant a seed on a tilled/watered tile. */
        plantCrop: builder.mutation<
            { success: boolean; farmTiles: FarmTile[]; gameInventory: GameInventoryItem[] },
            { worldId?: string; tx: number; ty: number; itemId: string; absoluteGameMinutes: number; roomId?: string }
        >({
            query: (body) => ({ url: '/profile/game/farm/plant', method: 'POST', body }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.farmTiles)    dispatch(setFarmTiles(data.farmTiles));
                    if (data.gameInventory) dispatch(setGameInventory(data.gameInventory));
                } catch (_) {}
            },
        }),

        /** Harvest a ready crop. */
        harvestCrop: builder.mutation<
            { success: boolean; farmTiles: FarmTile[]; dropItems: { itemId: string; quantity: number }[] },
            { worldId?: string; tx: number; ty: number; absoluteGameMinutes?: number; roomId?: string }
        >({
            query: (body) => ({ url: '/profile/game/farm/harvest', method: 'POST', body }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.farmTiles) dispatch(setFarmTiles(data.farmTiles));
                    // No inventory update here — player must physically pick up spawned WorldItems
                } catch (_) {}
            },
        }),

        /** Load all farm tiles (called on game ready). */
        getFarmTiles: builder.query<{ farmTiles: FarmTile[] }, string | void>({
            query: (roomId) => roomId ? `/profile/game/farm?roomId=${roomId}` : '/profile/game/farm',
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setFarmTiles(data.farmTiles));
                } catch (_) {}
            },
        }),

        /** Advance crop timers server-side. Call every ~30 s alongside auto-save. */
        advanceFarmTime: builder.mutation<
            { updated: number; farmTiles: FarmTile[] },
            { absoluteGameMinutes: number; roomId?: string }
        >({
            query: (body) => ({ url: '/profile/game/farm/gameMinute', method: 'POST', body }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.updated > 0) dispatch(setFarmTiles(data.farmTiles));
                } catch (_) {}
            },
        }),

        // ── Creatures ────────────────────────────────────────────────────────

        /** Batch save creature states (chickens etc.) every ~30 s. */
        saveCreatures: builder.mutation<{ success: boolean }, { creatures: CreatureState[]; roomId?: string }>({
            query: (body) => ({ url: '/profile/game/creatures', method: 'PATCH', body }),
        }),

        /** Load creature states on game ready. */
        getCreatures: builder.query<{ creatures: CreatureState[] }, string | void>({
            query: (roomId) => roomId ? `/profile/game/creatures?roomId=${roomId}` : '/profile/game/creatures',
        }),

        // ── AI Utilities ─────────────────────────────────────────────────────

        /** AI fills empty task fields from what the user has already typed. */
        aiFillTask: builder.mutation<
            { title: string; description: string; content: string; notice: string },
            { title?: string; description?: string; content?: string; notice?: string; systemContext?: string }
        >({
            query: (body) => ({ url: '/profile/ai/fill-task', method: 'POST', body }),
        }),
    }),
});

export const {
    useLazyGetProfileStateQuery,
    useGetProfileStateQuery,
    useUpdateProfileCoinsMutation,
    useUpdateProfileAttributeMutation,
    useUnlockProfileSkillMutation,
    useUpdateProfileControlsMutation,
    usePurchaseFromSystemStoreMutation,
    useUseInventoryItemMutation,
    useLazyGetGameSaveQuery,
    useSaveGameSaveMutation,
    useDeleteGameSaveMutation,
    useGetGameNpcShopQuery,
    usePurchaseGameNpcMutation,
    useGetGameShopQuery,
    useGetGameCatalogsQuery,
    useLazyGetGameCatalogsQuery,
    useGetBuildingCatalogQuery,
    useGetTempleMaskQuery,
    useAddMaskRadiusMutation,
    useDropMaskRadiusMutation,
    useAddMaskProgressMutation,
    useGetMemoryAlbumQuery,
    useLazyGetMemoryAlbumQuery,
    useSendPetTravelPhotoMutation,
    useClaimPetTravelPhotoMutation,
    usePlaceBuildingMutation,
    useMoveBuildingMutation,
    useRotateBuildingMutation,
    useRemoveBuildingMutation,
    useResolveBuildingAssemblyMutation,
    useConsolidateNpcSleepKnowledgeMutation,
    useClearBuildingMutation,
    useStartBuildingUpgradeMutation,
    useStartBuildingRepairMutation,
    useCompleteBuildingJobsMutation,
    useAssignBuildingWorkersMutation,
    useStartBuildingConstructionMutation,
    useSetHouseResidentMutation,
    useSpawnGolemMutation,
    useAwakenGolemMutation,
    useAssignGolemMutation,
    useCancelGolemTaskMutation,
    usePurchaseGameShopItemMutation,
    useGetStorageChestsQuery,
    usePlaceStorageChestMutation,
    useTransferStorageChestItemMutation,
    useExecuteNpcTradeMutation,
    useNpcChatMutation,
    useNpcDispatchReturnMutation,
    useLazyGetNpcMemoriesQuery,
    useLazyGetNpcSkillQuery,
    useLazyGetGameChestsQuery,
    useOpenChestMutation,
    useDamageGameActorMutation,
    useHealGameActorMutation,
    // Game inventory
    usePickupGameItemMutation,
    useConsumeGameItemMutation,
    useLazyGetGameInventoryQuery,
    // Farm
    useTillFarmTileMutation,
    useWaterFarmTileMutation,
    usePlantCropMutation,
    useHarvestCropMutation,
    useLazyGetFarmTilesQuery,
    useAdvanceFarmTimeMutation,
    // Creatures
    useSaveCreaturesMutation,
    useLazyGetCreaturesQuery,
    // AI
    useAiFillTaskMutation,
} = profileStateRtkApi;
