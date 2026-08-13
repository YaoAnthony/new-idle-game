import React from 'react';
import { FaCalendarCheck, FaDice, FaGamepad, FaStore, FaUsers } from 'react-icons/fa';

import { useGetDailyQuestPoolQuery, useGetSystemMembersQuery } from '../../../../../api/systemRtkApi';
import SystemOverviewCard from './SystemOverviewCard';
import type { SystemOverviewCardsProps } from './types';

const SystemOverviewCards: React.FC<SystemOverviewCardsProps> = ({
    system,
    systemId,
    eventCount,
    onOpenTab,
}) => {
    const { data: memberData, isLoading: isLoadingMembers } = useGetSystemMembersQuery({ systemId });
    const { data: dailyQuestPoolData, isLoading: isLoadingDailyQuests } = useGetDailyQuestPoolQuery({ systemId });

    const memberCount = memberData?.members?.length ?? 0;
    const missionListCount = system.missionLists?.length ?? 0;
    const products = system.storeProducts ?? [];
    const listedProductCount = products.filter((product) => product.isListed !== false).length;
    const lotteryPoolCount = system.lotteryPools?.length ?? 0;
    const dailyQuestCount = dailyQuestPoolData?.pool?.length ?? 0;

    return (
        <section className="system-overview-section" aria-label="系统概览">
            <SystemOverviewCard
                title="人员管理"
                value={isLoadingMembers ? '...' : memberCount}
                detail="加入人员"
                icon={<FaUsers />}
                hasNotice={eventCount > 0}
                onClick={() => onOpenTab('people')}
            />
            <SystemOverviewCard
                title="任务链"
                value={missionListCount}
                detail="系列任务"
                icon={<FaGamepad />}
                onClick={() => onOpenTab('tasks')}
            />
            <SystemOverviewCard
                title="系统商城"
                value={products.length}
                detail={`上架 ${listedProductCount}`}
                icon={<FaStore />}
                onClick={() => onOpenTab('store')}
            />
            <SystemOverviewCard
                title="祈愿卡池"
                value={lotteryPoolCount}
                detail="卡池"
                icon={<FaDice />}
                onClick={() => onOpenTab('lottery')}
            />
            <SystemOverviewCard
                title="每日任务"
                value={isLoadingDailyQuests ? '...' : dailyQuestCount}
                detail="任务"
                icon={<FaCalendarCheck />}
                onClick={() => onOpenTab('daily-quests')}
            />
        </section>
    );
};

export default SystemOverviewCards;
