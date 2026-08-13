export type LotteryConsumeType = 'none' | 'item' | 'coins';

export type LotteryDrawMode = 'simple' | 'genshin';

// ─── Simple mode ─────────────────────────────────────────────────────────────
export type SimplePrize = {
    _id: string;
    type: 'item' | 'coins';
    productId?: string | null;
    quantity: number;
    probability: number;
    name: string;
};

// ─── Genshin mode ─────────────────────────────────────────────────────────────
export type GenshinTierItem = {
    _id: string;
    type: 'item' | 'coins';
    productId?: string | null;
    quantity: number;
    name: string;
};

export type GenshinTier = {
    tierIndex: 0 | 1 | 2; // 0=featured, 1=rare, 2=common
    name: string;
    baseRate: number;
    softPityStart: number;
    hardPityLimit: number;
    softPityIncrement: number;
    items: GenshinTierItem[];
};

// ─── Pool ─────────────────────────────────────────────────────────────────────
export type LotteryPool = {
    _id: string;
    name: string;
    description?: string;
    image?: string | null;
    drawMode?: LotteryDrawMode;
    consume?: {
        type?: LotteryConsumeType;
        itemKey?: string | null;
        quantity?: number;
    };
    // simple mode
    prizes?: SimplePrize[];
    // genshin mode
    genshinTiers?: GenshinTier[];
    canGetNothing?: boolean;
};

// ─── Draw result ──────────────────────────────────────────────────────────────
export type DrawResult = {
    poolId: string;
    poolName: string;
    won: boolean;
    reward?: {
        productId: string | null;
        productName: string;
        productType: string;
        quantity: number;
    } | null;
    randomValue: number;
    tierIndex?: number | null;
    pityCount?: number;
    isFeatured?: boolean;
    drawRecordId?: string;
};

// ─── Pity ────────────────────────────────────────────────────────────────────
export type TierPity = {
    tierIndex: number;
    pullCount: number;
};

export type LotteryPityCounter = {
    poolId: string;
    pullCount: number;
    tierPities?: TierPity[];
};

// ─── History ─────────────────────────────────────────────────────────────────
export type LotteryHistoryRecord = {
    _id: string;
    poolId: string;
    poolName: string;
    consumed?: {
        type?: LotteryConsumeType;
        itemKey?: string | null;
        quantity?: number;
    };
    reward?: {
        productId?: string | null;
        productName?: string;
        productType?: string | null;
        quantity?: number;
    };
    won: boolean;
    randomValue: number;
    tierIndex?: number | null;
    createdAt: string;
};
