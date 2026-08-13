import type { User } from "./User";
import type { SystemLite } from "./System";
import type { GameWorldState } from '../Pages/Dashboard/component/SystemIdleGame/types';
import type { GameSaveV2 } from '../Pages/Dashboard/component/SystemIdleGame/persistence/save/GameSaveTypes';
import type { AttributeKey, AttributeValue } from '../shared/core/protagonistAttributeProgression';
import type {
    ProfileChestRewardItem,
    ProfileFacingDirection,
    ProfileGameChest,
    ProfileIdleGameState,
    ProfileInventoryItem,
    ProfileOnboarding as CoreProfileOnboarding,
    ProfileOnboardingTourState,
    ProfileOnboardingTourStatus,
    ProfilePaymentMethod,
    ProfileTreeSaveState,
    UserProfile,
} from '@timeplan-game/core/contracts/profile/profileTypes';

export type { AttributeKey, AttributeValue };

export type InventoryItem = ProfileInventoryItem;

export type PaymentMethod = ProfilePaymentMethod;

export type FacingDirection = ProfileFacingDirection;

export type ChestRewardItem = ProfileChestRewardItem;

export type GameChest = ProfileGameChest;

export type TreeSaveState = ProfileTreeSaveState;

export type IdleGameState = ProfileIdleGameState<GameWorldState>;

export type OnboardingTourStatus = ProfileOnboardingTourStatus;

export type OnboardingTourState = ProfileOnboardingTourState;

export type ProfileOnboarding = CoreProfileOnboarding;

export type Profile = UserProfile<User, SystemLite, GameSaveV2>;
