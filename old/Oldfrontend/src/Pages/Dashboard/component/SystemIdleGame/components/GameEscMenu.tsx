import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { message } from 'antd';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { getRarityLabel } from '@timeplan-game/core/economy/rarity';
import {
  FaCalendarCheck,
  FaCheck,
  FaCog,
  FaCopy,
  FaDatabase,
  FaGamepad,
  FaGift,
  FaHourglassHalf,
  FaImages,
  FaListUl,
  FaLock,
  FaMapMarkerAlt,
  FaBoxOpen,
  FaPlay,
  FaPlus,
  FaRedo,
  FaShoppingBag,
  FaStar,
  FaStore,
  FaTimes,
  FaUser,
  FaUsers,
} from 'react-icons/fa';

import { setSelectedSystemId, type SystemLite } from '../../../../../Redux/Features/systemSlice';
import type { Profile } from '../../../../../Types/Profile';
import type { Mission, StoreProduct } from '../../../../../Types/System';
import {
  useAcceptMissionListMutation,
  useCompleteDailyQuestMutation,
  useCompleteMemberTaskMutation,
  useFailMemberTaskMutation,
  useGetMemberDailyQuestsQuery,
  useGetMemberTaskCenterQuery,
  useJoinSystemMutation,
  useLazySearchSystemQuery,
  useLeaveSystemMutation,
  usePurchaseStoreProductMutation,
  useRestartMemberTaskMutation,
  useStartMemberTaskMutation,
} from '../../../../../api/systemRtkApi';
import { arrowMouseIconUrl, goldIcon } from '../../../../../assets';
import { canMaintainSystemInGame, getMemberSystems, isMemberSystem, isOwnedSystem } from '../../../../../utils/systemRelationship';
import NPCData from '../../NPCData';
import SystemLottery from '../../SystemLottery';
import { gameBus } from '../shared/EventBus';
import OwnerPlayerSystemTools, { type OwnerPlayerSystemToolPart } from './OwnerPlayerSystemTools';
import PlayerProfilePanel, { AttributePixelIcon } from './PlayerProfilePanel';
import { MemoryAlbumModal } from './MemoryAlbumModal';
import {
  normalizeAttributeKey,
  type AttributeKey,
} from '../../../../../shared/core/protagonistAttributeProgression';
import './GameEscMenu.css';

type ActiveSystemTask = {
  systemId: string;
  systemName: string;
  missionListId: string;
  missionListTitle: string;
  nodeId: string;
  nodeTitle: string;
  startedAt: string;
  timeCostMinutes: number;
  requiredSeconds: number;
  elapsedSeconds: number;
  overtimeSeconds: number;
  isOvertime: boolean;
};

const SELECTED_SYSTEM_STORAGE_KEY = 'timeplan:selectedSystemId';

function clearStoredSelectedSystemId() {
  try {
    window.localStorage.removeItem(SELECTED_SYSTEM_STORAGE_KEY);
  } catch {
    // Redux remains the active state source when storage is unavailable.
  }
}

export type GameEscMenuAction =
  | 'game-shop'
  | 'multiplay'
  | 'profile-panel'
  | 'system-store'
  | 'backpack'
  | 'game-settings'
  | 'system-tasks'
  | 'daily-tasks'
  | 'memory-album'
  | 'lottery'
  | 'system-settings'
  | 'npc-data';

interface GameEscMenuProps {
  open: boolean;
  playerName: string;
  avatarUrl?: string;
  walletCoins: number;
  systems: SystemLite[];
  selectedSystemId: string | null;
  activeTasks: ActiveSystemTask[];
  onClose: () => void;
  onAction: (action: GameEscMenuAction) => void;
}

type GameEscOpenActionOptions = {
  systemSettingsInitialPart?: OwnerPlayerSystemToolPart | null;
};

interface GameEscContentModalProps {
  open: boolean;
  action: GameEscMenuAction | null;
  profile: Profile | null;
  playerName?: string;
  avatarUrl?: string;
  systems: SystemLite[];
  selectedSystemId: string | null;
  roomId?: string | null;
  sceneRef?: React.RefObject<any>;
  onClose: () => void;
  onOpenAction: (action: GameEscMenuAction) => void;
}

type OpenGameEscAction = (action: GameEscMenuAction, options?: GameEscOpenActionOptions) => void;

interface GameEscCursorProps {
  active: boolean;
}

type HoverFrameBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const menuItems: Array<{
  action: GameEscMenuAction;
  label: string;
  icon: React.ReactNode;
  accent: string;
}> = [
  { action: 'game-shop', label: '游戏商店', icon: <FaShoppingBag />, accent: '#f4c86a' },
  { action: 'multiplay', label: '多人联机', icon: <FaUsers />, accent: '#6fb7ff' },
  { action: 'profile-panel', label: '个人', icon: <FaUser />, accent: '#67e8f9' },
  { action: 'system-store', label: '商城', icon: <FaStore />, accent: '#e6b850' },
  { action: 'backpack', label: '背包', icon: <FaBoxOpen />, accent: '#bba7ff' },
  { action: 'game-settings', label: '游戏设置', icon: <FaCog />, accent: '#9fb8d8' },
  { action: 'system-tasks', label: '系列任务', icon: <FaListUl />, accent: '#80b7ff' },
  { action: 'daily-tasks', label: '每日任务', icon: <FaCalendarCheck />, accent: '#7fe0bd' },
  { action: 'memory-album', label: '相册', icon: <FaImages />, accent: '#e6b850' },
  { action: 'lottery', label: '祈愿', icon: <FaStar />, accent: '#ffd66e' },
  { action: 'system-settings', label: '系统设置', icon: <FaGamepad />, accent: '#f08f8f' },
  { action: 'npc-data', label: 'NPC data', icon: <FaDatabase />, accent: '#a6d7ff' },
];

const modalTitles: Partial<Record<GameEscMenuAction, string>> = {
  'profile-panel': '个人',
  'system-store': '商城',
  'system-tasks': '系列任务',
  'daily-tasks': '每日任务',
  'memory-album': '相册',
  'lottery': '祈愿',
  'system-settings': '系统设置',
  'npc-data': 'NPC data',
};

const modalTitleKeys: Partial<Record<GameEscMenuAction, string>> = {
  'profile-panel': 'gameEsc.modal.profile',
  'system-store': 'gameEsc.modal.systemStore',
  'system-tasks': 'gameEsc.modal.systemTasks',
  'daily-tasks': 'gameEsc.modal.dailyTasks',
  'memory-album': 'gameEsc.modal.memoryAlbum',
  lottery: 'gameEsc.modal.lottery',
  'system-settings': 'gameEsc.modal.systemSettings',
  'npc-data': 'gameEsc.modal.npcData',
};

const menuLabelKeys: Partial<Record<GameEscMenuAction, string>> = {
  'npc-data': 'gameEsc.menu.npcData',
};

const drawerShellVariants: Variants = {
  open: {
    x: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 260,
      damping: 32,
      when: 'beforeChildren',
    },
  },
  closed: {
    x: 470,
    opacity: 0,
    transition: {
      delay: 0.12,
      type: 'spring',
      stiffness: 420,
      damping: 42,
      when: 'afterChildren',
    },
  },
};

