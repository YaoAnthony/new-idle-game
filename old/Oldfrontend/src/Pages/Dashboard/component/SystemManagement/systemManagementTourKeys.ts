export const SYSTEM_MANAGEMENT_NAV_TOUR_VERSION = 1;

export const SYSTEM_MANAGEMENT_NAV_TOUR_KEYS = {
    workspaceOverview: 'systemManagement.workspaceOverview',
    systemInfo: 'systemManagement.systemInfo',
    peopleManagement: 'systemManagement.peopleManagement',
    taskChain: 'systemManagement.taskChain',
    systemStore: 'systemManagement.systemStore',
    lotteryPool: 'systemManagement.lotteryPool',
    dailyQuests: 'systemManagement.dailyQuests',
} as const;

export type SystemManagementNavTourKey =
    typeof SYSTEM_MANAGEMENT_NAV_TOUR_KEYS[keyof typeof SYSTEM_MANAGEMENT_NAV_TOUR_KEYS];

export const SYSTEM_MANAGEMENT_NAV_TOUR_KEY_LIST: SystemManagementNavTourKey[] = [
    SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.workspaceOverview,
    SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.systemInfo,
    SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.peopleManagement,
    SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.taskChain,
    SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.systemStore,
    SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.lotteryPool,
    SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.dailyQuests,
];
