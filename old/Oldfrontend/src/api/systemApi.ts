import { publicHttp } from './apiClient';
import type {
    RequestOptions,
    AccessTokenInput,
    UserAttributeCategory,
    StoreProductType,
    StoreProductInputType,
    CreateSystemPayload,
    CreateMissionListPayload,
    CreateMissionNodePayload,
    CreateStoreProductPayload,
    CreateLotteryPoolPayload,
    CreateLotteryPrizePayload,
    UpdateLotteryPoolPayload,
    AddSystemAttributePayload,
    AddSystemItemPayload,
} from '../Types/System';

// Re-export types for backward compatibility
export type {
    RequestOptions,
    AccessTokenInput,
    UserAttributeCategory,
    StoreProductType,
    StoreProductInputType,
    CreateSystemPayload,
    CreateMissionListPayload,
    CreateMissionNodePayload,
    CreateStoreProductPayload,
    CreateLotteryPoolPayload,
    CreateLotteryPrizePayload,
    UpdateLotteryPoolPayload,
    AddSystemAttributePayload,
    AddSystemItemPayload,
} from '../Types/System';

const normalizeStoreType = (value: StoreProductInputType): StoreProductType => {
    if (value === 'consumables') return 'item';
    if (value === 'cache chance') return 'lottery_chance';
    return value;
};

const authHeaders = (accessToken: string, headers?: RequestOptions['headers']) => ({
    Authorization: `Bearer ${accessToken}`,
    ...headers,
});

