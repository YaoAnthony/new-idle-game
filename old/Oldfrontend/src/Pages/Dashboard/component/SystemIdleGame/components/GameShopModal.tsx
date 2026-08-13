import React, { useMemo, useState } from 'react';
import { message } from 'antd';
import { AnimatePresence, motion } from 'framer-motion';
import { FaBed, FaBoxOpen, FaCat, FaCoins, FaHammer, FaHome, FaUser, FaWarehouse } from 'react-icons/fa';
import {
  useGetGameShopQuery,
  usePurchaseGameShopItemMutation,
  type GameShopItem,
} from '../../../../../api/profileStateRtkApi';
import { gameBus } from '../shared/EventBus';
import { CatalogIcon } from '../visuals';
import { chestClosedUrl, inventoryUiUrl } from '../../../../../assets';

interface GameShopModalProps {
  open: boolean;
  roomId?: string | null;
  onClose: () => void;
}

type ShopCategory = GameShopItem['category'];

const CATEGORY_ORDER: ShopCategory[] = ['tool', 'furniture', 'npc', 'house', 'pet'];

const categoryMeta: Record<ShopCategory, {
  label: string;
  badge: string;
  accent: string;
  Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}> = {
  npc: { label: '村民', badge: 'NPC', accent: '#4c9f58', Icon: FaUser },
  house: { label: '房屋', badge: '蓝图', accent: '#d68b24', Icon: FaHome },
  storage: { label: '收纳', badge: '箱子', accent: '#a9683a', Icon: FaWarehouse },
  tool: { label: '工具', badge: '工具', accent: '#4f73d9', Icon: FaHammer },
  furniture: { label: '家具', badge: '家具', accent: '#8d6bd6', Icon: FaBed },
  pet: { label: '宠物', badge: '宠物', accent: '#c8754c', Icon: FaCat },
};

const PANEL_STYLE: React.CSSProperties = {
  width: 'min(1080px, calc(100vw - 28px))',
  height: 'min(84vh, 780px)',
  border: '4px solid #5b351f',
  borderRadius: 8,
  background:
    'linear-gradient(180deg, rgba(255,236,176,0.98), rgba(226,174,105,0.98)), repeating-linear-gradient(0deg, rgba(91,53,31,0.08) 0 2px, transparent 2px 8px)',
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

function getItemTitle(item: GameShopItem): string {
  return item.nameZh || item.name || item.title || item.id;
}

function getOwnedCount(item: GameShopItem): number | undefined {
  return item.ownedQuantity ?? item.ownedBlueprintQuantity;
}

function isStorageChestShopItem(item: GameShopItem): boolean {
  return item.shopItemId?.startsWith('storage:') || item.itemId === 'storage_chest_basic' || item.capacity != null;
}

function getItemDescription(item: GameShopItem): string {
  if (item.description) return item.description;
  if (item.category === 'house') return '可以放进背包的房屋蓝图，选中后在地图空地上放置。';
  if (item.category === 'storage' || isStorageChestShopItem(item)) return `可以放置在地图上的储物箱，容量 ${item.capacity ?? 24} 格。`;
  if (item.category === 'tool') return '用于农场、采集或建设的常用工具。';
  if (item.category === 'furniture') return '可以放置在地图上的家具。';
  if (item.category === 'pet') return '可以带回村庄的伙伴。';
  return '会来到村庄生活的角色。';
}

function getItemStats(item: GameShopItem): string[] {
  const stats: string[] = [];
  if (item.category === 'npc' && item.role) stats.push(`身份 ${item.role}`);
  if (item.category === 'house' && item.rentPerDay != null) stats.push(`每日租金 ${item.rentPerDay}`);
  if (item.category === 'storage' || isStorageChestShopItem(item)) stats.push(`容量 ${item.capacity ?? 24}`);
  if (item.category === 'furniture') stats.push(isStorageChestShopItem(item) ? '储物家具' : '可放置');
  if (item.category === 'pet' && item.canSpeak != null) stats.push(item.canSpeak ? '可以对话' : '安静陪伴');
  const ownedCount = getOwnedCount(item);
  if (ownedCount != null) stats.push(`背包已有 ${ownedCount}`);
  return stats;
}

const ShopItemVisual: React.FC<{ item: GameShopItem; size?: number }> = ({ item, size = 72 }) => {
  const avatarUrl = item.avatarUrl || item.assets?.avatar;
  if (item.category === 'npc' && avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          imageRendering: 'pixelated',
          border: '3px solid #32190e',
          borderRadius: 6,
          boxShadow: 'inset 0 3px 0 rgba(255,255,255,0.22), inset 0 -7px 0 rgba(0,0,0,0.22), 0 4px 0 #28160d',
          background: '#1e1712',
        }}
      />
    );
  }
  return <CatalogIcon category={item.category} itemId={item.itemId} visualKey={item.visualKey} size={size} />;
};

