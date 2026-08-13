import type { ReactNode } from 'react';
import type { SystemLite } from '../../../../../Types/System';

export type SystemOverviewTabKey = 'people' | 'tasks' | 'store' | 'lottery' | 'daily-quests';

export type SystemOverviewCardsProps = {
    system: SystemLite;
    systemId: string;
    eventCount: number;
    onOpenTab: (tabKey: SystemOverviewTabKey) => void;
};

export type SystemOverviewCardProps = {
    title: string;
    value: string | number;
    detail: string;
    icon: ReactNode;
    hasNotice?: boolean;
    onClick: () => void;
};
