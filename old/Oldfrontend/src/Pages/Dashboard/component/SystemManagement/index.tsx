import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { message, Tabs, Tour, type TourProps } from 'antd';
import { FaArrowLeft, FaCogs, FaGamepad, FaStore, FaDice, FaInfoCircle, FaCalendarCheck, FaUsers } from 'react-icons/fa';


import { RootState } from '../../../../Redux/store';
import { getEnv } from '../../../../config/env';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import { 
    useLazyGetSystemListQuery,
} from '../../../../api/systemRtkApi';

// components
import SystemInfoPanel from './SystemInfoPanel';
import type { SystemOverviewTabKey } from './SystemOverviewCards';
import StorePanel from './StorePanel';
import LotteryPanel from './LotteryPanel';
import TaskChainPanel from './TaskChainPanel';
import DailyQuestPanel from './DailyQuestPanel';
import PersonnelManagementPanel, { type PersonnelEventItem } from './PersonnelManagementPanel';
import { SYSTEM_MANAGEMENT_NAV_TOUR_KEYS, SYSTEM_MANAGEMENT_NAV_TOUR_VERSION } from './systemManagementTourKeys';
import { useUpdateOnboardingTourMutation } from '../../../../api/profileApi';
import type { OnboardingTourState, OnboardingTourStatus } from '../../../../Types/Profile';
import './SystemManagement.css';
const { TabPane } = Tabs;

const shouldShowSystemManagementTour = (tourState?: OnboardingTourState): boolean => {
    if (!tourState) return true;
    if (tourState.version < SYSTEM_MANAGEMENT_NAV_TOUR_VERSION) return true;
    if (tourState.status === 'not_started') return true;
    if (tourState.status !== 'snoozed') return false;
    if (!tourState.snoozedUntil) return true;
    return new Date(tourState.snoozedUntil).getTime() <= Date.now();
};

const getTourTarget = (tourKey: string) => () =>
    document.querySelector(`[data-tour-key="${tourKey}"]`) as HTMLElement;

