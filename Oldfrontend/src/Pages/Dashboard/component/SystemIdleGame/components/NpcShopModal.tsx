import React from 'react';
import { message } from 'antd';
import {
  useGetGameNpcShopQuery,
  usePurchaseGameNpcMutation,
  type GameNpcShopItem,
} from '../../../../../api/profileStateRtkApi';
import { gameBus } from '../shared/EventBus';

const roleLabels: Record<string, string> = {
  starter: '初始伙伴',
  farmer: '农夫',
  carpenter: '木匠',
  merchant: '商人',
  scholar: '学者',
  rancher: '牧场工',
};

const roleAccent: Record<string, string> = {
  starter: '#7abf7a',
  farmer: '#75b84d',
  carpenter: '#b77a42',
  merchant: '#d69b28',
  scholar: '#6e8ee8',
  rancher: '#d783a3',
};

interface NpcShopModalProps {
  open: boolean;
  roomId?: string | null;
  onClose: () => void;
}

export const NpcShopModal: React.FC<NpcShopModalProps> = ({
  open,
  roomId,
  onClose,
}) => {
  const { data, isLoading, refetch } = useGetGameNpcShopQuery(roomId ?? undefined, {
    skip: !open,
    refetchOnMountOrArgChange: true,
    pollingInterval: open ? 2000 : 0,
  });
  const [purchaseGameNpc, { isLoading: purchasing }] = usePurchaseGameNpcMutation();
  const coins = Number(data?.wallet?.coins ?? 0);
  const npcs = data?.npcs ?? [];

  if (!open) return null;

  const handlePurchase = async (npc: GameNpcShopItem) => {
    try {
      const result = await purchaseGameNpc({
        npcId: npc.id,
        roomId: roomId ?? data?.gameSave?.worldStatus?.roomId,
      }).unwrap();

      if (result.pendingArrival) {
        gameBus.emit('game:npc_arrival_requested', {
          npcId: npc.id,
          npcName: npc.name,
          reason: 'npc_shop_purchase',
        });
        message.success(`${npc.name} 已经上车，巴士马上会到站。`);
        onClose();
      } else if (result.alreadyOwned) {
        message.info(`${npc.name} 已经在当前地图。`);
      } else {
        gameBus.emit('game:npc_arrival_requested', {
          npcId: npc.id,
          npcName: npc.name,
          reason: 'npc_shop_purchase',
        });
        message.success(`${npc.name} 坐车到站了。`);
        onClose();
      }
      refetch();
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err?.data?.message || '招募失败');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="NPC 商店"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 420,
        background: 'rgba(7, 10, 12, 0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        fontFamily: '"Courier New", monospace',
      }}
    >
      <section
        style={{
          width: 'min(980px, 94vw)',
          maxHeight: '82vh',
          overflow: 'hidden',
          border: '2px solid var(--px-border-gold)',
          borderRadius: 6,
          background: 'var(--px-surface)',
          boxShadow: '0 10px 0 rgba(0,0,0,0.35), 0 18px 42px rgba(0,0,0,0.45)',
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
        }}
      >
        <header
          style={{
            padding: '14px 16px',
            borderBottom: '2px solid var(--px-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: 'var(--px-gold)', fontSize: 20, letterSpacing: 0 }}>NPC 商店</h2>
            <p style={{ margin: '5px 0 0', color: 'var(--px-muted)', fontSize: 12 }}>
              招募后会立即加入当前 Tiled 地图，巴士会按当前地图路线到站。
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <strong style={{ color: 'var(--px-gold)', whiteSpace: 'nowrap' }}>{coins.toLocaleString()} 金币</strong>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: '2px solid var(--px-border)',
                borderRadius: 4,
                background: 'var(--px-surface2)',
                color: 'var(--px-text)',
                minWidth: 36,
                minHeight: 34,
                cursor: 'pointer',
                fontWeight: 900,
              }}
            >
              X
            </button>
          </div>
        </header>

        <div style={{ overflow: 'auto', padding: 16 }}>
          {isLoading ? (
            <div style={{ color: 'var(--px-muted)', padding: 16 }}>加载中...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {npcs.map((npc) => {
                const accent = roleAccent[npc.role] ?? '#c89f45';
                const owned = Boolean(npc.owned);
                const pending = Boolean(npc.pendingArrival);
                const canBuy = !owned && !pending && coins >= npc.price;
                const disabled = owned || pending || purchasing || !canBuy;
                const status = owned ? '已加入' : pending ? '巴士在路上' : `${npc.price} 金币`;
                const button = owned ? '已拥有' : pending ? '等待到站' : canBuy ? '招募' : '金币不足';

                return (
                  <article
                    key={npc.id}
                    style={{
                      border: `2px solid ${owned || pending ? accent : 'var(--px-border)'}`,
                      borderRadius: 6,
                      background: 'var(--px-surface2)',
                      padding: 14,
                      display: 'grid',
                      gap: 10,
                      minHeight: 190,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div style={{ color: accent, fontSize: 12, fontWeight: 900 }}>
                          {roleLabels[npc.role] ?? npc.title}
                        </div>
                        <h3 style={{ margin: '4px 0 0', color: 'var(--px-text)', fontSize: 18 }}>
                          {npc.name}
                        </h3>
                      </div>
                      <span
                        style={{
                          alignSelf: 'start',
                          border: `1px solid ${accent}`,
                          color: accent,
                          borderRadius: 4,
                          padding: '3px 6px',
                          fontSize: 11,
                          fontWeight: 900,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {status}
                      </span>
                    </div>
                    <p style={{ margin: 0, color: 'var(--px-muted)', fontSize: 13, lineHeight: 1.55 }}>
                      {npc.description}
                    </p>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handlePurchase(npc)}
                      style={{
                        alignSelf: 'end',
                        minHeight: 36,
                        border: `2px solid ${owned ? 'var(--px-border)' : accent}`,
                        borderRadius: 4,
                        background: owned || pending
                          ? 'rgba(0,0,0,0.08)'
                          : canBuy
                            ? 'rgba(255,215,0,0.12)'
                            : 'rgba(0,0,0,0.08)',
                        color: owned || pending ? 'var(--px-muted)' : canBuy ? accent : 'var(--px-muted)',
                        fontWeight: 900,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {button}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