export const GameShopModal: React.FC<GameShopModalProps> = ({ open, roomId, onClose }) => {
  const [category, setCategory] = useState<ShopCategory>('tool');
  const [selectedShopItemId, setSelectedShopItemId] = useState<string | null>(null);
  const { data, isLoading, refetch } = useGetGameShopQuery(roomId ?? undefined, {
    skip: !open,
    refetchOnMountOrArgChange: true,
    pollingInterval: open ? 2000 : 0,
  });
  const [purchaseGameShopItem, { isLoading: purchasing }] = usePurchaseGameShopItemMutation();
  const coins = Number(data?.wallet?.coins ?? 0);

  const items = useMemo(() => {
    const raw = data?.items ?? [];
    return raw.filter((item) => item.category === category);
  }, [category, data?.items]);

  const selectedItem = useMemo(
    () => items.find((item) => item.shopItemId === selectedShopItemId) ?? items[0] ?? null,
    [items, selectedShopItemId],
  );

  if (!open) return null;

  const canPurchase = (item: GameShopItem) => !item.owned && !item.pendingArrival && coins >= item.price;

  const getPurchaseLabel = (item: GameShopItem) => {
    if (item.owned) return '已拥有';
    if (item.pendingArrival) return '路上';
    if (coins < item.price) return '金币不足';
    return purchasing ? '购买中...' : '购买';
  };

  const handlePurchase = async (item: GameShopItem) => {
    if (!canPurchase(item) || purchasing) return;

    try {
      const result = await purchaseGameShopItem({
        shopItemId: item.shopItemId,
        quantity: 1,
        roomId: roomId ?? data?.gameSave?.worldStatus?.roomId,
      }).unwrap();

      const title = getItemTitle(item);
      if (item.category === 'npc') {
        const purchase = result.purchase as { alreadyOwned?: boolean; pendingArrival?: boolean } | undefined;
        if (purchase?.alreadyOwned) message.info(`${title} 已经住在这里了。`);
        else {
          gameBus.emit('game:npc_arrival_requested', {
            npcId: item.id,
            npcName: item.name ?? item.nameZh ?? title,
            reason: 'shop_purchase',
          });
          message.success(purchase?.pendingArrival ? `${title} 正在坐车过来。` : `${title} 坐车到站了。`);
          onClose();
        }
      } else if (item.category === 'house') {
        message.success(`${title} 蓝图已经放进背包。`);
      } else {
        message.success(`${title} 已经放进背包。`);
      }
      refetch();
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err?.data?.message || '购买失败');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="商店"
      onMouseDown={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 440,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 50% 36%, rgba(255,210,112,0.17), transparent 38%), rgba(13, 8, 5, 0.66)',
        padding: 16,
      }}
    >
      <section onMouseDown={(event) => event.stopPropagation()} style={PANEL_STYLE}>
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
                商店
              </h2>
              <p style={{ margin: '6px 0 0', color: '#d9b16a', fontSize: 12, letterSpacing: 0 }}>
                货架 {items.length} 件
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                border: '3px solid #27150d',
                borderRadius: 4,
                background: 'linear-gradient(180deg, #f0c86b, #b96b32)',
                color: '#32190e',
                padding: '7px 10px',
                fontWeight: 900,
                boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.36), 0 3px 0 rgba(0,0,0,0.35)',
                whiteSpace: 'nowrap',
              }}
            >
              <FaCoins />
              {coins.toLocaleString()}
            </div>
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
              aria-label="关闭商店"
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

        <div style={{ display: 'flex', gap: 8, padding: 10, borderBottom: '3px solid #6a3e24', overflowX: 'auto' }}>
          {CATEGORY_ORDER.map((entry) => {
            const active = category === entry;
            const meta = categoryMeta[entry];
            const Icon = meta.Icon;
            return (
              <button
                key={entry}
                type="button"
                onClick={() => {
                  setCategory(entry);
                  setSelectedShopItemId(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
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
                <Icon size={13} />
                {meta.label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            gap: 14,
            padding: 14,
            minHeight: 0,
            flex: 1,
          }}
          className="grid grid-cols-[minmax(0,1fr)_minmax(280px,340px)] max-lg:grid-cols-1"
        >
          <div style={{ ...SECTION_STYLE, minHeight: 0, overflow: 'hidden', display: 'grid', gridTemplateRows: 'minmax(0, 1fr)' }}>
            <div style={{ overflow: 'auto', padding: 12 }}>
              {isLoading ? (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#7a4a2a', fontWeight: 900 }}>
                  货架整理中...
                </div>
              ) : items.length === 0 ? (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#7a4a2a', fontWeight: 900 }}>
                  这个货架还没有商品
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {items.map((item) => {
                    const title = getItemTitle(item);
                    const meta = categoryMeta[item.category];
                    const selected = selectedItem?.shopItemId === item.shopItemId;
                    const disabled = purchasing || !canPurchase(item);
                    return (
                      <article
                        key={item.shopItemId}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedShopItemId(item.shopItemId)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedShopItemId(item.shopItemId);
                          }
                        }}
                        style={{
                          border: selected ? '3px solid #ffe27a' : `3px solid ${meta.accent}`,
                          borderRadius: 6,
                          background: selected
                            ? 'linear-gradient(180deg, #f6d98a, #bd7a40)'
                            : 'linear-gradient(180deg, #fff0b7, #d5924f)',
                          boxShadow: selected
                            ? '0 0 0 2px #2a150c, 0 0 18px rgba(255,226,122,0.8), inset 0 0 0 2px rgba(255,255,255,0.22)'
                            : 'inset 0 0 0 2px rgba(255,255,255,0.26), inset 0 -7px 0 rgba(83,45,24,0.18), 0 4px 0 #351f13',
                          padding: 10,
                          display: 'grid',
                          gridTemplateRows: 'auto minmax(58px, 1fr) auto',
                          gap: 10,
                          minHeight: 210,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div
                            style={{
                              width: 64,
                              height: 64,
                              display: 'grid',
                              placeItems: 'center',
                              flex: '0 0 auto',
                              border: '3px solid #5a3722',
                              borderRadius: 5,
                              background: 'linear-gradient(180deg, #7a4a2a, #392217)',
                              boxShadow: 'inset 0 0 0 2px rgba(255,232,163,0.16), inset 0 -7px 0 rgba(0,0,0,0.2)',
                            }}
                          >
                            <ShopItemVisual item={item} size={48} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <span
                              style={{
                                display: 'inline-block',
                                border: '2px solid #5a3722',
                                background: meta.accent,
                                color: '#fff2be',
                                padding: '2px 6px',
                                fontSize: 10,
                                fontWeight: 900,
                                textShadow: '0 1px 0 #000',
                              }}
                            >
                              {meta.badge}
                            </span>
                            <h3 style={{ margin: '6px 0 0', color: '#3f2315', fontSize: 16, letterSpacing: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {title}
                            </h3>
                          </div>
                        </div>

                        <p
                          style={{
                            margin: 0,
                            color: '#5d3822',
                            fontSize: 12,
                            lineHeight: 1.55,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {getItemDescription(item)}
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <strong style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#4a2818', fontSize: 13 }}>
                            <FaCoins color="#c97823" />
                            {item.price.toLocaleString()}
                          </strong>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={(event) => {
                              event.stopPropagation();
                              handlePurchase(item);
                            }}
                            style={{
                              border: '3px solid #2d190f',
                              borderRadius: 4,
                              background: canPurchase(item)
                                ? 'linear-gradient(180deg, #ffe27a, #c57332)'
                                : 'linear-gradient(180deg, #8a6f54, #5e4632)',
                              color: canPurchase(item) ? '#2d160d' : '#d8b98a',
                              padding: '8px 10px',
                              minWidth: 76,
                              fontWeight: 900,
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.28), 0 3px 0 rgba(0,0,0,0.34)',
                            }}
                          >
                            {getPurchaseLabel(item)}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <aside style={{ ...SECTION_STYLE, minHeight: 0, overflow: 'hidden' }} className="max-lg:hidden">
            <AnimatePresence mode="wait">
              {selectedItem ? (
                <motion.div
                  key={selectedItem.shopItemId}
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
                      border: `3px solid ${categoryMeta[selectedItem.category].accent}`,
                      borderRadius: 6,
                      background: 'linear-gradient(180deg, #fff0b7, #d5924f)',
                      minHeight: 176,
                      display: 'grid',
                      placeItems: 'center',
                      boxShadow: `0 0 0 2px rgba(42,21,12,0.82), 0 0 18px ${categoryMeta[selectedItem.category].accent}55`,
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
                      <ShopItemVisual item={selectedItem} size={104} />
                    </motion.div>
                  </div>

                  <div style={{ overflow: 'auto', paddingRight: 4 }}>
                    <h3 style={{ margin: '0 0 8px', color: '#4a2818', fontSize: 20, letterSpacing: 0 }}>
                      {getItemTitle(selectedItem)}
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      <span style={{ border: '2px solid #6a3e24', background: '#f6d98a', padding: '4px 8px', fontSize: 12 }}>
                        {categoryMeta[selectedItem.category].label}
                      </span>
                      <span style={{ border: '2px solid #6a3e24', background: '#f6d98a', padding: '4px 8px', fontSize: 12 }}>
                        金币 {selectedItem.price.toLocaleString()}
                      </span>
                      {(selectedItem.owned || selectedItem.pendingArrival) && (
                        <span
                          style={{
                            border: '2px solid #6a3e24',
                            background: categoryMeta[selectedItem.category].accent,
                            color: '#fff2be',
                            padding: '4px 8px',
                            fontSize: 12,
                            textShadow: '0 1px 0 #000',
                          }}
                        >
                          {selectedItem.owned ? '已拥有' : '正在路上'}
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
                      {getItemDescription(selectedItem)}
                    </p>
                    {getItemStats(selectedItem).length > 0 && (
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
                        {getItemStats(selectedItem).map((stat) => (
                          <div key={stat}>{stat}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={purchasing || !canPurchase(selectedItem)}
                    onClick={() => handlePurchase(selectedItem)}
                    style={{
                      border: '3px solid #2d190f',
                      borderRadius: 4,
                      background: canPurchase(selectedItem)
                        ? 'linear-gradient(180deg, #ffe27a, #c57332)'
                        : 'linear-gradient(180deg, #8a6f54, #5e4632)',
                      color: canPurchase(selectedItem) ? '#2d160d' : '#d8b98a',
                      padding: '13px 12px',
                      fontWeight: 900,
                      cursor: purchasing || !canPurchase(selectedItem) ? 'not-allowed' : 'pointer',
                      boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.34), 0 4px 0 rgba(0,0,0,0.36)',
                    }}
                  >
                    {getPurchaseLabel(selectedItem)}
                  </button>
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
                    <FaBoxOpen size={60} />
                    <h3 style={{ margin: '12px 0 0', fontSize: 18 }}>没有选中商品</h3>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </aside>
        </div>
      </section>
    </div>
  );
};
