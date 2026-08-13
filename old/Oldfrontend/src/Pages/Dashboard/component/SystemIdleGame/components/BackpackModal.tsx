import React, { useCallback, useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import { AnimatePresence, motion } from 'framer-motion';
import { FaBox, FaDice, FaFlask, FaScroll, FaSeedling } from 'react-icons/fa';
import { useDispatch, useSelector } from 'react-redux';
import { getRarityLabel } from '@timeplan-game/core/economy/rarity';
import { getRarityColor } from '@timeplan-game/core/economy/coinRules';
import { useLazyGetProfileStateQuery, useUseInventoryItemMutation } from '../../../../../api/profileStateRtkApi';
import { InventoryItem, setInventory } from '../../../../../Redux/Features/profileStateSlice';
import { moveSlot, type SlotItem, type SlotZone } from '../../../../../Redux/Features/gameSlice';
import type { RootState } from '../../../../../Redux/store';
import { getGameItemDefinition, type GameItemDefinition } from '../shared/gameItems';
import { inventoryTabs } from '../../../constants';
import { ItemIcon } from '../visuals';
import { chestClosedUrl, inventoryUiUrl, lootUrl } from '../../../../../assets';

const RARITY_SHADOW: Record<string, string> = {
  common: 'none',
  uncommon: '0 0 0 2px rgba(47,155,79,0.22), 0 0 12px rgba(47,155,79,0.22)',
  rare: '0 0 0 2px rgba(61,117,194,0.25), 0 0 14px rgba(61,117,194,0.22)',
  epic: '0 0 0 2px rgba(142,79,199,0.25), 0 0 14px rgba(142,79,199,0.24)',
  legendary: '0 0 0 2px rgba(214,139,36,0.32), 0 0 16px rgba(214,139,36,0.3)',
  mythic: '0 0 0 2px rgba(207,79,139,0.32), 0 0 16px rgba(207,79,139,0.32)',
};

function getInventoryRarityColor(rarity: string | undefined | null, fallback = '#9a7b5f'): string {
  return rarity ? getRarityColor(rarity, fallback) : fallback;
}

const GAME_TYPE_LABEL: Record<string, string> = {
  consumable: '消耗品',
  tool: '工具',
  seed: '种子',
  crop: '作物',
  material: '材料',
  house_blueprint: '建筑蓝图',
  key: '钥匙',
  storage: '收纳',
  pet: '宠物',
};

const ACTION_LABEL: Record<string, string> = {
  eat: '食用',
  plant: '种植',
  harvest: '收获',
  water: '浇水',
  till: '开垦',
  lay_egg: '产蛋',
  collect: '收集',
  chop: '砍伐',
  feed: '喂食',
  place_storage_chest: '放置储物箱',
  place_pet: '放置宠物',
  place_fence: '放置栅栏',
  place_path: '铺设小路',
  place_building: '放置建筑',
};

const PANEL_STYLE: React.CSSProperties = {
  width: 'min(1120px, calc(100vw - 28px))',
  height: 'min(86vh, 820px)',
  border: '4px solid #5b351f',
  borderRadius: 8,
  background:
    'linear-gradient(180deg, rgba(255,236,176,0.97), rgba(226,174,105,0.98)), repeating-linear-gradient(0deg, rgba(91,53,31,0.08) 0 2px, transparent 2px 8px)',
  boxShadow:
    '0 0 0 3px #23150e, 0 0 0 7px #d79648, 0 18px 0 rgba(28,14,8,0.55), 0 32px 70px rgba(0,0,0,0.58)',
  color: '#2f1b10',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  position: 'relative',
  fontFamily: '"Courier New", "Microsoft YaHei", monospace',
  imageRendering: 'pixelated',
};

const SECTION_STYLE: React.CSSProperties = {
  border: '3px solid #6a3e24',
  borderRadius: 6,
  background:
    'linear-gradient(180deg, rgba(255,245,205,0.9), rgba(216,153,82,0.28)), repeating-linear-gradient(90deg, rgba(96,55,30,0.08) 0 2px, transparent 2px 12px)',
  boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.45), inset 0 -6px 0 rgba(103,56,29,0.12)',
};

