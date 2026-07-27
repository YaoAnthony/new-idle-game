import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
    DEFAULT_INPUT_BINDINGS,
    normalizeInputBindings,
    type InputBindingsState,
} from '../../Pages/Dashboard/component/SystemIdleGame/features/input/InputBindingDefinitions';
import {
    createDefaultAttributes,
    type AttributeKey,
    type AttributeValue,
} from '../../shared/core/protagonistAttributeProgression';
import {
    createDefaultProfileSkillTreeState,
    normalizeProfileSkillTreeState,
    type ProfileSkillTreeState,
} from '@timeplan-game/core/protagonist/skillTree';
import type {
    ProfileInventoryItem,
    ProfileStateResponse,
    ProfileWallet,
} from '@timeplan-game/core/contracts/profile/profileTypes';

export type UserAttributeKey = AttributeKey;
export type UserAttributeValue = AttributeValue;

export type InventoryItem = ProfileInventoryItem;

export interface ProfileRuntimeState {
    wallet: ProfileWallet;
    attributes: Record<UserAttributeKey, UserAttributeValue>;
    skillTree: ProfileSkillTreeState;
    inventory: InventoryItem[];
    controls: InputBindingsState;
    loading: boolean;
    error?: string;
}

const initialState: ProfileRuntimeState = {
    wallet: { coins: 0 },
    attributes: createDefaultAttributes(),
    skillTree: createDefaultProfileSkillTreeState(),
    inventory: [],
    controls: normalizeInputBindings(DEFAULT_INPUT_BINDINGS),
    loading: false,
    error: undefined,
};

const profileStateSlice = createSlice({
    name: 'profileState',
    initialState,
    reducers: {
        setProfileState(
            state,
            action: PayloadAction<ProfileStateResponse<Partial<InputBindingsState>>>
        ) {
            state.wallet = action.payload.wallet;
            state.attributes = action.payload.attributes;
            state.skillTree = normalizeProfileSkillTreeState(action.payload.skillTree);
            state.inventory = action.payload.inventory;
            state.controls = normalizeInputBindings(action.payload.controls);
            state.loading = false;
            state.error = undefined;
        },
        setProfileStateLoading(state, action: PayloadAction<boolean>) {
            state.loading = action.payload;
        },
        setProfileStateError(state, action: PayloadAction<string | undefined>) {
            state.error = action.payload;
            state.loading = false;
        },
        setWalletCoins(state, action: PayloadAction<number>) {
            state.wallet.coins = Math.max(0, action.payload);
        },
        setProfileAttributes(state, action: PayloadAction<Record<UserAttributeKey, UserAttributeValue>>) {
            state.attributes = action.payload;
        },
        setInventory(state, action: PayloadAction<InventoryItem[]>) {
            state.inventory = action.payload;
        },
        setProfileSkillTree(state, action: PayloadAction<ProfileSkillTreeState>) {
            state.skillTree = normalizeProfileSkillTreeState(action.payload);
        },
        setProfileControls(state, action: PayloadAction<Partial<InputBindingsState>>) {
            state.controls = normalizeInputBindings(action.payload);
        },
        clearProfileState(state) {
            state.wallet = { coins: 0 };
            state.attributes = createDefaultAttributes();
            state.skillTree = createDefaultProfileSkillTreeState();
            state.inventory = [];
            state.controls = normalizeInputBindings(DEFAULT_INPUT_BINDINGS);
            state.loading = false;
            state.error = undefined;
        },
    },
});

export const {
    setProfileState,
    setProfileStateLoading,
    setProfileStateError,
    setWalletCoins,
    setProfileAttributes,
    setInventory,
    setProfileSkillTree,
    setProfileControls,
    clearProfileState,
} = profileStateSlice.actions;

export default profileStateSlice.reducer;