export async function createSystem(
    payload: CreateSystemPayload & AccessTokenInput,
    options?: RequestOptions
) {
    const { accessToken, ...body } = payload;
    const res = await publicHttp.post('/system/create', body, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function searchSystem(
    payload: { systemId: string } & AccessTokenInput,
    options?: RequestOptions
) {
    const { accessToken, systemId } = payload;
    const res = await publicHttp.get(`/system/search/${systemId}`, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function joinSystem(
    payload: { systemId: string } & AccessTokenInput,
    options?: RequestOptions
) {
    const { accessToken, systemId } = payload;
    const res = await publicHttp.post(`/system/${systemId}/join`, {}, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function getSystemList(
    payload: AccessTokenInput,
    options?: RequestOptions
) {
    const res = await publicHttp.get('/system/list', {
        signal: options?.signal,
        headers: authHeaders(payload.accessToken, options?.headers),
    });
    return res.data;
}

export async function getSystemDetail(
    payload: AccessTokenInput & { systemId: string },
    options?: RequestOptions
) {
    const res = await publicHttp.get(`/system/${payload.systemId}`, {
        signal: options?.signal,
        headers: authHeaders(payload.accessToken, options?.headers),
    });
    return res.data;
}

export async function initSixAttributeBoards(
    payload: AccessTokenInput & { systemId: string },
    options?: RequestOptions
) {
    const res = await publicHttp.post(`/system/${payload.systemId}/attributes/init-six-boards`, {}, {
        signal: options?.signal,
        headers: authHeaders(payload.accessToken, options?.headers),
    });
    return res.data;
}

export async function addSystemAttribute(
    payload: AccessTokenInput & { systemId: string } & AddSystemAttributePayload,
    options?: RequestOptions
) {
    const { accessToken, systemId, ...body } = payload;
    const res = await publicHttp.post(`/system/${systemId}/attributes`, body, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function markSystemAttributeUsed(
    payload: AccessTokenInput & {
        systemId: string;
        category: UserAttributeCategory;
        attributeName: string;
        used?: boolean;
    },
    options?: RequestOptions
) {
    const { accessToken, systemId, category, attributeName, used = true } = payload;
    const res = await publicHttp.patch(
        `/system/${systemId}/attributes/${category}/${encodeURIComponent(attributeName)}/mark-used`,
        { used },
        {
            signal: options?.signal,
            headers: authHeaders(accessToken, options?.headers),
        }
    );
    return res.data;
}

export async function deleteSystemAttribute(
    payload: AccessTokenInput & {
        systemId: string;
        category: UserAttributeCategory;
        attributeName: string;
    },
    options?: RequestOptions
) {
    const { accessToken, systemId, category, attributeName } = payload;
    const res = await publicHttp.delete(
        `/system/${systemId}/attributes/${category}/${encodeURIComponent(attributeName)}`,
        {
            signal: options?.signal,
            headers: authHeaders(accessToken, options?.headers),
        }
    );
    return res.data;
}

export async function addSystemItem(
    payload: AccessTokenInput & { systemId: string } & AddSystemItemPayload,
    options?: RequestOptions
) {
    const { accessToken, systemId, ...body } = payload;
    const res = await publicHttp.post(`/system/${systemId}/items`, body, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function createMissionList(
    payload: AccessTokenInput & { systemId: string } & CreateMissionListPayload,
    options?: RequestOptions
) {
    const { accessToken, systemId, ...body } = payload;
    const res = await publicHttp.post(`/system/${systemId}/mission-lists`, body, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function createMissionNode(
    payload: AccessTokenInput & {
        systemId: string;
        missionListId: string;
    } & CreateMissionNodePayload,
    options?: RequestOptions
) {
    const { accessToken, systemId, missionListId, ...body } = payload;
    const res = await publicHttp.post(`/system/${systemId}/mission-lists/${missionListId}/nodes`, body, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function failMissionList(
    payload: AccessTokenInput & { systemId: string; missionListId: string },
    options?: RequestOptions
) {
    const res = await publicHttp.patch(
        `/system/${payload.systemId}/mission-lists/${payload.missionListId}/fail`,
        {},
        {
            signal: options?.signal,
            headers: authHeaders(payload.accessToken, options?.headers),
        }
    );
    return res.data;
}

export async function failMissionNode(
    payload: AccessTokenInput & { systemId: string; missionListId: string; nodeId: string },
    options?: RequestOptions
) {
    const res = await publicHttp.patch(
        `/system/${payload.systemId}/mission-lists/${payload.missionListId}/nodes/${payload.nodeId}/fail`,
        {},
        {
            signal: options?.signal,
            headers: authHeaders(payload.accessToken, options?.headers),
        }
    );
    return res.data;
}

export async function restartMissionNode(
    payload: AccessTokenInput & { systemId: string; missionListId: string; nodeId: string },
    options?: RequestOptions
) {
    const res = await publicHttp.patch(
        `/system/${payload.systemId}/mission-lists/${payload.missionListId}/nodes/${payload.nodeId}/restart`,
        {},
        {
            signal: options?.signal,
            headers: authHeaders(payload.accessToken, options?.headers),
        }
    );
    return res.data;
}

export async function rejoinSystem(
    payload: AccessTokenInput & { systemId: string },
    options?: RequestOptions
) {
    const res = await publicHttp.patch(`/system/${payload.systemId}/rejoin`, {}, {
        signal: options?.signal,
        headers: authHeaders(payload.accessToken, options?.headers),
    });
    return res.data;
}

export async function createStoreProduct(
    payload: AccessTokenInput & { systemId: string } & CreateStoreProductPayload,
    options?: RequestOptions
) {
    const { accessToken, systemId, type, ...body } = payload;
    const res = await publicHttp.post(`/system/${systemId}/store-products`, {
        ...body,
        type: normalizeStoreType(type),
    }, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function updateStoreProduct(
    payload: AccessTokenInput & { systemId: string; productId: string } & Partial<CreateStoreProductPayload>,
    options?: RequestOptions
) {
    const { accessToken, systemId, productId, type, ...body } = payload;
    const res = await publicHttp.patch(`/system/${systemId}/store-products/${productId}`, {
        ...body,
        ...(type && { type: normalizeStoreType(type) }),
    }, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function deleteStoreProduct(
    payload: AccessTokenInput & { systemId: string; productId: string },
    options?: RequestOptions
) {
    const res = await publicHttp.delete(`/system/${payload.systemId}/store-products/${payload.productId}`, {
        signal: options?.signal,
        headers: authHeaders(payload.accessToken, options?.headers),
    });
    return res.data;
}

export async function createLotteryPool(
    payload: AccessTokenInput & { systemId: string } & CreateLotteryPoolPayload,
    options?: RequestOptions
) {
    const { accessToken, systemId, ...body } = payload;
    const res = await publicHttp.post(`/system/${systemId}/lottery-pools`, body, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function createLotteryPrize(
    payload: AccessTokenInput & {
        systemId: string;
        poolId: string;
    } & CreateLotteryPrizePayload,
    options?: RequestOptions
) {
    const { accessToken, systemId, poolId, ...body } = payload;
    const res = await publicHttp.post(`/system/${systemId}/lottery-pools/${poolId}/prizes`, body, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function updateLotteryPool(
    payload: AccessTokenInput & {
        systemId: string;
        poolId: string;
    } & UpdateLotteryPoolPayload,
    options?: RequestOptions
) {
    const { accessToken, systemId, poolId, ...body } = payload;
    const res = await publicHttp.patch(`/system/${systemId}/lottery-pools/${poolId}`, body, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function deleteLotteryPrize(
    payload: AccessTokenInput & {
        systemId: string;
        poolId: string;
        prizeId: string;
    },
    options?: RequestOptions
) {
    const { accessToken, systemId, poolId, prizeId } = payload;
    const res = await publicHttp.delete(`/system/${systemId}/lottery-pools/${poolId}/prizes/${prizeId}`, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function deleteSystem(
    payload: AccessTokenInput & { systemId: string },
    options?: RequestOptions
) {
    const res = await publicHttp.delete(`/system/${payload.systemId}`, {
        signal: options?.signal,
        headers: authHeaders(payload.accessToken, options?.headers),
    });
    return res.data;
}