function getItemLabel(itemId: string): string {
  const def = getGameItemDefinition(itemId);
  return def?.nameZh || def?.name || itemId;
}

const SlotItemIcon: React.FC<{ item: SlotItem; size?: number }> = ({ item, size = 36 }) => {
  return <ItemIcon itemId={item.itemId} size={size} alt={getItemLabel(item.itemId)} />;
};

const SlotContent: React.FC<{ item: SlotItem; iconSize?: number; showName?: boolean }> = ({
  item,
  iconSize = 34,
  showName = false,
}) => (
  <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', position: 'relative' }}>
    <SlotItemIcon item={item} size={iconSize} />
    {showName && (
      <span
        style={{
          position: 'absolute',
          left: 3,
          bottom: 2,
          maxWidth: 'calc(100% - 18px)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 8,
          color: 'rgba(255,246,198,0.72)',
          textShadow: '0 1px 0 #1d100a',
        }}
      >
        {getItemLabel(item.itemId)}
      </span>
    )}
    {item.quantity > 1 && (
      <strong
        style={{
          position: 'absolute',
          right: 4,
          bottom: 2,
          minWidth: 14,
          padding: '1px 3px',
          border: '1px solid #3a2115',
          background: '#f4cc68',
          color: '#2d160d',
          fontSize: 10,
          lineHeight: 1,
          textAlign: 'center',
          boxShadow: '0 1px 0 #000',
        }}
      >
        {item.quantity}
      </strong>
    )}
  </div>
);

function getIconForType(type: string) {
  switch (type) {
    case 'mission':
      return <FaScroll />;
    case 'lottery_chance':
      return <FaDice />;
    case 'consumable':
      return <FaFlask />;
    case 'seed':
    case 'crop':
      return <FaSeedling />;
    case 'item':
    default:
      return <FaBox />;
  }
}

const ItemThumbnail: React.FC<{ item: InventoryItem; large?: boolean }> = ({ item, large = false }) => {
  const imgUrl = item.metadata?.image as string | undefined;
  const size = large ? 88 : 32;
  if (imgUrl) {
    return (
      <img
        src={imgUrl}
        alt={item.name}
        width={size}
        height={size}
        style={{ imageRendering: 'pixelated', objectFit: 'contain', filter: 'drop-shadow(0 3px 0 rgba(52,29,16,0.35))' }}
      />
    );
  }

  return (
    <span
      style={{
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center',
        color: '#5d3822',
        fontSize: large ? 54 : 22,
      }}
    >
      {getIconForType(item.type)}
    </span>
  );
};

interface DragRef {
  zone: SlotZone;
  index: number;
}

interface SelectedGameSlot extends DragRef {
  item: SlotItem;
}

interface PixelSlotProps {
  item: SlotItem | null;
  index: number;
  zone: SlotZone;
  dragOver: DragRef | null;
  selected?: boolean;
  onSelect?: (zone: SlotZone, index: number, item: SlotItem) => void;
  onDragStart: (zone: SlotZone, index: number, item: SlotItem | null) => void;
  onDragEnd: () => void;
  onDragOver: (zone: SlotZone, index: number) => void;
  onDrop: (zone: SlotZone, index: number) => void;
  compact?: boolean;
}

