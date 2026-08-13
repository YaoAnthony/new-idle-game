import type { LotteryConsumeType } from './Lottery';
import type { LotteryPool } from './Lottery';
import type { AttributeKey } from '../shared/core/protagonistAttributeProgression';
import type { PublicRarityKey } from '@timeplan-game/core/economy/rarity';
import type {
    CreateStoreProductPayload as CoreCreateStoreProductPayload,
    StoreProductInputType as CoreStoreProductInputType,
    StoreProductRecord,
    StoreProductRarity,
    StoreProductType as CoreStoreProductType,
} from '@timeplan-game/core/contracts/store/storeProduct';
// ==================== Basic Types ====================

export type UserAttributeCategory = AttributeKey;

export type Rarity = StoreProductRarity;
export type EconomyRarity = PublicRarityKey;

export type StoreProductType = CoreStoreProductType;
export type StoreProductInputType = CoreStoreProductInputType;

export type MissionListType = 'mainline' | 'urgent';

// ==================== Request Options ====================

export interface RequestOptions {
    signal?: AbortSignal;
    headers?: Record<string, string | number | boolean>;
}

export interface AccessTokenInput {
    accessToken: string;
}

// ==================== Mission Related ====================

export interface UnlockCondition {
    type?: 'direct' | 'attributeLevel';
    attributeName?: string | null;
    minLevel?: number;
}

export interface PointPenalty {
    attributeName: string;
    value: number;
}

export interface ItemPenalty {
    itemKey: string;
    quantity: number;
}

export interface FailureMechanism {
    enabled?: boolean;
    pointPenalty?: PointPenalty[];
    itemPenalty?: ItemPenalty[];
}

export interface RewardExperience {
    name: string;
    value: number;
}

export interface RewardItem {
    itemKey: string;
    quantity: number;
}

export interface UnlockMissionReward {
    missionId: string;
    title: string;
    description?: string;
}

export interface TaskNodeReward {
    experience?: RewardExperience[];
    coins?: number;
    items?: RewardItem[];
    unlockMissions?: UnlockMissionReward[];
}

export interface Mission {
    _id: string;
    listType: MissionListType;
    title: string;
    description?: string;
    accepted: boolean;
    hasFailed: boolean;
    completedAt?: string | null;
    nodes: Array<{
        nodeId: string;
        parentNodeId: string | null;
        prerequisiteNodeIds?: string[];
        title: string;
        description?: string;
        content?: string;
        notice?: string;
        timeCostMinutes: number;
        startedAt?: string | null;
        completed: boolean;
        failed: boolean;
        isActive: boolean;
        canStart: boolean;
        canRestart: boolean;
        isLocked?: boolean;
        blockedByNodeIds?: string[];
        blockedByTitles?: string[];
        completedPrerequisiteNodeIds?: string[];
        completedPrerequisiteTitles?: string[];
        totalPrerequisiteCount?: number;
        completedPrerequisiteCount?: number;
        remainingPrerequisiteCount?: number;
        isMergeNode?: boolean;
        mergeSourceCount?: number;
        mergeTier?: 'milestone' | 'boss' | null;
        mergeBonusPreview?: {
            coins?: number;
            experience?: Array<{ name: string; value: number }>;
        } | null;
        rewards?: {
            experience?: Array<{ name: string; value: number }>;
            coins?: number;
            items?: Array<{ itemKey: string; quantity: number }>;
        };
        rarity?: EconomyRarity;
        rewardReason?: string;
    }>;
}

export type StoreProduct = StoreProductRecord;


export interface MissionList {
    _id: string;
    listType: MissionListType;
    title: string;
    description?: string;
    unlockCondition?: {
        type?: 'direct' | 'attributeLevel';
        attributeName?: string | null;
        minLevel?: number;
    };
    failureMechanism?: {
        enabled?: boolean;
        pointPenalty?: Array<{ attributeName: string; value: number }>;
        itemPenalty?: Array<{ itemKey: string; quantity: number }>;
    };
    hasFailed?: boolean;
    restartAllowed?: boolean;
    rootNodeId?: string | null;
    taskTree: MissionNode[];
}