const drawerBackgroundVariants: Variants = {
  open: (height = 1000) => ({
    clipPath: `circle(${Math.max(height, 1000) * 2 + 240}px at calc(100% - 40px) 40px)`,
    transition: {
      type: 'spring',
      stiffness: 22,
      restDelta: 2,
    },
  }),
  closed: {
    clipPath: 'circle(30px at calc(100% - 40px) 40px)',
    transition: {
      delay: 0.08,
      type: 'spring',
      stiffness: 420,
      damping: 42,
    },
  },
};

const drawerContentVariants: Variants = {
  open: {
    transition: { delayChildren: 0.12, staggerChildren: 0.055 },
  },
  closed: {
    transition: { staggerChildren: 0.03, staggerDirection: -1 },
  },
};

const drawerItemVariants: Variants = {
  open: {
    y: 0,
    opacity: 1,
    transition: {
      y: { type: 'spring', stiffness: 900, damping: 34 },
      opacity: { duration: 0.16 },
    },
  },
  closed: {
    y: 28,
    opacity: 0,
    transition: {
      y: { type: 'spring', stiffness: 900, damping: 42 },
      opacity: { duration: 0.12 },
    },
  },
};

function getSelectedSystem(systems: SystemLite[], selectedSystemId: string | null) {
  return systems.find((system) => system._id === selectedSystemId) ?? systems[0] ?? null;
}

function formatStartedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  return date.toLocaleString();
}