const PixelSlot: React.FC<PixelSlotProps> = ({
  item,
  index,
  zone,
  dragOver,
  selected = false,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  compact = false,
}) => {
  const isOver = dragOver?.zone === zone && dragOver.index === index;
  return (
    <div
      draggable={!!item}
      onClick={() => item && onSelect?.(zone, index, item)}
      onDragStart={() => onDragStart(zone, index, item)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver(zone, index);
      }}
      onDrop={() => onDrop(zone, index)}
      title={item ? `${getItemLabel(item.itemId)} x${item.quantity}` : `${zone === 'hotbar' ? '快捷栏' : '背包'} ${index + 1}`}
      style={{
        aspectRatio: '1 / 1',
        minHeight: compact ? 48 : 56,
        border: selected || isOver ? '3px solid #ffe27a' : '3px solid #5a3722',
        borderRadius: 4,
        background: selected
          ? 'linear-gradient(180deg, #a96a34, #4a2c1b)'
          : item
          ? 'linear-gradient(180deg, #6a432a, #332116)'
          : 'linear-gradient(180deg, #8a6039, #58371f)',
        boxShadow: selected
          ? '0 0 0 2px #2a150c, 0 0 20px rgba(255,226,122,0.92), inset 0 0 0 2px rgba(255,255,255,0.24)'
          : isOver
          ? '0 0 0 2px #2a150c, 0 0 18px rgba(255,226,122,0.8), inset 0 0 0 2px rgba(255,255,255,0.18)'
          : 'inset 0 0 0 2px rgba(255,232,163,0.2), inset 0 -7px 0 rgba(0,0,0,0.2), 0 3px 0 #28160d',
        display: 'grid',
        placeItems: 'center',
        position: 'relative',
        cursor: item ? 'pointer' : 'default',
        transition: 'transform 80ms ease, border-color 80ms ease, box-shadow 80ms ease',
        transform: selected || isOver ? 'translateY(-2px)' : undefined,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 5,
          border: '1px solid rgba(255,232,163,0.12)',
          pointerEvents: 'none',
        }}
      />
      {item && <SlotContent item={item} iconSize={compact ? 30 : 36} showName={!compact} />}
      <span
        style={{
          position: 'absolute',
          top: 2,
          right: 4,
          color: item ? '#f7d46b' : 'rgba(47,27,16,0.45)',
          fontSize: 9,
          fontWeight: 900,
          textShadow: item ? '0 1px 0 #000' : undefined,
        }}
      >
        {zone === 'hotbar' && index === 9 ? '0' : index + 1}
      </span>
    </div>
  );
};

interface ProfileSlotProps {
  item?: InventoryItem;
  selected: boolean;
  onSelect: (item: InventoryItem) => void;
}

const ProfileSlot: React.FC<ProfileSlotProps> = ({ item, selected, onSelect }) => {
  const rarity = item?.metadata?.rarity as string | undefined;
  const color = getInventoryRarityColor(rarity, '#5a3722');
  return (
    <button
      type="button"
      disabled={!item}
      onClick={() => item && onSelect(item)}
      style={{
        aspectRatio: '1 / 1',
        minHeight: 56,
        border: item ? `3px solid ${selected ? '#ffe27a' : color}` : '3px solid #6b472b',
        borderRadius: 4,
        background: item
          ? 'linear-gradient(180deg, #f2d796, #bd7a40)'
          : 'linear-gradient(180deg, rgba(122,82,47,0.58), rgba(73,43,25,0.72))',
        boxShadow: selected
          ? '0 0 0 2px #2a150c, 0 0 18px rgba(255,226,122,0.75)'
          : 'inset 0 0 0 2px rgba(255,255,255,0.22), inset 0 -7px 0 rgba(83,45,24,0.18), 0 3px 0 #351f13',
        display: 'grid',
        placeItems: 'center',
        position: 'relative',
        padding: 0,
        cursor: item ? 'pointer' : 'default',
        overflow: 'hidden',
      }}
    >
      {item && (
        <>
          <ItemThumbnail item={item} />
          <strong
            style={{
              position: 'absolute',
              right: 4,
              bottom: 2,
              padding: '1px 4px',
              border: '1px solid #3a2115',
              background: '#fff0a6',
              color: '#2d160d',
              fontSize: 10,
              lineHeight: 1,
            }}
          >
            {item.quantity}
          </strong>
        </>
      )}
    </button>
  );
};

interface BackpackPanelProps {
  onClose: () => void;
}

