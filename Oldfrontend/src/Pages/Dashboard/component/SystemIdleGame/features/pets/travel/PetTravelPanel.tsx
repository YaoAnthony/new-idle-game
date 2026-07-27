import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { FaCameraRetro, FaPaw, FaTimes } from 'react-icons/fa';
import { DEFAULT_WORLD_ID } from '@timeplan-game/core/game/worldIds';
import { gameBus } from '../../../shared/EventBus';
import { useGetMemoryAlbumQuery } from '../../../api';
import { MemoryAlbumImage } from '../../../components/MemoryAlbumImage';
import { ItemIcon } from '../../../visuals/ItemIcon';
import { getGameItemDefinition } from '../../../catalog/GameRuntimeCatalog';
import { getPetDefinition } from '../PetDefinitions';
import type { RootState } from '../../../../../../../Redux/store';
import type { MemoryAlbumEntry, PetTravelProvision } from './PetTravelTypes';
import './PetTravelPanel.css';

type GameInventory = RootState['game']['gameInventory'];

const PET_SPECIES_LABELS: Record<string, string> = {
  cow: '牛',
  cat: '猫',
  dog: '狗',
  other: '动物',
};

const PET_LIFE_STAGE_LABELS: Record<string, string> = {
  baby: '幼年',
  adult: '成年',
};

const PET_COLOR_LABELS: Record<string, string> = {
  light: '浅色',
  brown: '棕色',
  green: '绿色',
  pink: '粉色',
  purple: '紫色',
};