const SystemManagement: React.FC = () => {
    const { systemId } = useParams<{ systemId: string }>();
    const navigate = useNavigate();
    
    const systems = useSelector((state: RootState) => state.system.systems);
    const accessToken = useSelector((state: RootState) => state.user.accessToken);
    const profile = useSelector((state: RootState) => state.profile.profile);
    const currentSystem = systems.find(sys => sys._id === systemId);
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const [updateOnboardingTour] = useUpdateOnboardingTourMutation();

    const [activeTab, setActiveTab] = useState('info');
    const [taskEventFeed, setTaskEventFeed] = useState<PersonnelEventItem[]>([]);
    const [workspaceTourOpen, setWorkspaceTourOpen] = useState(false);
    const [workspaceTourChecked, setWorkspaceTourChecked] = useState(false);

    const workspaceTourSteps = useMemo<TourProps['steps']>(() => [
        {
            title: '任务链',
            description: '这里用来设计系统里的长期任务线。你可以把目标拆成多个任务节点，让玩家在游戏中接取、推进并领取奖励。',
            target: getTourTarget(SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.taskChain),
        },
        {
            title: '系统商城',
            description: '这里配置系统专属商品。商品上架后，玩家可以在游戏内商城用金币购买。',
            target: getTourTarget(SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.systemStore),
        },
        {
            title: '祈愿卡池',
            description: '这里创建抽奖池和奖品，用来做随机奖励、稀有物品获取，或者活动式抽取。',
            target: getTourTarget(SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.lotteryPool),
        },
        {
            title: '每日任务',
            description: '这里管理每天派发的任务池和派发数量。玩家会在游戏里的每日任务面板看到并完成它们。',
            target: getTourTarget(SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.dailyQuests),
        },
    ], []);

    useEffect(() => {
        if (!systemId) {
            message.error('系统ID缺失');
            navigate('/dashboard/setting/my');
            return;
        }
        if (!currentSystem) {
            message.warning('未找到该系统，请先在设置中选择');
            // 可以在这里调用API获取系统详情
        }
    }, [systemId, currentSystem, navigate]);

    useEffect(() => {
        if (!currentSystem || !profile || workspaceTourChecked) return;
        const tourState = profile.onboarding?.tours?.[SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.workspaceOverview];
        setWorkspaceTourOpen(shouldShowSystemManagementTour(tourState));
        setWorkspaceTourChecked(true);
    }, [currentSystem, profile, workspaceTourChecked]);

    const persistWorkspaceTourState = (status: OnboardingTourStatus) => {
        setWorkspaceTourOpen(false);
        updateOnboardingTour({
            tourKey: SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.workspaceOverview,
            status,
            version: SYSTEM_MANAGEMENT_NAV_TOUR_VERSION,
        }).unwrap().catch((error) => {
            console.error('Update system management tour status failed:', error);
        });
    };

    const { backendUrl } = getEnv();
    const taskSseUrl = systemId && accessToken
        ? `${backendUrl}/system/${systemId}/tasks/events?token=${encodeURIComponent(accessToken)}`
        : null;

    useSSEWithReconnect({
        url: taskSseUrl,
        enabled: Boolean(systemId && accessToken),
        onMessage: (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload?.type === 'connected') return;

                let text = '';
                if (payload?.type === 'member_start_task') {
                    text = `成员开始任务：${payload.nodeTitle || payload.nodeId}`;
                    message.info(text);
                } else if (payload?.type === 'member_complete_task') {
                    text = `成员完成任务：${payload.nodeTitle || payload.nodeId}`;
                    message.success(text);
                } else if (payload?.type === 'member_accept_list') {
                    text = `成员接取任务列表：${payload.missionListTitle || ''}`;
                    message.info(text);
                } else if (payload?.type === 'member_fail_task') {
                    text = `成员任务失败：${payload.nodeTitle || payload.nodeId}`;
                    message.warning(text);
                } else if (payload?.type === 'member_restart_task') {
                    text = `成员重开任务：${payload.nodeTitle || payload.nodeId}`;
                    message.info(text);
                } else if (payload?.type === 'member_purchase_product') {
                    text = `成员购买商品：${payload.productName || payload.productId} x${payload.quantity || 1}`;
                    message.success(text);
                    triggerGetSystemList();
                } else if (payload?.type === 'member_lottery_draw') {
                    if (payload?.won && payload?.reward?.productName) {
                        text = `成员抽卡中奖：${payload.reward.productName} x${payload.reward.quantity || 1}`;
                        message.success(text);
                    } else {
                        text = `成员抽卡未中奖：${payload.poolName || payload.poolId}`;
                        message.info(text);
                    }
                    triggerGetSystemList();
                } else if (payload?.type === 'mission_list_deleted') {
                    text = `任务列表已删除：${payload.missionListTitle || payload.missionListId}`;
                    message.warning(text);
                    triggerGetSystemList();
                } else if (payload?.type === 'member_leave_system') {
                    text = `成员退出系统：${payload.memberUserId || '未知成员'}`;
                    message.warning(text);
                    triggerGetSystemList();
                } else if (payload?.type === 'system_deletion_started') {
                    text = `系统删除流程已开始：${payload.systemName || payload.systemId}`;
                    message.warning(text);
                } else if (payload?.type === 'system_deletion_cleaning_profiles_started') {
                    text = `正在清理成员数据：${payload.profileCount || 0} 个档案`;
                    message.loading({ content: text, key: 'system-delete-progress', duration: 1.2 });
                } else if (payload?.type === 'system_deletion_cleaning_profiles_completed') {
                    text = `成员数据清理完成：${payload.profileCount || 0} 个档案`;
                    message.success({ content: text, key: 'system-delete-progress', duration: 1.8 });
                } else if (payload?.type === 'system_deletion_deleting_system') {
                    text = '正在删除系统主体...';
                    message.loading({ content: text, key: 'system-delete-progress', duration: 1.2 });
                } else if (payload?.type === 'system_deleted') {
                    text = `系统已删除：${payload.systemName || payload.systemId}`;
                    message.success({ content: text, key: 'system-delete-progress' });
                    triggerGetSystemList();
                    navigate('/dashboard/setting/my');
                }

                if (text) {
                    setTaskEventFeed((prev) => {
                        const next = [{
                            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            text,
                            time: new Date().toLocaleTimeString(),
                            type: payload?.type || 'unknown',
                        }, ...prev];
                        return next.slice(0, 30);
                    });
                }
            } catch (error) {
                console.error('Parse SSE payload error:', error);
            }
        },
    });

    if (!currentSystem) {
        return (
            <section className="system-management-page system-management-loading">
                <div className="system-management-bg-layer" />
                <div className="text-center">
                    <FaCogs className="system-management-loading-icon" />
                    <p>系统加载中...</p>
                </div>
            </section>
        );
    }

    

    return (
        <section className="system-management-page">
            <div className="system-management-bg-layer" />

            <header className="system-management-header">
                <div className="system-management-header-left">
                    <motion.button 
                        whileHover={{ scale: 1.05, x: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => navigate('/dashboard/setting/my')}
                        className="system-management-back-button"
                    >
                        <FaArrowLeft className="text-xl" />
                        <span className="hidden sm:inline tracking-widest">返回工作室</span>
                    </motion.button>

                    <div className="system-management-title-group">
                        <span className="system-management-title-mark">
                            <FaCogs />
                        </span>
                        <div>
                            <span className="system-management-kicker">系统工作室</span>
                            <h1>{currentSystem.name}</h1>
                        </div>
                    </div>
                </div>
            </header>

            <div className="system-management-tab-shell">
                <Tabs 
                    activeKey={activeTab} 
                    onChange={setActiveTab}
                    className="system-management-tabs system-tabs"
                >
                    <TabPane 
                        tab={<span data-tour-key={SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.systemInfo} className="flex items-center gap-2 tracking-widest"><FaInfoCircle />系统信息</span>} 
                        key="info"
                    >
                        <SystemInfoPanel
                            system={currentSystem}
                            eventCount={taskEventFeed.length}
                            onOpenTab={(tabKey: SystemOverviewTabKey) => setActiveTab(tabKey)}
                        />
                    </TabPane>

                    <TabPane
                        tab={<span data-tour-key={SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.peopleManagement} className="flex items-center gap-2 tracking-widest"><FaUsers />人员管理</span>}
                        key="people"
                    >
                        <PersonnelManagementPanel
                            systemId={systemId!}
                            events={taskEventFeed}
                            onClearEvents={() => setTaskEventFeed([])}
                        />
                    </TabPane>

                    <TabPane
                        tab={<span data-tour-key={SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.taskChain} className="flex items-center gap-2 tracking-widest"><FaGamepad />任务链</span>}
                        key="tasks"
                    >
                        <TaskChainPanel systemId={systemId!} />
                    </TabPane>

                    <TabPane
                        tab={<span data-tour-key={SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.systemStore} className="flex items-center gap-2 tracking-widest"><FaStore />系统商城</span>}
                        key="store"
                    >
                        <StorePanel systemId={systemId!} />
                    </TabPane>

                    <TabPane
                        tab={<span data-tour-key={SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.lotteryPool} className="flex items-center gap-2 tracking-widest"><FaDice />祈愿卡池</span>}
                        key="lottery"
                    >
                        <LotteryPanel systemId={systemId!} />
                    </TabPane>

                    <TabPane
                        tab={<span data-tour-key={SYSTEM_MANAGEMENT_NAV_TOUR_KEYS.dailyQuests} className="flex items-center gap-2 tracking-widest"><FaCalendarCheck />每日任务</span>}
                        key="daily-quests"
                    >
                        <DailyQuestPanel systemId={systemId!} />
                    </TabPane>
                </Tabs>
            </div>

            <Tour
                rootClassName="system-management-tour"
                open={workspaceTourOpen}
                steps={workspaceTourSteps}
                onClose={() => persistWorkspaceTourState('dismissed')}
                onFinish={() => persistWorkspaceTourState('completed')}
                mask={{ color: 'rgba(0, 0, 0, 0.58)' }}
            />
        </section>
    );
};



export default SystemManagement;