const BackpackPanel: React.FC<BackpackPanelProps> = ({ onClose }) => {
  const dispatch = useDispatch();
  const inventory = useSelector((state: RootState) => state.profileState.inventory);
  const backpackSlots = useSelector((state: RootState) => state.game.backpackSlots);
  const hotbarSlots = useSelector((state: RootState) => state.game.hotbarSlots);
  const [useInventoryItem] = useUseInventoryItemMutation();

  const [activeTab, setActiveTab] = useState('game');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedGameSlot, setSelectedGameSlot] = useState<SelectedGameSlot | null>(null);
  const dragFromRef = useRef<DragRef | null>(null);
  const [dragOver, setDragOver] = useState<DragRef | null>(null);

  const isGameTab = activeTab === 'game';
  const filteredInventory = isGameTab
    ? []
    : inventory.filter((item) => (activeTab === 'all' ? true : item.type === activeTab));
  const totalSlots = Math.max(40, Math.ceil(filteredInventory.length / 10) * 10);
  const profileSlots = Array.from({ length: totalSlots }, (_, index) => filteredInventory[index]);
  const selectedGameDef: GameItemDefinition | null = selectedGameSlot
    ? getGameItemDefinition(selectedGameSlot.item.itemId)
    : null;
  const selectedRarity = selectedItem
    ? (selectedItem.metadata?.rarity as string | undefined)
    : selectedGameDef?.rarity;
  const hasSelection = !!selectedItem || !!selectedGameSlot;
  const detailKey = selectedItem?.inventoryKey ?? (selectedGameSlot ? `${selectedGameSlot.zone}-${selectedGameSlot.index}-${selectedGameSlot.item.itemId}` : 'empty');
  const detailName = selectedItem?.name ?? (selectedGameSlot ? getItemLabel(selectedGameSlot.item.itemId) : '');
  const detailQuantity = selectedItem?.quantity ?? selectedGameSlot?.item.quantity ?? 0;
  const detailTypeLabel = selectedItem
    ? inventoryTabs.find((tab) => tab.id === selectedItem.type)?.label || selectedItem.type
    : selectedGameDef
      ? GAME_TYPE_LABEL[selectedGameDef.type] ?? selectedGameDef.type
      : '';
  const detailDescription = selectedItem
    ? (selectedItem.metadata?.description as string | undefined) || '还没有记录说明。'
    : selectedGameDef?.description || '还没有记录说明。';
  const selectedGameActions = selectedGameDef?.capabilities.map((capability) => ACTION_LABEL[capability.action] ?? capability.action) ?? [];
  const selectedProfileIsGameCategory = (selectedItem?.metadata as Record<string, unknown> | undefined)?.category === 'game';

  const handleDragStart = useCallback((zone: SlotZone, index: number, item: SlotItem | null) => {
    if (!item) return;
    dragFromRef.current = { zone, index };
  }, []);

  const handleSelectGameSlot = useCallback((zone: SlotZone, index: number, item: SlotItem) => {
    setSelectedGameSlot({ zone, index, item });
    setSelectedItem(null);
  }, []);

  const handleSelectProfileItem = useCallback((item: InventoryItem) => {
    setSelectedItem(item);
    setSelectedGameSlot(null);
  }, []);

  const handleDrop = useCallback((toZone: SlotZone, toIndex: number) => {
    const from = dragFromRef.current;
    if (!from) return;
    dispatch(moveSlot({ from: { zone: from.zone, index: from.index }, to: { zone: toZone, index: toIndex } }));
    dragFromRef.current = null;
    setDragOver(null);
    setSelectedGameSlot(null);
  }, [dispatch]);

  const handleDragEnd = useCallback(() => {
    dragFromRef.current = null;
    setDragOver(null);
  }, []);

  const handleUseItem = async (item: InventoryItem) => {
    const previousInventory = inventory;
    const nextInventory = inventory
      .map((entry) => (
        entry.inventoryKey === item.inventoryKey
          ? { ...entry, quantity: entry.quantity - 1 }
          : entry
      ))
      .filter((entry) => entry.quantity > 0);

    dispatch(setInventory(nextInventory));
    setSelectedItem(item.quantity <= 1 ? null : { ...item, quantity: item.quantity - 1 });

    try {
      await useInventoryItem({ inventoryKey: item.inventoryKey, quantity: 1 }).unwrap();
      message.success(`使用了 ${item.name}`);
    } catch (error: any) {
      dispatch(setInventory(previousInventory));
      setSelectedItem(item);
      message.error(error?.data?.message || '使用失败');
    }
  };

  const tabCount = isGameTab ? backpackSlots.filter(Boolean).length : filteredInventory.length;

  return (
    <section style={PANEL_STYLE}>
      <header
        style={{
          borderBottom: '4px solid #5b351f',
          background: 'linear-gradient(180deg, #7a4626, #4d2b1a)',
          color: '#ffe7a6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          padding: '14px 18px',
          boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.22)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <img src={chestClosedUrl} alt="" width={42} height={42} style={{ imageRendering: 'pixelated' }} />
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1, letterSpacing: 0, color: '#fff0a6', textShadow: '0 3px 0 #28160d' }}>
              冒险背包
            </h2>
            <p style={{ margin: '6px 0 0', color: '#d9b16a', fontSize: 12, letterSpacing: 0 }}>
              {isGameTab ? `游戏物品 ${tabCount}/${backpackSlots.length}` : `现实物品 ${tabCount}`}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src={inventoryUiUrl}
            alt=""
            width={68}
            height={68}
            style={{ imageRendering: 'pixelated', border: '2px solid #2d190f', background: '#2d190f' }}
            className="hidden sm:block"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭背包"
            style={{
              width: 40,
              height: 36,
              border: '3px solid #27150d',
              borderRadius: 4,
              background: 'linear-gradient(180deg, #f0c86b, #b96b32)',
              color: '#32190e',
              fontWeight: 900,
              cursor: 'pointer',
              boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.36), 0 3px 0 rgba(0,0,0,0.35)',
            }}
          >
            X
          </button>
        </div>
      </header>

      <div
        style={{
          gap: 14,
          padding: 14,
          minHeight: 0,
          flex: 1,
        }}
        className="grid grid-cols-[minmax(0,1fr)_minmax(270px,330px)] max-lg:grid-cols-1"
      >
        <div style={{ ...SECTION_STYLE, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto auto', minHeight: 0 }}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: 10,
              borderBottom: '3px solid #6a3e24',
              overflowX: 'auto',
            }}
          >
            {inventoryTabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelectedItem(null);
                    setSelectedGameSlot(null);
                  }}
                  style={{
                    border: '3px solid #4a2b1a',
                    borderRadius: 4,
                    background: active ? 'linear-gradient(180deg, #ffe27a, #d1843e)' : 'linear-gradient(180deg, #8a5630, #51301d)',
                    color: active ? '#2d160d' : '#ffe9a9',
                    padding: '8px 10px',
                    minWidth: 82,
                    fontWeight: 900,
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    boxShadow: active
                      ? 'inset 0 2px 0 rgba(255,255,255,0.35), 0 3px 0 #3a2115'
                      : 'inset 0 2px 0 rgba(255,255,255,0.12), 0 3px 0 #2d190f',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div style={{ overflow: 'auto', padding: 12 }}>
            {isGameTab ? (
              <div className="grid grid-cols-5 sm:grid-cols-8 xl:grid-cols-10 gap-2">
                {backpackSlots.map((slot, index) => (
                  <PixelSlot
                    key={index}
                    item={slot}
                    index={index}
                    zone="backpack"
                    dragOver={dragOver}
                    selected={selectedGameSlot?.zone === 'backpack' && selectedGameSlot.index === index}
                    onSelect={handleSelectGameSlot}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={(zone, slotIndex) => setDragOver({ zone, index: slotIndex })}
                    onDrop={handleDrop}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-5 sm:grid-cols-8 xl:grid-cols-10 gap-2">
                {profileSlots.map((item, index) => (
                  <ProfileSlot
                    key={item?.inventoryKey ?? index}
                    item={item}
                    selected={!!item && selectedItem?.inventoryKey === item.inventoryKey}
                    onSelect={handleSelectProfileItem}
                  />
                ))}
              </div>
            )}
          </div>

          {hasSelection && (
            <motion.div
              key={`inline-detail-${detailKey}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:hidden"
              style={{
                borderTop: '3px solid #6a3e24',
                background: 'linear-gradient(180deg, rgba(255,240,183,0.82), rgba(190,117,58,0.36))',
                padding: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    display: 'grid',
                    placeItems: 'center',
                    border: `3px solid ${getInventoryRarityColor(selectedRarity, '#6a3e24')}`,
                    background: 'linear-gradient(180deg, #fff0b7, #c47b3d)',
                    boxShadow: selectedRarity ? RARITY_SHADOW[selectedRarity] : 'inset 0 0 0 2px rgba(255,255,255,0.22)',
                    flexShrink: 0,
                  }}
                >
                  {selectedGameSlot ? (
                    <SlotItemIcon item={selectedGameSlot.item} size={30} />
                  ) : selectedItem ? (
                    <ItemThumbnail item={selectedItem} />
                  ) : null}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <strong
                      style={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: '#3f2315',
                      }}
                    >
                      {detailName}
                    </strong>
                    <span style={{ color: '#6c4327', fontSize: 11, flexShrink: 0 }}>x{detailQuantity}</span>
                  </div>
                  <p
                    style={{
                      margin: '4px 0 0',
                      color: '#6c4327',
                      fontSize: 11,
                      lineHeight: 1.45,
                      maxHeight: 34,
                      overflow: 'hidden',
                    }}
                  >
                    {detailDescription}
                  </p>
                </div>
                {selectedItem && !selectedProfileIsGameCategory && (
                  <button
                    type="button"
                    onClick={() => handleUseItem(selectedItem)}
                    style={{
                      border: '3px solid #2d190f',
                      borderRadius: 4,
                      background: 'linear-gradient(180deg, #ffe27a, #c57332)',
                      color: '#2d160d',
                      padding: '8px 12px',
                      fontWeight: 900,
                      flexShrink: 0,
                    }}
                  >
                    使用
                  </button>
                )}
              </div>
            </motion.div>
          )}

          <div
            style={{
              borderTop: '3px solid #6a3e24',
              padding: 10,
              background: 'linear-gradient(180deg, rgba(92,52,29,0.18), rgba(92,52,29,0.28))',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <img src={lootUrl} alt="" width={24} height={24} style={{ imageRendering: 'pixelated' }} />
              <strong style={{ color: '#5a301b', fontSize: 13 }}>快捷栏 1-0</strong>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
              {hotbarSlots.map((slot, index) => (
                <PixelSlot
                  key={index}
                  item={slot}
                  index={index}
                  zone="hotbar"
                  dragOver={dragOver}
                  selected={selectedGameSlot?.zone === 'hotbar' && selectedGameSlot.index === index}
                  onSelect={handleSelectGameSlot}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOver={(zone, slotIndex) => setDragOver({ zone, index: slotIndex })}
                  onDrop={handleDrop}
                  compact
                />
              ))}
            </div>
          </div>
        </div>

        <aside style={{ ...SECTION_STYLE, minHeight: 0, overflow: 'hidden' }} className="max-lg:hidden">
          <AnimatePresence mode="wait">
            {hasSelection ? (
              <motion.div
                key={detailKey}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                style={{
                  height: '100%',
                  display: 'grid',
                  gridTemplateRows: 'auto minmax(0, 1fr) auto',
                  padding: 16,
                  gap: 14,
                }}
              >
                <div
                  style={{
                    border: `3px solid ${getInventoryRarityColor(selectedRarity, '#6a3e24')}`,
                    borderRadius: 6,
                    background: 'linear-gradient(180deg, #fff0b7, #d5924f)',
                    minHeight: 170,
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: selectedRarity ? RARITY_SHADOW[selectedRarity] : undefined,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 10,
                      border: '2px dashed rgba(83,45,24,0.28)',
                      pointerEvents: 'none',
                    }}
                  />
                  <motion.div
                    animate={{ y: [-3, 3, -3] }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                  >
                    {selectedGameSlot ? (
                      <SlotItemIcon item={selectedGameSlot.item} size={92} />
                    ) : selectedItem ? (
                      <ItemThumbnail item={selectedItem} large />
                    ) : null}
                  </motion.div>
                </div>

                <div style={{ overflow: 'auto', paddingRight: 4 }}>
                  <h3 style={{ margin: '0 0 8px', color: '#4a2818', fontSize: 20, letterSpacing: 0 }}>
                    {detailName}
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    <span style={{ border: '2px solid #6a3e24', background: '#f6d98a', padding: '4px 8px', fontSize: 12 }}>
                      {detailTypeLabel}
                    </span>
                    <span style={{ border: '2px solid #6a3e24', background: '#f6d98a', padding: '4px 8px', fontSize: 12 }}>
                      数量 {detailQuantity}
                    </span>
                    {selectedGameDef && (
                      <span style={{ border: '2px solid #6a3e24', background: '#f6d98a', padding: '4px 8px', fontSize: 12 }}>
                        堆叠 {selectedGameDef.stackable ? `${detailQuantity}/${selectedGameDef.maxStack}` : '不可堆叠'}
                      </span>
                    )}
                    {selectedRarity && (
                      <span
                        style={{
                          border: '2px solid #6a3e24',
                          background: getInventoryRarityColor(selectedRarity, '#9a7b5f'),
                          color: '#fff2be',
                          padding: '4px 8px',
                          fontSize: 12,
                          textShadow: '0 1px 0 #000',
                        }}
                      >
                        {getRarityLabel(selectedRarity)}
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      margin: 0,
                      border: '3px solid #6a3e24',
                      background: 'rgba(255,239,183,0.72)',
                      padding: 12,
                      color: '#4f2d1a',
                      fontSize: 13,
                      lineHeight: 1.7,
                    }}
                  >
                    {detailDescription}
                  </p>
                  {selectedGameDef && (selectedGameActions.length > 0 || selectedGameDef.tags.length > 0) && (
                    <div
                      style={{
                        marginTop: 10,
                        border: '3px solid #6a3e24',
                        background: 'rgba(97,58,32,0.16)',
                        padding: 10,
                        color: '#4f2d1a',
                        fontSize: 12,
                        lineHeight: 1.7,
                      }}
                    >
                      {selectedGameActions.length > 0 && (
                        <div>
                          <strong>可用动作：</strong>{selectedGameActions.join('、')}
                        </div>
                      )}
                      {selectedGameDef.tags.length > 0 && (
                        <div>
                          <strong>标签：</strong>{selectedGameDef.tags.join('、')}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {selectedGameSlot || selectedProfileIsGameCategory ? (
                  <div
                    style={{
                      border: '3px solid #6a3e24',
                      background: '#7a4a2a',
                      color: '#f6d98a',
                      padding: 12,
                      textAlign: 'center',
                      fontWeight: 900,
                    }}
                  >
                    游戏物品请在世界里使用
                  </div>
                ) : selectedItem ? (
                  <button
                    type="button"
                    onClick={() => handleUseItem(selectedItem)}
                    style={{
                      border: '3px solid #2d190f',
                      borderRadius: 4,
                      background: 'linear-gradient(180deg, #ffe27a, #c57332)',
                      color: '#2d160d',
                      padding: '13px 12px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.34), 0 4px 0 rgba(0,0,0,0.36)',
                    }}
                  >
                    使用物品
                  </button>
                ) : null}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  height: '100%',
                  display: 'grid',
                  placeItems: 'center',
                  padding: 24,
                  textAlign: 'center',
                  color: '#7a4a2a',
                }}
              >
                <div>
                  <img src={lootUrl} alt="" width={82} height={82} style={{ imageRendering: 'pixelated', margin: '0 auto 14px' }} />
                  <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>未选择物品</h3>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                    点选左侧格子里的物品，可以查看说明、稀有度和可用动作。
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </section>
  );
};

interface BackpackModalProps {
  open: boolean;
  onClose: () => void;
}

export const BackpackModal: React.FC<BackpackModalProps> = ({ open, onClose }) => {
  const [fetchProfileState] = useLazyGetProfileStateQuery();

  useEffect(() => {
    if (!open) return;
    fetchProfileState();
  }, [fetchProfileState, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="背包"
      onMouseDown={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 360,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 50% 38%, rgba(255,210,112,0.16), transparent 38%), rgba(13, 8, 5, 0.66)',
        padding: 16,
      }}
    >
      <div onMouseDown={(event) => event.stopPropagation()}>
        <BackpackPanel onClose={onClose} />
      </div>
    </div>
  );
};

export default BackpackModal;