interface MissionNodeReward {
    experience?: Array<{ name: string; value: number }>;
    coins?: number;
    items?: Array<{ itemKey: string; quantity: number }>;
    unlockMissions?: Array<{ missionId: string; title: string; description?: string }>;
}

interface MissionNode {
    nodeId: string;
    parentNodeId: string | null;
    prerequisiteNodeIds?: string[];
    title: string;
    description?: string;
    content?: string;
    notice?: string;
    timeCostMinutes: number;
    canInterrupt?: boolean;
    rewards?: MissionNodeReward;
    rarity?: EconomyRarity;
    rewardReason?: string;
    childrenNodeIds: string[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface SystemLite {
    _id: string;
    name: string;
    image?: string | null;
    description?: string;
    profile?: string;
    relationship?: {
        isOwner?: boolean;
        isMember?: boolean;
    };
    isOwner?: boolean;
    isMember?: boolean;
    modules?: {
        taskChain?: boolean;
        store?: boolean;
        lottery?: boolean;
    };
    storeProducts?: StoreProduct[];
    obtainableItems?: Array<{
        itemKey: string;
        name: string;
        image?: string | null;
        description?: string;
        rarity?: Rarity;
    }>;
    lotteryPools?: LotteryPool[];
    missionLists?: MissionList[];
    createdAt?: string;
    updatedAt?: string;
}

export interface SystemMemberSummary {
    _id?: string;
    user?: string | {
        _id?: string;
        username?: string;
        email?: string;
        image_url?: string | null;
    };
    profile?: string;
    joinedAt?: string;
}


export type SystemWithMission = SystemLite;

// ==================== Payload Interfaces ====================

export interface CreateSystemPayload {
    name: string;
    image?: string | null;
    description?: string;
    modules?: {
        taskChain?: boolean;
        store?: boolean;
        lottery?: boolean;
    };
    attributeBoard?: Array<{
        category: UserAttributeCategory;
        displayName: string;
        attributes?: Array<{ name: string; level?: number; used?: boolean }>;
    }>;
    obtainableItems?: Array<{
        itemKey: string;
        name: string;
        image?: string | null;
        description?: string;
        rarity?: Rarity;
    }>;
    missionLists?: unknown[];
    storeProducts?: unknown[];
    lotteryPools?: unknown[];
}

export interface CreateMissionListPayload {
    listType: MissionListType;
    title: string;
    description?: string;
    unlockCondition?: UnlockCondition;
    failureMechanism?: FailureMechanism;
}

export interface CreateMissionNodePayload {
    nodeId?: string;
    parentNodeId?: string | null;
    prerequisiteNodeIds?: string[];
    title: string;
    description?: string;
    content?: string;
    notice?: string;
    timeCostMinutes: number;
    canInterrupt?: boolean;
    rewards?: TaskNodeReward;
}

export type CreateStoreProductPayload = CoreCreateStoreProductPayload;

export interface CreateLotteryPoolPayload {
    name: string;
    description?: string;
    consume?: {
        type?: LotteryConsumeType;
        itemKey?: string | null;
        quantity?: number;
    };
}

export interface CreateLotteryPrizePayload {
    productId: string;
    quantity?: number;
    probability: number;
}

export interface UpdateLotteryPoolPayload {
    name?: string;
    description?: string;
    consume?: {
        type?: LotteryConsumeType;
        itemKey?: string | null;
        quantity?: number;
    };
}

export interface AddSystemAttributePayload {
    category: UserAttributeCategory;
    displayName?: string;
    name: string;
    level?: number;
}

export interface AddSystemItemPayload {
    itemKey: string;
    name: string;
    image?: string;
    description?: string;
    rarity?: Rarity;
}