const padTimeUnit = (value: number) => String(Math.max(0, Math.floor(value))).padStart(2, '0');

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${padTimeUnit(safe / 3600)}:${padTimeUnit((safe % 3600) / 60)}:${padTimeUnit(safe % 60)}`;
}

function EmptyPanel({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="game-menu-empty">
      <div className="game-menu-empty__mark">◇</div>
      <strong>{title}</strong>
      <span>{text}</span>
      {action ? <div className="game-menu-empty__actions">{action}</div> : null}
    </div>
  );
}

function SystemSetupButton({ onOpenAction }: { onOpenAction: OpenGameEscAction }) {
  return (
    <button type="button" className="game-menu-empty__link" onClick={() => onOpenAction('system-settings')}>
      <FaPlus /> 添加 / 创建系统
    </button>
  );
}

function CreateMissionListButton({ onOpenAction }: { onOpenAction: OpenGameEscAction }) {
  return (
    <button
      type="button"
      className="game-menu-empty__link"
      onClick={() => onOpenAction('system-settings', { systemSettingsInitialPart: 'task-chain' })}
    >
      <FaPlus /> 创建系列任务
    </button>
  );
}

function CursorCorner({
  thickness = 2,
  length = 10,
  ...position
}: {
  thickness?: number;
  length?: number;
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}) {
  return (
    <>
      <motion.div
        layout
        className="game-esc-cursor-corner"
        style={{
          width: thickness,
          height: length,
          ...position,
        }}
      />
      <motion.div
        layout
        className="game-esc-cursor-corner"
        style={{
          width: length,
          height: thickness,
          ...position,
        }}
      />
    </>
  );
}

export function GameEscCursor({ active }: GameEscCursorProps) {
  const [box, setBox] = useState<HoverFrameBox | null>(null);

  useEffect(() => {
    if (!active) {
      setBox(null);
      return undefined;
    }

    const updateFrame = (target: EventTarget | null) => {
      if (!(target instanceof Element)) {
        setBox(null);
        return;
      }

      const targetElement = target.closest('button, a, input[type="button"], input[type="submit"], [role="button"], [data-cursor="pointer"]');
      if (!(targetElement instanceof HTMLElement) || targetElement.matches(':disabled')) {
        setBox(null);
        return;
      }

      const rect = targetElement.getBoundingClientRect();
      setBox({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    const handlePointerOver = (event: PointerEvent) => updateFrame(event.target);
    const handlePointerOut = (event: PointerEvent) => {
      if (!(event.relatedTarget instanceof Element)) {
        setBox(null);
        return;
      }
      updateFrame(event.relatedTarget);
    };
    const clearFrame = () => setBox(null);

    window.addEventListener('pointerover', handlePointerOver);
    window.addEventListener('pointerout', handlePointerOut);
    window.addEventListener('scroll', clearFrame, true);
    window.addEventListener('resize', clearFrame);

    return () => {
      window.removeEventListener('pointerover', handlePointerOver);
      window.removeEventListener('pointerout', handlePointerOut);
      window.removeEventListener('scroll', clearFrame, true);
      window.removeEventListener('resize', clearFrame);
    };
  }, [active]);

  if (!active) return null;

  return (
    <>
      <style>
        {`
          html,
          body,
          body * {
            cursor: url("${arrowMouseIconUrl}") 0 0, auto !important;
          }

          .game-esc-hover-frame {
            position: fixed;
            z-index: 99998;
            pointer-events: none;
            background: transparent;
            filter:
              drop-shadow(0 0 5px rgba(244, 200, 106, 0.48))
              drop-shadow(0 0 10px rgba(128, 183, 255, 0.16));
          }

          .game-esc-cursor-corner {
            position: absolute;
            background: #fff8df;
            box-shadow: 0 0 6px rgba(244, 200, 106, 0.7);
          }
        `}
      </style>
      <AnimatePresence>
        {box && (
          <motion.div
            className="game-esc-hover-frame"
            style={{
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          >
            <CursorCorner top={0} left={0} />
            <CursorCorner top={0} right={0} />
            <CursorCorner bottom={0} left={0} />
            <CursorCorner bottom={0} right={0} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function useDimensions(ref: React.RefObject<HTMLElement | null>) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (!ref.current) return;
      setDimensions({
        width: ref.current.offsetWidth,
        height: ref.current.offsetHeight,
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [ref]);

  return dimensions;
}

function CurrentTaskList({ activeTasks }: { activeTasks: ActiveSystemTask[] }) {
  if (activeTasks.length === 0) {
    return (
      <div className="game-menu-task-empty">
        当前没有正在进行的系统任务
      </div>
    );
  }

  return (
    <div className="game-menu-task-list">
      {activeTasks.slice(0, 3).map((task) => (
        <article key={`${task.systemId}-${task.missionListId}-${task.nodeId}`} className="game-menu-task-card">
          <div>
            <strong>{task.nodeTitle || task.nodeId}</strong>
            <span>{task.systemName} / {task.missionListTitle}</span>
          </div>
          <em>{task.isOvertime ? '超时' : '进行中'}</em>
        </article>
      ))}
    </div>
  );
}

const PRODUCT_TYPE_LABELS: Record<StoreProduct['type'], string> = {
  item: '道具',
  mission: '任务',
  lottery_chance: '祈愿',
};

function SystemStoreContent({
  system,
  walletCoins,
  onOpenAction,
}: {
  system: SystemLite | null;
  walletCoins: number;
  onOpenAction: OpenGameEscAction;
}) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | StoreProduct['type']>('all');
  const [rarityFilter, setRarityFilter] = useState<'all' | StoreProduct['rarity']>('all');
  const [purchaseProduct, { isLoading }] = usePurchaseStoreProductMutation();
  if (!system) {
    return <EmptyPanel title="没有可用系统" text="先创建或加入系统后，这里会显示系统商城。" action={<SystemSetupButton onOpenAction={onOpenAction} />} />;
  }

  const products = ((system.storeProducts || []) as StoreProduct[]).filter((product) => product.isListed !== false);
  const typeOptions = Array.from(new Set(products.map((product) => product.type).filter(Boolean))) as StoreProduct['type'][];
  const rarityOptions = Array.from(new Set(products.map((product) => product.rarity).filter(Boolean))) as StoreProduct['rarity'][];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleProducts = products.filter((product) => {
    if (typeFilter !== 'all' && product.type !== typeFilter) return false;
    if (rarityFilter !== 'all' && product.rarity !== rarityFilter) return false;
    if (!normalizedQuery) return true;
    return `${product.name} ${product.description || ''} ${product.type || ''} ${product.rarity || ''}`
      .toLowerCase()
      .includes(normalizedQuery);
  });

  if (products.length === 0) {
    return <EmptyPanel title="商城暂无商品" text="系统管理员上架商品后，会显示在这里。" />;
  }

  return (
    <div className="game-menu-store">
      <header className="game-menu-store-toolbar">
        <div className="game-menu-store-search">
          <FaStore />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索商品、稀有度或描述"
          />
        </div>
        <div className="game-menu-store-wallet">
          <span>金币</span>
          <strong>{walletCoins.toLocaleString()}</strong>
        </div>
      </header>

      <div className="game-menu-store-filters" aria-label="商城筛选">
        <button
          type="button"
          className={typeFilter === 'all' ? 'is-active' : ''}
          onClick={() => setTypeFilter('all')}
        >
          全部类型
        </button>
        {typeOptions.map((type) => (
          <button
            key={type}
            type="button"
            className={typeFilter === type ? 'is-active' : ''}
            onClick={() => setTypeFilter(type)}
          >
            {PRODUCT_TYPE_LABELS[type] || type}
          </button>
        ))}
        <span aria-hidden="true" />
        <button
          type="button"
          className={rarityFilter === 'all' ? 'is-active' : ''}
          onClick={() => setRarityFilter('all')}
        >
          全部稀有度
        </button>
        {rarityOptions.map((rarity) => (
          <button
            key={rarity}
            type="button"
            className={rarityFilter === rarity ? 'is-active' : ''}
            onClick={() => setRarityFilter(rarity)}
          >
            {getRarityLabel(rarity)}
          </button>
        ))}
      </div>

      {visibleProducts.length === 0 ? (
        <div className="game-menu-store-empty">没有符合筛选条件的商品</div>
      ) : (
        <div className="game-menu-store-grid">
          {visibleProducts.map((product) => {
            const price = Number(product.price || 0);
            const disabled = isLoading || product.stock === 0 || walletCoins < price;
            return (
              <article className="game-menu-product-card" key={product._id}>
                <div className="game-menu-product-card__thumb">
                  {product.image ? <img src={product.image} alt={product.name} /> : <FaStore />}
                </div>
                <div className="game-menu-product-card__body">
                  <div className="game-menu-product-card__eyebrow">
                    <span>{PRODUCT_TYPE_LABELS[product.type] || product.type}</span>
                    <span>{getRarityLabel(product.rarity || 'common')}</span>
                  </div>
                  <strong>{product.name}</strong>
                  <span>{product.description || '暂无描述'}</span>
                  <div className="game-menu-product-card__meta">
                    <em>{price.toLocaleString()} 金币</em>
                    <em>{product.stock == null ? '不限库存' : `库存 ${product.stock}`}</em>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => purchaseProduct({ systemId: system._id, productId: product._id, quantity: 1 })}
                >
                  {product.stock === 0 ? '售罄' : walletCoins < price ? '金币不足' : '购买'}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

type TaskCenterActiveTask = {
  missionListId: string;
  nodeId: string;
  startedAt: string;
} | null;

type MissionNode = Mission['nodes'][number];

type MissionTaskEntry = {
  key: string;
  group: string;
  mission: Mission;
  node: MissionNode;
};

function getMissionGroupLabel(mission: Mission) {
  return mission.listType === 'urgent' ? '冒险任务' : '日常任务';
}

function getTaskStatusLabel(mission: Mission, node: MissionNode) {
  if (node.isActive) return '进行中';
  if (node.completed) return '已完成';
  if (node.failed) return '失败';
  if (node.isLocked) return '锁定';
  if (!mission.accepted) return '未接取';
  if (node.canStart) return '可开始';
  return '等待中';
}

function getTaskStatusClass(node: MissionNode) {
  if (node.isActive) return 'is-active';
  if (node.completed) return 'is-complete';
  if (node.failed) return 'is-failed';
  if (node.isLocked) return 'is-locked';
  return '';
}

function buildMissionTaskEntries(missionLists: Mission[]): MissionTaskEntry[] {
  return missionLists.flatMap((mission) => {
    const nodes = mission.nodes || [];
    const visibleNodes = nodes.filter((node) => (
      node.isActive
      || node.failed
      || (!node.completed && !node.isLocked)
    ));
    return visibleNodes.map((node) => ({
      key: `${mission._id}:${node.nodeId}`,
      group: getMissionGroupLabel(mission),
      mission,
      node,
    }));
  });
}

function ActiveMissionTimer({
  missionId,
  node,
  activeTask,
}: {
  missionId: string;
  node: MissionNode;
  activeTask: TaskCenterActiveTask;
}) {
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const activeStartedAt = activeTask?.missionListId === missionId && activeTask.nodeId === node.nodeId
    ? activeTask.startedAt
    : node.startedAt;
  const startedAtMs = activeStartedAt ? new Date(activeStartedAt).getTime() : Number.NaN;
  const elapsed = Number.isNaN(startedAtMs) ? 0 : Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  const required = Math.max(60, Number(node.timeCostMinutes || 1) * 60);
  const progress = Math.min(100, Math.round((elapsed / required) * 100));

  return (
    <div className="game-menu-mission-timer">
      <div>
        <FaHourglassHalf />
        <span>任务进行时间</span>
      </div>
      <strong>{formatDuration(elapsed)}</strong>
      <i style={{ width: `${progress}%` }} />
    </div>
  );
}

function RewardPreview({
  node,
  storeProducts,
}: {
  node: MissionNode;
  storeProducts: StoreProduct[];
}) {
  const { t } = useTranslation();
  const rewards = node.rewards;
  const rewardItems: Array<{ key: string; label: string; value: string; image?: string | null; attributeKey?: AttributeKey | null }> = [];

  if ((rewards?.coins ?? 0) > 0) {
    rewardItems.push({ key: 'coins', label: '金币', value: String(rewards?.coins ?? 0), image: goldIcon });
  }

  rewards?.experience?.forEach((exp, index) => {
    const attributeKey = normalizeAttributeKey(exp.name);
    rewardItems.push({
      key: `exp-${exp.name}-${index}`,
      label: getAttributeRewardLabel(exp.name, t),
      value: `+${exp.value}`,
      attributeKey,
    });
  });

  rewards?.items?.forEach((item, index) => {
    const product = storeProducts.find((storeProduct) => storeProduct._id === item.itemKey);
    rewardItems.push({
      key: `item-${item.itemKey}-${index}`,
      label: product?.name || item.itemKey,
      value: `x${item.quantity}`,
      image: product?.image,
    });
  });

  if (rewardItems.length === 0) {
    return (
      <div className="game-menu-mission-rewards is-empty">
        <span>奖励预览</span>
        <em>暂无奖励</em>
      </div>
    );
  }

  return (
    <div className="game-menu-mission-rewards">
      <span>奖励预览</span>
      <div>
        {rewardItems.map((item) => (
          <article key={item.key}>
            {item.attributeKey
              ? <AttributePixelIcon attributeKey={item.attributeKey} className="game-menu-attribute-reward-icon" />
              : item.image
                ? <img src={item.image} alt={item.label} />
                : <FaGift />}
            <strong>{item.value}</strong>
            <em>{item.label}</em>
          </article>
        ))}
      </div>
    </div>
  );
}

function DailyRefreshTimer() {
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const now = new Date(nowMs);
  const nextReset = new Date(now);
  nextReset.setHours(24, 0, 0, 0);
  const remainingSeconds = Math.max(0, Math.floor((nextReset.getTime() - nowMs) / 1000));
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);

  return (
    <div className="game-menu-daily-refresh">
      <span>◷</span>
      <em>刷新时间 {hours}小时{minutes}分</em>
    </div>
  );
}

function getDailyQuestTarget(quest: {
  isUnlimited: boolean;
  maxCompletions: number;
}) {
  if (quest.isUnlimited) return Math.max(1, Number(quest.maxCompletions || 1));
  return Math.max(1, Number(quest.maxCompletions || 1));
}

function getAttributeRewardLabel(attributeName: string, t: TFunction) {
  const attributeKey = normalizeAttributeKey(attributeName);
  if (!attributeKey) return attributeName;
  return t(`gameEsc.attributes.${attributeKey}`, { defaultValue: attributeName });
}

function DailyQuestRewards({
  rewards,
  system,
}: {
  rewards: {
    coins?: number;
    experience?: Array<{ name: string; value: number }>;
    items?: Array<{ itemKey: string; quantity: number }>;
  };
  system: SystemLite;
}) {
  const { t } = useTranslation();
  const hasRewards = Boolean(
    Number(rewards?.coins || 0) > 0
    || (rewards?.experience?.length || 0) > 0
    || (rewards?.items?.length || 0) > 0
  );

  if (!hasRewards) return <span className="game-menu-daily-card__empty-reward">暂无奖励</span>;

  return (
    <div className="game-menu-daily-card__rewards">
      {Number(rewards?.coins || 0) > 0 && (
        <span>
          <img src={goldIcon} alt="金币" />
          +{Number(rewards.coins || 0)}
        </span>
      )}
      {rewards?.experience?.map((exp, index) => {
        const attributeKey = normalizeAttributeKey(exp.name);
        return (
          <span key={`${exp.name}-${index}`}>
            {attributeKey
              ? <AttributePixelIcon attributeKey={attributeKey} className="game-menu-attribute-reward-icon" />
              : <FaGift />}
            {getAttributeRewardLabel(exp.name, t)} +{exp.value}
          </span>
        );
      })}
      {rewards?.items?.map((item, index) => {
        const product = (system.storeProducts || []).find((storeProduct) => storeProduct._id === item.itemKey);
        return (
          <span key={`${item.itemKey}-${index}`}>
            {product?.image ? <img src={product.image} alt={product.name} /> : <FaGift />}
            {product?.name || item.itemKey} x{item.quantity}
          </span>
        );
      })}
    </div>
  );
}

function syncMaskProgressResultToScene(
  result: {
    gameSave?: unknown;
    mask?: unknown;
    maskProgress?: { level: number; progress: number; required: number };
    previousMask?: unknown;
    previousMaskProgress?: { level: number; progress: number; required: number };
    maskConfiguration?: { maskProgressBarDisplay?: boolean };
    previousMaskConfiguration?: { maskProgressBarDisplay?: boolean };
    levelUps?: number;
  } | undefined,
  sceneRef?: React.RefObject<any>,
) {
  if (!result) return;
  if (result.gameSave) sceneRef?.current?.syncEventSaveData?.(result.gameSave);
  const mask = result.mask as { radius?: number } | undefined;
  if (result.maskProgress) {
    gameBus.emit('game:mask_progress_rewarded', {
      previousMaskProgress: result.previousMaskProgress ?? { level: 0, progress: 0, required: 1 },
      maskProgress: result.maskProgress,
      previousMask: result.previousMask as any,
      mask: mask as any,
      previousConfiguration: result.previousMaskConfiguration,
      configuration: result.maskConfiguration,
      levelUps: result.levelUps,
    });
  }
}

function SystemTasksContent({
  system,
  roomId,
  sceneRef,
  onOpenAction,
  onClose,
  profileId,
}: {
  system: SystemLite | null;
  roomId?: string | null;
  sceneRef?: React.RefObject<any>;
  onOpenAction: OpenGameEscAction;
  onClose: () => void;
  profileId?: string | null;
}) {
  const { data, isFetching, refetch } = useGetMemberTaskCenterQuery(
    { systemId: system?._id || '' },
    { skip: !system?._id }
  );
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const [acceptMissionList, { isLoading: isAccepting }] = useAcceptMissionListMutation();
  const [startMemberTask, { isLoading: isStarting }] = useStartMemberTaskMutation();
  const [completeMemberTask, { isLoading: isCompleting }] = useCompleteMemberTaskMutation();
  const [failMemberTask, { isLoading: isCancelling }] = useFailMemberTaskMutation();
  const [restartMemberTask, { isLoading: isRestarting }] = useRestartMemberTaskMutation();

  const missionLists = data?.missionLists || [];
  const taskEntries = useMemo(() => buildMissionTaskEntries(missionLists), [missionLists]);
  const selectedEntry = taskEntries.find((entry) => entry.key === selectedEntryKey) || taskEntries[0] || null;
  const activeTask = (data?.activeTask || null) as TaskCenterActiveTask;
  const selectedMission = selectedEntry?.mission || null;
  const selectedNode = selectedEntry?.node || null;
  const isSelectedActive = Boolean(
    selectedMission && selectedNode
    && (
      selectedNode.isActive
      || (activeTask?.missionListId === selectedMission._id && activeTask.nodeId === selectedNode.nodeId)
    )
  );
  const hasOtherActiveTask = Boolean(
    activeTask
    && (!selectedMission || !selectedNode || activeTask.missionListId !== selectedMission._id || activeTask.nodeId !== selectedNode.nodeId)
  );
  const isBusy = isAccepting || isStarting || isCompleting || isCancelling || isRestarting;
  const canCreateMissionList = system ? canMaintainSystemInGame(system, profileId) : false;

  useEffect(() => {
    if (taskEntries.length === 0) {
      setSelectedEntryKey(null);
      return;
    }
    if (!selectedEntryKey || !taskEntries.some((entry) => entry.key === selectedEntryKey)) {
      setSelectedEntryKey(taskEntries[0].key);
    }
  }, [selectedEntryKey, taskEntries]);

  if (!system) {
    return <EmptyPanel title="没有可用系统" text="先创建或加入系统后，这里会显示系列任务。" action={<SystemSetupButton onOpenAction={onOpenAction} />} />;
  }
  if (isFetching && missionLists.length === 0) return <EmptyPanel title="正在同步任务" text="正在读取系统任务中心。" />;

  if (missionLists.length === 0) {
    return (
      <EmptyPanel
        title="暂无系列任务"
        text="系统发布任务链后，会显示在这里。"
        action={canCreateMissionList ? <CreateMissionListButton onOpenAction={onOpenAction} /> : undefined}
      />
    );
  }

  const handleStartTask = async () => {
    if (!system?._id || !selectedMission || !selectedNode || selectedNode.isLocked || hasOtherActiveTask) return;
    try {
      if (!selectedMission.accepted) {
        await acceptMissionList({ systemId: system._id, missionListId: selectedMission._id }).unwrap();
      }
      await startMemberTask({
        systemId: system._id,
        missionListId: selectedMission._id,
        nodeId: selectedNode.nodeId,
      }).unwrap();
      message.success(`任务已开始：${selectedNode.title}`);
      refetch();
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err?.data?.message || '开始任务失败');
    }
  };

  const handleCompleteTask = async () => {
    if (!system?._id || !selectedMission || !selectedNode) return;
    try {
      const result = await completeMemberTask({
        systemId: system._id,
        missionListId: selectedMission._id,
        nodeId: selectedNode.nodeId,
        roomId,
      }).unwrap();
      if (result?.spawnedChest) {
        gameBus.emit('game:chest_spawned', { chest: result.spawnedChest });
      }
      syncMaskProgressResultToScene(result, sceneRef);
      const hasReward = (result?.rewards?.coins || 0) > 0 || (result?.rewards?.items?.length || 0) > 0;
      message.success(`任务已完成：${selectedNode.title}${hasReward ? '，奖励已发送到游戏内' : ''}`);
      refetch();
      onClose();
    } catch (error) {
      console.warn('[SystemTasks] complete task failed', error);
      const err = error as { data?: { message?: string; error?: string }; error?: string };
      message.error(err?.data?.message || err?.data?.error || err?.error || '完成任务失败');
    }
  };

  const handleCancelTask = async () => {
    if (!system?._id || !selectedMission || !selectedNode) return;
    try {
      await failMemberTask({
        systemId: system._id,
        missionListId: selectedMission._id,
        nodeId: selectedNode.nodeId,
      }).unwrap();
      message.info(`任务已取消：${selectedNode.title}`);
      refetch();
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err?.data?.message || '取消任务失败');
    }
  };

  const handleRestartTask = async () => {
    if (!system?._id || !selectedMission || !selectedNode || hasOtherActiveTask) return;
    try {
      await restartMemberTask({
        systemId: system._id,
        missionListId: selectedMission._id,
        nodeId: selectedNode.nodeId,
      }).unwrap();
      message.success(`已重新开始：${selectedNode.title}`);
      refetch();
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err?.data?.message || '重新开始失败');
    }
  };

  return (
    <div className="game-menu-mission-board">
      <aside className="game-menu-mission-list">
        <div className="game-menu-mission-list__title">
          <FaListUl />
          <div>
            <span>任务</span>
            <strong>全部任务</strong>
          </div>
        </div>
        <div className="game-menu-mission-scroll">
          {taskEntries.length === 0 ? (
            <div className="game-menu-mission-empty">
              <FaCheck />
              <strong>暂无可进行任务</strong>
              <span>已完成任务会自动隐藏。</span>
            </div>
          ) : taskEntries.map((entry, index) => {
            const showGroup = index === 0 || taskEntries[index - 1].group !== entry.group;
            const isSelected = selectedEntry?.key === entry.key;
            const statusClass = getTaskStatusClass(entry.node);
            return (
              <React.Fragment key={entry.key}>
                {showGroup && <div className="game-menu-mission-group">{entry.group}</div>}
                <button
                  type="button"
                  className={`game-menu-mission-row ${isSelected ? 'is-selected' : ''} ${statusClass}`}
                  onClick={() => setSelectedEntryKey(entry.key)}
                >
                  <span className="game-menu-mission-row__rail" />
                  <div>
                    <strong>{entry.node.title}</strong>
                    <span><FaMapMarkerAlt /> {entry.mission.title}</span>
                  </div>
                  <em>{getTaskStatusLabel(entry.mission, entry.node)}</em>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </aside>

      <main className="game-menu-mission-detail">
        {selectedEntry && selectedMission && selectedNode ? (
          <>
            <div className="game-menu-mission-tabs" aria-hidden="true">
              <span className="is-active">!!!</span>
              <span>✧</span>
              <span>☆</span>
              <span>◇</span>
              <span>✦</span>
            </div>
            <div className="game-menu-mission-heading">
              <span><FaMapMarkerAlt /> {system.name}</span>
              <h3>{selectedNode.title}</h3>
              <em>{selectedMission.title}</em>
            </div>
            <div className="game-menu-mission-objective">
              <strong>• {selectedNode.notice || selectedNode.title}</strong>
            </div>
            <p className="game-menu-mission-description">
              {selectedNode.description || selectedNode.content || selectedMission.description || '当前任务还没有更多描述。'}
            </p>

            {selectedNode.isLocked && (
              <div className="game-menu-mission-lock">
                <FaLock />
                <span>
                  前置任务未完成
                  {(selectedNode.blockedByTitles || []).length > 0 ? `：${selectedNode.blockedByTitles?.join('、')}` : ''}
                </span>
              </div>
            )}

            {isSelectedActive && (
              <ActiveMissionTimer
                missionId={selectedMission._id}
                node={selectedNode}
                activeTask={activeTask}
              />
            )}

            <div className="game-menu-mission-spacer" />

            <RewardPreview node={selectedNode} storeProducts={(system.storeProducts || []) as StoreProduct[]} />

            <div className="game-menu-mission-actions">
              {isSelectedActive ? (
                <>
                  <button type="button" disabled={isBusy} onClick={handleCompleteTask}>
                    <FaCheck />
                    完成任务
                  </button>
                  <button type="button" className="is-secondary" disabled={isBusy} onClick={handleCancelTask}>
                    <FaTimes />
                    取消任务
                  </button>
                </>
              ) : selectedNode.failed && selectedNode.canRestart ? (
                <button type="button" disabled={isBusy || hasOtherActiveTask} onClick={handleRestartTask}>
                  <FaRedo />
                  重新开始
                </button>
              ) : selectedNode.isLocked ? (
                <button type="button" disabled>
                  <FaLock />
                  前置未完成
                </button>
              ) : selectedNode.completed ? (
                <button type="button" disabled>
                  <FaCheck />
                  已完成
                </button>
              ) : (
                <button type="button" disabled={isBusy || hasOtherActiveTask} onClick={handleStartTask}>
                  <FaPlay />
                  {hasOtherActiveTask ? '已有任务进行中' : '开始任务'}
                </button>
              )}
            </div>
          </>
        ) : (
          <EmptyPanel
            title={taskEntries.length === 0 ? '暂无可进行任务' : '请选择任务'}
            text={taskEntries.length === 0 ? '已完成任务已隐藏，新的可执行任务会显示在左侧。' : '从左侧选择一个任务节点后，这里会显示详情。'}
          />
        )}
      </main>
    </div>
  );
}

function DailyTasksContent({
  system,
  roomId,
  sceneRef,
  onOpenAction,
  profileId,
}: {
  system: SystemLite | null;
  roomId?: string | null;
  sceneRef?: React.RefObject<any>;
  onOpenAction: OpenGameEscAction;
  profileId?: string | null;
}) {
  const { data, isFetching, refetch } = useGetMemberDailyQuestsQuery(
    { systemId: system?._id || '' },
    { skip: !system?._id }
  );
  const [completeDailyQuest, { isLoading }] = useCompleteDailyQuestMutation();

  if (!system) {
    return <EmptyPanel title="没有可用系统" text="先创建或加入系统后，这里会显示每日任务。" action={<SystemSetupButton onOpenAction={onOpenAction} />} />;
  }
  if (isFetching) return <EmptyPanel title="正在同步每日任务" text="正在读取今日悬赏。" />;

  const quests = data?.quests || [];
  const canAddDailyQuestToSystem = canMaintainSystemInGame(system, profileId);
  const progressTotal = quests.reduce((sum, quest) => sum + getDailyQuestTarget(quest), 0);
  const progressDone = quests.reduce((sum, quest) => {
    const target = getDailyQuestTarget(quest);
    return sum + Math.min(target, Number(quest.completedCount || 0));
  }, 0);
  const progressRatio = progressTotal > 0 ? Math.min(1, progressDone / progressTotal) : 0;
  const activityScore = Math.round(progressRatio * 500);
  const milestones = [0, 100, 200, 300, 400, 500];

  return (
    <div className="game-menu-daily-board">
      <div className="game-menu-daily-tabs" aria-hidden="true">
        <span>◇</span>
        <span className="is-active"><FaCalendarCheck /> 每日实训</span>
        <span>✦</span>
      </div>

      <div className="game-menu-daily-progress">
        <div className="game-menu-daily-progress__badge">
          <FaCalendarCheck />
          <strong>{activityScore}</strong>
        </div>
        <div className="game-menu-daily-progress__track">
          <i style={{ width: `${progressRatio * 100}%` }} />
          {milestones.map((milestone) => (
            <span
              key={milestone}
              className={activityScore >= milestone ? 'is-done' : ''}
              style={{ left: `${(milestone / 500) * 100}%` }}
            >
              <b>{activityScore >= milestone ? '✓' : ''}</b>
              <em>{milestone}</em>
            </span>
          ))}
        </div>
      </div>

      <div className="game-menu-daily-cards" aria-label="每日任务卡牌">
        {quests.length === 0 ? (
          <div className="game-menu-daily-empty-card">
            <FaCalendarCheck />
            <strong>暂无每日任务</strong>
            <span>系统开启每日任务后，会显示在这里。</span>
            {canAddDailyQuestToSystem && (
              <button
                type="button"
                className="game-menu-daily-empty-card__link"
                onClick={() => onOpenAction('system-settings', { systemSettingsInitialPart: 'daily-quests' })}
              >
                <FaPlus /> 添加任务到系统
              </button>
            )}
          </div>
        ) : quests.map((quest) => {
          const target = getDailyQuestTarget(quest);
          const completedCount = Number(quest.completedCount || 0);
          const isFinished = quest.completed && !quest.isUnlimited;
          const progressLabel = `${Math.min(completedCount, target)} / ${target}`;

          return (
            <article className={`game-menu-daily-card ${isFinished ? 'is-finished' : ''}`} key={quest.questId}>
              <div className="game-menu-daily-card__progress">进度 {progressLabel}</div>
              <div className="game-menu-daily-card__paper">
                <h3>{quest.title}</h3>
                <p>{quest.description || '完成今日目标，领取活跃奖励。'}</p>
                <DailyQuestRewards rewards={quest.rewards || {}} system={system} />
              </div>
              <button
                type="button"
                disabled={isLoading || isFinished}
                onClick={async () => {
                  const result = await completeDailyQuest({ systemId: system._id, questId: quest.questId, roomId }).unwrap();
                  syncMaskProgressResultToScene(result, sceneRef);
                  refetch();
                }}
              >
                {isFinished ? '今日已完成' : '完成任务'}
              </button>
            </article>
          );
        })}
      </div>

      <DailyRefreshTimer />
    </div>
  );
}

const settingsPanelStyle: React.CSSProperties = {
  border: '1px solid rgba(238, 221, 173, 0.22)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.065), rgba(255,255,255,0.03)), rgba(8, 11, 18, 0.9)',
  color: 'rgba(255,255,255,0.9)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.045)',
};

const settingsImageStyle: React.CSSProperties = {
  border: '1px solid rgba(238, 221, 173, 0.26)',
  background: 'radial-gradient(circle at 50% 18%, rgba(241,216,144,0.2), transparent 38%), rgba(0,0,0,0.32)',
  color: '#f1d890',
};

const settingsInputStyle: React.CSSProperties = {
  border: '1px solid rgba(238, 221, 173, 0.2)',
  background: 'rgba(0,0,0,0.3)',
  color: 'rgba(255,255,255,0.92)',
};

function SystemSettingsContent({
  systems,
  selectedSystemId,
  initialOwnerToolPart = null,
  profileId = null,
}: {
  systems: SystemLite[];
  selectedSystemId: string | null;
  initialOwnerToolPart?: OwnerPlayerSystemToolPart | null;
  profileId?: string | null;
}) {
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const [searchId, setSearchId] = useState('');
  const [searchResults, setSearchResults] = useState<SystemLite[]>([]);
  const [leavingSystemId, setLeavingSystemId] = useState<string | null>(null);
  const [recentlyLeftSystemIds, setRecentlyLeftSystemIds] = useState<Set<string>>(() => new Set());
  const [triggerSearchSystem, { isFetching: isSearching }] = useLazySearchSystemQuery();
  const [joinSystem, { isLoading: isJoining }] = useJoinSystemMutation();
  const [leaveSystem] = useLeaveSystemMutation();
  const activeSystems = useMemo(
    () => systems.filter((system) => isMemberSystem(system, profileId) && !recentlyLeftSystemIds.has(system._id)),
    [profileId, recentlyLeftSystemIds, systems]
  );
  const selectedSystem = getSelectedSystem(activeSystems, selectedSystemId) ?? activeSystems[0] ?? null;
  const hasActiveSystem = activeSystems.length > 0;
  const canMaintainSelectedSystem = selectedSystem
    ? isOwnedSystem(selectedSystem, profileId) && isMemberSystem(selectedSystem, profileId)
    : false;

  useEffect(() => {
    if (recentlyLeftSystemIds.size === 0) return;
    setRecentlyLeftSystemIds((current) => {
      const next = new Set([...current].filter((systemId) => {
        const system = systems.find((item) => item._id === systemId);
        return system && isMemberSystem(system, profileId);
      }));
      return next.size === current.size ? current : next;
    });
  }, [profileId, recentlyLeftSystemIds.size, systems]);

  const handleSearch = async () => {
    const id = searchId.trim();
    if (!id) {
      message.error(t('gameEsc.systemSettings.enterSystemId'));
      return;
    }

    try {
      const result = await triggerSearchSystem({ systemId: id }).unwrap();
      setSearchResults([result.system]);
      message.success(t('gameEsc.systemSettings.found'));
    } catch (error) {
      const err = error as { data?: { message?: string } };
      setSearchResults([]);
      message.error(err?.data?.message || t('gameEsc.systemSettings.notFound'));
    }
  };

  const handleJoin = async (system: SystemLite) => {
    try {
      await joinSystem({ systemId: system._id }).unwrap();
      setRecentlyLeftSystemIds((current) => {
        const next = new Set(current);
        next.delete(system._id);
        return next;
      });
      dispatch(setSelectedSystemId(system._id));
      setSearchId('');
      setSearchResults([]);
      message.success(t('gameEsc.systemSettings.joined', { name: system.name }));
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err?.data?.message || t('gameEsc.systemSettings.joinFailed'));
    }
  };

  const handleLeave = async (system: SystemLite) => {
    const confirmed = window.confirm(t('gameEsc.systemSettings.confirmLeave', { name: system.name }));
    if (!confirmed) return;

    setLeavingSystemId(system._id);
    try {
      await leaveSystem({ systemId: system._id }).unwrap();
      setRecentlyLeftSystemIds((current) => new Set(current).add(system._id));
      const nextSystem = activeSystems.find((item) => item._id !== system._id) ?? null;
      dispatch(setSelectedSystemId(nextSystem?._id || null));
      if (!nextSystem) clearStoredSelectedSystemId();
      message.success(t('gameEsc.systemSettings.left', { name: system.name }));
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err?.data?.message || t('gameEsc.systemSettings.leaveFailed'));
    } finally {
      setLeavingSystemId(null);
    }
  };

  const handleCopySystemId = async (system: SystemLite) => {
    try {
      await navigator.clipboard.writeText(system._id);
      message.success(t('gameEsc.systemSettings.systemIdCopied'));
    } catch {
      message.error(t('gameEsc.systemSettings.copyFailed'));
    }
  };

  const selectedSystemOverview = selectedSystem ? (
    <>
      <div className="game-menu-settings-detail__hero">
        <div className="game-menu-settings-detail__image" style={settingsImageStyle}>
          {selectedSystem.image ? <img src={selectedSystem.image} alt={selectedSystem.name} /> : <FaGamepad />}
        </div>
        <div>
          <span>{t('gameEsc.systemSettings.currentSystemLabel')}</span>
          <h3>{selectedSystem.name}</h3>
          <p>{selectedSystem.description || t('gameEsc.systemSettings.defaultDescription')}</p>
        </div>
      </div>

      <div
        className="game-menu-settings-detail__id"
        style={{
          border: '1px solid rgba(238, 221, 173, 0.16)',
          background: 'rgba(0,0,0,0.28)',
        }}
      >
        <div>
          <span>{t('gameEsc.systemSettings.systemId')}</span>
          <code>{selectedSystem._id}</code>
        </div>
        <button type="button" onClick={() => handleCopySystemId(selectedSystem)}>
          <FaCopy /> {t('gameEsc.systemSettings.copyShare')}
        </button>
      </div>

      <div className="game-menu-settings-footer-actions">
        <button
          type="button"
          className="game-menu-settings-card__leave"
          disabled={leavingSystemId === selectedSystem._id}
          onClick={() => handleLeave(selectedSystem)}
        >
          {leavingSystemId === selectedSystem._id
            ? t('gameEsc.systemSettings.leaving')
            : t('gameEsc.systemSettings.leaveSystem')}
        </button>
      </div>
    </>
  ) : null;

  return (
    <div
      className={`game-menu-settings-hub ${hasActiveSystem ? 'is-active-system' : 'is-search-only'}`}
      style={{
        background: 'transparent',
        color: 'rgba(255,255,255,0.9)',
      }}
    >
      {selectedSystem ? (
        <section className={`game-menu-settings-detail ${canMaintainSelectedSystem ? 'game-menu-settings-detail--owner-tools' : ''}`}>
          {canMaintainSelectedSystem ? (
            <OwnerPlayerSystemTools
              systemId={selectedSystem._id}
              systemName={selectedSystem.name}
              initialPart={initialOwnerToolPart}
              overview={selectedSystemOverview}
            />
          ) : selectedSystemOverview}
        </section>
      ) : null}

      {!hasActiveSystem && (
        <section className="game-menu-settings-join" style={settingsPanelStyle}>
          <div className="game-menu-settings-join__header">
            <strong>{t('gameEsc.systemSettings.joinTitle')}</strong>
            <p>
              {t('gameEsc.systemSettings.joinDescriptionPrefix')}
              <a href="/dashboard/setting/my?mode=create">{t('gameEsc.systemSettings.createOwnSystem')}</a>
            </p>
          </div>
          <div className="game-menu-settings-search">
            <input
              value={searchId}
              onChange={(event) => setSearchId(event.target.value)}
              placeholder={t('gameEsc.systemSettings.searchPlaceholder')}
              style={settingsInputStyle}
            />
            <button type="button" onClick={handleSearch} disabled={isSearching}>
              {isSearching ? t('gameEsc.systemSettings.searching') : t('gameEsc.systemSettings.search')}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="game-menu-settings-search-results">
              {searchResults.map((system) => {
                const alreadyJoined = activeSystems.some((item) => item._id === system._id);
                return (
                  <article className="game-menu-settings-search-result" style={settingsPanelStyle} key={system._id}>
                    <div className="game-menu-settings-search-result__media" style={settingsImageStyle}>
                      {system.image ? <img src={system.image} alt={system.name} /> : <FaGamepad />}
                    </div>
                    <div className="game-menu-settings-search-result__body">
                      <strong>{system.name}</strong>
                      <p>{system.description || t('gameEsc.systemSettings.defaultDescription')}</p>
                      <code>
                        <span>{t('gameEsc.systemSettings.systemId')}</span>
                        {system._id}
                      </code>
                    </div>
                    <button type="button" onClick={() => handleJoin(system)} disabled={isJoining || alreadyJoined}>
                      {alreadyJoined
                        ? t('gameEsc.systemSettings.alreadyJoined')
                        : isJoining
                          ? t('gameEsc.systemSettings.joining')
                          : t('gameEsc.systemSettings.joinSystem')}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

type ModalContentProps = Omit<GameEscContentModalProps, 'open' | 'onOpenAction'> & {
  onOpenAction: OpenGameEscAction;
  systemSettingsInitialPart?: OwnerPlayerSystemToolPart | null;
};

function ModalContent({
  action,
  profile,
  playerName,
  avatarUrl,
  systems,
  selectedSystemId,
  roomId,
  sceneRef,
  onOpenAction,
  onClose,
  systemSettingsInitialPart = null,
}: ModalContentProps) {
  const profileId = profile?._id ?? null;
  const joinedSystems = useMemo(() => getMemberSystems(systems, profileId), [profileId, systems]);
  const selectedSystem = getSelectedSystem(joinedSystems, selectedSystemId);
  const walletCoins = Number(profile?.wallet?.coins || 0);

  if (action === 'profile-panel') {
    return <PlayerProfilePanel profile={profile} playerName={playerName} avatarUrl={avatarUrl} />;
  }
  if (action === 'system-store') {
    return <SystemStoreContent system={selectedSystem} walletCoins={walletCoins} onOpenAction={onOpenAction} />;
  }
  if (action === 'system-tasks') {
    return (
      <SystemTasksContent
        system={selectedSystem}
        roomId={roomId}
        sceneRef={sceneRef}
        onOpenAction={onOpenAction}
        onClose={onClose}
        profileId={profileId}
      />
    );
  }
  if (action === 'daily-tasks') {
    return (
      <DailyTasksContent
        system={selectedSystem}
        roomId={roomId}
        sceneRef={sceneRef}
        onOpenAction={onOpenAction}
        profileId={profileId}
      />
    );
  }
  if (action === 'memory-album') {
    const worldId = sceneRef?.current?.currentMapDefinition?.ref?.worldId
      ?? sceneRef?.current?.getGameState?.()?.player?.position?.worldId
      ?? 'world:main';
    return <MemoryAlbumModal roomId={roomId} worldId={worldId} />;
  }
  if (action === 'lottery') {
    if (!selectedSystem) {
      return <EmptyPanel title="没有可用系统" text="先创建或加入系统后，这里会显示祈愿卡池。" action={<SystemSetupButton onOpenAction={onOpenAction} />} />;
    }
    return <SystemLottery embedded systemIdOverride={selectedSystem._id} />;
  }
  if (action === 'system-settings') {
    return (
      <SystemSettingsContent
        systems={systems}
        selectedSystemId={selectedSystemId}
        initialOwnerToolPart={systemSettingsInitialPart}
        profileId={profileId}
      />
    );
  }
  if (action === 'npc-data') return <NPCData />;
  return null;
}

export function GameEscContentModal({
  open,
  action,
  profile,
  playerName,
  avatarUrl,
  systems,
  selectedSystemId,
  roomId,
  sceneRef,
  onClose,
  onOpenAction,
}: GameEscContentModalProps) {
  const { t } = useTranslation();
  const [systemSettingsInitialPart, setSystemSettingsInitialPart] = useState<OwnerPlayerSystemToolPart | null>(null);
  const title = action ? t(modalTitleKeys[action] ?? '', { defaultValue: modalTitles[action] ?? '' }) : '';
  const modalClassName = [
    'game-menu-modal',
    action === 'lottery' ? 'game-menu-modal--lottery' : '',
    action === 'profile-panel' ? 'game-menu-modal--profile' : '',
    action === 'system-store' ? 'game-menu-modal--system-store' : '',
    action === 'system-tasks' ? 'game-menu-modal--system-tasks' : '',
    action === 'daily-tasks' ? 'game-menu-modal--daily-tasks' : '',
    action === 'system-settings' ? 'game-menu-modal--system-settings' : '',
    action === 'npc-data' ? 'game-menu-modal--npc-data' : '',
    action === 'memory-album' ? 'game-menu-modal--memory-album' : '',
  ].filter(Boolean).join(' ');
  const handleOpenAction: OpenGameEscAction = (nextAction, options) => {
    setSystemSettingsInitialPart(
      nextAction === 'system-settings' ? options?.systemSettingsInitialPart ?? null : null,
    );
    onOpenAction(nextAction);
  };

  useEffect(() => {
    if (action !== 'system-settings') setSystemSettingsInitialPart(null);
  }, [action]);

  return (
    <AnimatePresence>
      {open && action && (
        <motion.div
          className="game-menu-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            className={modalClassName}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
          >
            <header className="game-menu-modal__header">
              <div>
                <span>{t('gameEsc.modal.accessLabel')}</span>
                <h2>{title}</h2>
              </div>
              <button type="button" onClick={onClose} aria-label="关闭">
                <FaTimes />
              </button>
            </header>
            <div className="game-menu-modal__body">
              <ModalContent
                action={action}
                profile={profile}
                playerName={playerName}
                avatarUrl={avatarUrl}
                systems={systems}
                selectedSystemId={selectedSystemId}
                roomId={roomId}
                sceneRef={sceneRef}
                onClose={onClose}
                onOpenAction={handleOpenAction}
                systemSettingsInitialPart={systemSettingsInitialPart}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function GameEscMenu({
  open,
  playerName,
  avatarUrl,
  walletCoins,
  systems,
  selectedSystemId,
  activeTasks,
  onClose,
  onAction,
}: GameEscMenuProps) {
  const { t } = useTranslation();
  const joinedSystems = useMemo(() => getMemberSystems(systems), [systems]);
  const selectedSystem = useMemo(() => getSelectedSystem(joinedSystems, selectedSystemId), [selectedSystemId, joinedSystems]);
  const containerRef = useRef<HTMLElement>(null);
  const { height } = useDimensions(containerRef);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="game-esc-menu-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.aside
            ref={containerRef}
            className="game-esc-menu-panel"
            initial="closed"
            animate="open"
            exit="closed"
            custom={height}
            variants={drawerShellVariants}
          >
            <motion.div
              className="game-esc-menu-panel__background"
              custom={height}
              variants={drawerBackgroundVariants}
            />
            <motion.div className="game-esc-menu-panel__content" variants={drawerContentVariants}>
              <motion.header className="game-esc-menu-profile" variants={drawerItemVariants}>
                <div className="game-esc-menu-profile__avatar">
                  {avatarUrl ? <img src={avatarUrl} alt={playerName} /> : <FaUser />}
                </div>
                <div className="game-esc-menu-profile__text">
                  <strong>{playerName || '玩家'}</strong>
                  <span>{selectedSystem?.name || '未选择系统'}</span>
                </div>
                <button type="button" className="game-esc-menu-close" onClick={onClose} aria-label="关闭菜单">
                  <FaTimes />
                </button>
              </motion.header>

              <motion.div className="game-esc-menu-progress" variants={drawerItemVariants}>
                <div>
                  <span>金币</span>
                  <strong>{walletCoins.toLocaleString()}</strong>
                </div>
                <div>
                  <span>系统</span>
                  <strong>{joinedSystems.length}</strong>
                </div>
              </motion.div>

              <motion.div className="game-esc-menu-current" variants={drawerItemVariants}>
                <div className="game-esc-menu-section-title">
                  <span>正在进行的系统任务</span>
                  <em>{activeTasks.length}</em>
                </div>
                <CurrentTaskList activeTasks={activeTasks} />
              </motion.div>

              <motion.nav className="game-esc-menu-grid" aria-label="游戏菜单" variants={drawerContentVariants}>
                {menuItems.map((item) => (
                  <motion.button
                    key={item.action}
                    type="button"
                    onClick={() => onAction(item.action)}
                    className="game-esc-menu-tile"
                    style={{ '--tile-accent': item.accent } as React.CSSProperties}
                    variants={drawerItemVariants}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="game-esc-menu-tile__icon">{item.icon}</span>
                    <span>{t(menuLabelKeys[item.action] ?? '', { defaultValue: item.label })}</span>
                  </motion.button>
                ))}
              </motion.nav>

              <motion.footer className="game-esc-menu-footer" variants={drawerItemVariants}>
                <span>ESC</span>
                <em>关闭菜单</em>
                <time>{activeTasks[0] ? formatStartedAt(activeTasks[0].startedAt) : '无进行中任务'}</time>
              </motion.footer>
            </motion.div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default GameEscMenu;
