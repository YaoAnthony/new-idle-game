import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { SystemLite, StoreProduct } from '../../Types/System';
import type { LotteryPool } from '../../Types/Lottery';
import { logout } from './userSlice';
import { getFirstMemberSystemId, isMemberSystem } from '../../utils/systemRelationship';
export type { SystemLite } from '../../Types/System';

export interface SystemState {
    systems: SystemLite[];
    selectedSystemId: string | null;
    currentSystem: Record<string, unknown> | null;
    loading: boolean;
    error?: string;
}

const initialState: SystemState = {
    systems: [],
    selectedSystemId: null,
    currentSystem: null,
    loading: false,
    error: undefined,
};

const systemSlice = createSlice({
    name: 'system',
    initialState,
    reducers: {
        setSystems(state, action: PayloadAction<SystemLite[]>) {
            state.systems = action.payload;
            state.loading = false;
            state.error = undefined;
        },
        addSystem(state, action: PayloadAction<SystemLite>) {
            state.systems = [action.payload, ...state.systems.filter((item) => item._id !== action.payload._id)];
            if (isMemberSystem(action.payload)) {
                state.selectedSystemId = action.payload._id;
            }
            state.error = undefined;
        },
        removeSystem(state, action: PayloadAction<string>) {
            const removedSystemId = action.payload;
            state.systems = state.systems.filter((item) => item._id !== removedSystemId);

            if (state.selectedSystemId === removedSystemId) {
                state.selectedSystemId = getFirstMemberSystemId(state.systems);
            }

            const currentSystemId = (state.currentSystem as { _id?: string } | null)?._id;
            if (currentSystemId === removedSystemId) {
                state.currentSystem = null;
            }

            state.error = undefined;
        },
        setSelectedSystemId(state, action: PayloadAction<string | null>) {
            state.selectedSystemId = action.payload;
        },
        setCurrentSystem(state, action: PayloadAction<Record<string, unknown> | null>) {
            state.currentSystem = action.payload;
            state.loading = false;
            state.error = undefined;
        },
        setSystemLoading(state, action: PayloadAction<boolean>) {
            state.loading = action.payload;
        },
        setSystemError(state, action: PayloadAction<string | undefined>) {
            state.error = action.payload;
            state.loading = false;
        },
        clearSystemState(state) {
            state.systems = [];
            state.selectedSystemId = null;
            state.currentSystem = null;
            state.loading = false;
            state.error = undefined;
        },
        /** Surgical update: replace storeProducts of one system without refetching everything */
        patchSystemProducts(state, action: PayloadAction<{ systemId: string; storeProducts: StoreProduct[] }>) {
            const sys = state.systems.find(s => s._id === action.payload.systemId);
            if (sys) sys.storeProducts = action.payload.storeProducts;
        },
        /** Surgical update: replace lotteryPools of one system without refetching everything */
        patchSystemLotteryPools(state, action: PayloadAction<{ systemId: string; lotteryPools: LotteryPool[] }>) {
            const sys = state.systems.find(s => s._id === action.payload.systemId);
            if (sys) sys.lotteryPools = action.payload.lotteryPools;
        },
        patchSystemRelationship(
            state,
            action: PayloadAction<{ systemId: string; isOwner?: boolean; isMember?: boolean }>
        ) {
            const sys = state.systems.find(s => s._id === action.payload.systemId);
            if (!sys) return;

            sys.relationship = {
                ...(sys.relationship || {}),
                ...(typeof action.payload.isOwner === 'boolean' ? { isOwner: action.payload.isOwner } : {}),
                ...(typeof action.payload.isMember === 'boolean' ? { isMember: action.payload.isMember } : {}),
            };

            if (typeof action.payload.isOwner === 'boolean') {
                sys.isOwner = action.payload.isOwner;
            }
            if (typeof action.payload.isMember === 'boolean') {
                sys.isMember = action.payload.isMember;
            }

            if (action.payload.isMember === false && state.selectedSystemId === action.payload.systemId) {
                state.selectedSystemId = getFirstMemberSystemId(state.systems);
            }
        },
    },
    extraReducers: (builder) => {
        builder.addCase(logout, (state) => {
            state.systems = [];
            state.selectedSystemId = null;
            state.currentSystem = null;
            state.loading = false;
            state.error = undefined;
        });
    },
});

export const {
    setSystems,
    addSystem,
    removeSystem,
    setSelectedSystemId,
    setCurrentSystem,
    setSystemLoading,
    setSystemError,
    clearSystemState,
    patchSystemProducts,
    patchSystemLotteryPools,
    patchSystemRelationship,
} = systemSlice.actions;

export default systemSlice.reducer;
