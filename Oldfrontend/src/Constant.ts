//Defuze
import { getRarityColor } from '@timeplan-game/core/economy/coinRules';

export const APPNAME = '随便吧';


export const navLists = ['timetable'];

// 稀有度颜色配置
export const RARITY_COLORS = {
    common: {
        name: '普通',
        color: getRarityColor('common'),
        border: 'border-white/50 dark:border-white/20',
        bg: 'bg-white/80 dark:bg-white/10',
        glow: 'shadow-white/20',
    },
    uncommon: {
        name: '罕见',
        color: getRarityColor('uncommon'),
        border: 'border-green-400/50 dark:border-green-400/30',
        bg: 'bg-green-50/80 dark:bg-green-900/20',
        glow: 'shadow-green-400/30',
    },
    rare: {
        name: '稀有',
        color: getRarityColor('rare'),
        border: 'border-blue-400/50 dark:border-blue-400/30',
        bg: 'bg-blue-50/80 dark:bg-blue-900/20',
        glow: 'shadow-blue-400/30',
    },
    epic: {
        name: '史诗',
        color: getRarityColor('epic'),
        border: 'border-purple-500/50 dark:border-purple-500/30',
        bg: 'bg-purple-50/80 dark:bg-purple-900/20',
        glow: 'shadow-purple-500/30',
    },
    legendary: {
        name: '传说',
        color: getRarityColor('legendary'),
        border: 'border-orange-500/50 dark:border-orange-500/30',
        bg: 'bg-orange-50/80 dark:bg-orange-900/20',
        glow: 'shadow-orange-500/30',
    },
    mythic: {
        name: '神话',
        color: getRarityColor('mythic'),
        border: 'border-red-600/50 dark:border-red-600/30',
        bg: 'bg-red-50/80 dark:bg-red-900/20',
        glow: 'shadow-red-600/40',
    },
} as const;

export type RarityLevel = keyof typeof RARITY_COLORS;