function getInventoryQuantity(gameInventory: GameInventory, itemId: string): number {
  return gameInventory
    .filter((item) => item.itemId === itemId)
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

export interface PetTravelPanelState {
  petEntityId: string;
  petDefinitionId: string;
  species: string;
  displayName: string;
  worldId?: string;
  lifeStage?: string;
  color?: string;
  referenceImageDataUrl?: string | null;
  returnedEntryId?: string | null;
}

interface PetTravelPanelProps {
  open: boolean;
  roomId?: string | null;
  pet: PetTravelPanelState | null;
  absoluteGameMinutes?: number;
  onClose: (options?: { acknowledgeReturnedPhoto?: boolean }) => void;
}

export function PetTravelPanel({
  open,
  roomId,
  pet,
  absoluteGameMinutes,
  onClose,
}: PetTravelPanelProps) {
  const worldId = pet?.worldId || DEFAULT_WORLD_ID;
  const gameInventory = useSelector((state: RootState) => state.game.gameInventory);
  const [draftName, setDraftName] = useState(pet?.displayName ?? '');

  useEffect(() => {
    if (!open) return;
    setDraftName(pet?.displayName ?? '');
  }, [open, pet?.displayName, pet?.petEntityId]);

  const { data } = useGetMemoryAlbumQuery(
    { roomId, worldId },
    { skip: !open || !pet, refetchOnMountOrArgChange: true },
  );
  const isLoadingReturnedPhoto = Boolean(pet?.returnedEntryId && !data);
  const returnedEntry: MemoryAlbumEntry | null = useMemo(() => {
    if (!pet?.returnedEntryId) return null;
    return data?.entries?.find((entry) => entry.id === pet.returnedEntryId) ?? null;
  }, [data?.entries, pet?.returnedEntryId]);
  const requiredProvisions = useMemo<PetTravelProvision[]>(() => {
    if (!pet?.petDefinitionId) return [];
    const definition = getPetDefinition(pet.petDefinitionId);
    return (definition?.travel?.requiredProvisions ?? []).map((rule) => ({
      slot: rule.slot,
      itemId: rule.itemId,
      quantity: Math.max(1, Math.floor(Number(rule.quantity || 1))),
    }));
  }, [pet?.petDefinitionId]);
  const missingProvision = requiredProvisions.find((rule) => {
    const owned = getInventoryQuantity(gameInventory, rule.itemId);
    return owned < rule.quantity;
  }) ?? null;
  const canSendTravel = Boolean(pet?.referenceImageDataUrl);

  if (!open || !pet) return null;

  const resolvedDisplayName = draftName.trim() || pet.displayName || '小动物';
  const speciesLabel = PET_SPECIES_LABELS[pet.species] ?? pet.species ?? '动物';
  const lifeStageLabel = PET_LIFE_STAGE_LABELS[pet.lifeStage ?? ''] ?? pet.lifeStage ?? '未知';
  const colorLabel = PET_COLOR_LABELS[pet.color ?? ''] ?? pet.color ?? '未知';
  const primaryProvision = requiredProvisions[0] ?? null;
  const primaryProvisionItem = primaryProvision ? getGameItemDefinition(primaryProvision.itemId) : null;
  const primaryProvisionOwned = primaryProvision
    ? getInventoryQuantity(gameInventory, primaryProvision.itemId)
    : 0;
  const primaryProvisionEnough = !primaryProvision || primaryProvisionOwned >= primaryProvision.quantity;
  const primaryProvisionLabel = primaryProvisionItem?.nameZh
    || primaryProvisionItem?.name
    || primaryProvision?.itemId
    || '口粮';

  const sendTravel = () => {
    if (!pet.referenceImageDataUrl) {
      gameBus.emit('ui:show_message', { text: '这只动物的参考帧还没准备好。' });
      return;
    }
    if (missingProvision) {
      const item = getGameItemDefinition(missingProvision.itemId);
      gameBus.emit('ui:show_message', {
        text: `缺少 ${item?.nameZh || item?.name || missingProvision.itemId} x${missingProvision.quantity}`,
      });
      return;
    }
    gameBus.emit('pet:travel_send_requested', {
      roomId,
      worldId,
      petEntityId: pet.petEntityId,
      petDefinitionId: pet.petDefinitionId,
      species: pet.species,
      displayName: resolvedDisplayName,
      lifeStage: pet.lifeStage,
      color: pet.color,
      referenceImageDataUrl: pet.referenceImageDataUrl,
      provisions: requiredProvisions,
      absoluteGameMinutes,
    });
    onClose();
  };

  const closePanel = () => {
    onClose({ acknowledgeReturnedPhoto: Boolean(pet.returnedEntryId) });
  };

  const claimPhoto = () => {
    if (!pet.returnedEntryId) return;
    onClose({ acknowledgeReturnedPhoto: true });
  };

  return (
    <div className="pet-travel-panel-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closePanel();
    }}>
      <div className="pet-travel-panel" role="dialog" aria-modal="true" aria-label={`${resolvedDisplayName}旅行面板`}>
        <header className="pet-travel-panel__header">
          <div>
            <span>动物数据</span>
            <h3>{speciesLabel}</h3>
          </div>
          <button type="button" onClick={closePanel} aria-label="关闭">
            <FaTimes />
          </button>
        </header>
        <main className="pet-travel-panel__body">
          <section className="pet-travel-panel__profile" aria-label={`${speciesLabel}资料`}>
            <div className="pet-travel-panel__portrait" aria-hidden={!pet.referenceImageDataUrl}>
              {pet.referenceImageDataUrl ? (
                <img src={pet.referenceImageDataUrl} alt={`${resolvedDisplayName}的样子`} />
              ) : (
                <FaPaw />
              )}
            </div>
            <div className="pet-travel-panel__identity">
              <label htmlFor="pet-travel-name">名字</label>
              <input
                id="pet-travel-name"
                className="pet-travel-panel__name-input"
                value={draftName}
                maxLength={24}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder={pet.displayName || '给它起个名字'}
              />
              <div className="pet-travel-panel__stats" aria-label="动物属性">
                <span>
                  <small>种类</small>
                  <strong>{speciesLabel}</strong>
                </span>
                <span>
                  <small>阶段</small>
                  <strong>{lifeStageLabel}</strong>
                </span>
                <span>
                  <small>颜色</small>
                  <strong>{colorLabel}</strong>
                </span>
              </div>
            </div>
          </section>

          {returnedEntry ? (
            <section className="pet-travel-panel__photo">
              <MemoryAlbumImage imageUrl={returnedEntry.imageUrl} alt={returnedEntry.title} />
              <div>
                <strong>{returnedEntry.title}</strong>
                <p>{returnedEntry.caption}</p>
              </div>
            </section>
          ) : pet.returnedEntryId ? (
            <section className="pet-travel-panel__note">
              <FaCameraRetro />
              <p>正在翻找它带回来的照片。</p>
            </section>
          ) : null}
        </main>
        <footer className="pet-travel-panel__footer">
          {returnedEntry ? (
            <button type="button" className="pet-travel-panel__primary" onClick={claimPhoto}>
              <FaCameraRetro /> 收进相册
            </button>
          ) : pet.returnedEntryId ? (
            <button type="button" className="pet-travel-panel__primary" disabled>
              <FaCameraRetro /> {isLoadingReturnedPhoto ? '取照片中' : '照片未准备好'}
            </button>
          ) : (
            <div className="pet-travel-panel__travel-action">
              <span>出行</span>
              <button
                type="button"
                className={`pet-travel-panel__primary ${primaryProvisionEnough ? '' : 'is-missing'}`}
                onClick={sendTravel}
                disabled={!canSendTravel}
                title={primaryProvision ? primaryProvisionLabel : '无需口粮'}
                aria-label={primaryProvision ? `${primaryProvisionLabel} X${primaryProvision.quantity}` : '无需口粮'}
              >
                {primaryProvision ? (
                  <>
                    <ItemIcon
                      itemId={primaryProvision.itemId}
                      visualKey={primaryProvisionItem?.visualKey}
                      size={24}
                      alt={primaryProvisionLabel}
                    />
                    <span>{primaryProvisionLabel} X{primaryProvision.quantity}</span>
                  </>
                ) : (
                  <span>无需口粮</span>
                )}
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
