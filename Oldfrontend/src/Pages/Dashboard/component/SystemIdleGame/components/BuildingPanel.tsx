import React, { useEffect, useMemo, useState } from 'react';
import {
  useClearBuildingMutation,
  useSetHouseResidentMutation,
  useStartBuildingRepairMutation,
  useStartBuildingUpgradeMutation,
} from '../api';
import { getBuildingDefinition } from '../catalog/GameRuntimeCatalog';
import type { BuildingInstanceSave, BuildingResourceMap } from '../features/building';
import type { GameSaveV2 } from '../persistence/save/GameSaveTypes';
import { ItemIcon } from '../visuals/ItemIcon';
import './BuildingPanel.css';

interface BuildingPanelProps {
  open: boolean;
  buildingId: string | null;
  sceneRef: React.MutableRefObject<any>;
  onClose: () => void;
}

function findBuilding(save: GameSaveV2 | null | undefined, buildingId: string | null): BuildingInstanceSave | null {
  if (!save || !buildingId) return null;
  for (const partition of Object.values(save.worldStatus?.worlds ?? {})) {
    const match = partition.entities.buildings.find((building) => building.id === buildingId);
    if (match) return match;
  }
  return null;
}

function formatResources(resources: BuildingResourceMap | null | undefined): string {
  const entries = Object.entries(resources ?? {});
  if (entries.length === 0) return '--';
  return entries.map(([key, value]) => `${resourceLabel(key)} x${value}`).join(' / ');
}

function resourceLabel(resourceId: string): string {
  switch (resourceId) {
    case 'coins':
      return '金币';
    case 'stone':
      return 'stone';
    case 'incense':
      return 'incense';
    default:
      return resourceId;
  }
}

function apiMessage(error: unknown, fallback: string): string {
  return (error as { data?: { message?: string } } | null)?.data?.message || fallback;
}

function jobProgress(job: { startedAtGameMinute: number; completesAtGameMinute: number } | null | undefined, now: number): number {
  if (!job) return 0;
  const total = Math.max(1, Number(job.completesAtGameMinute) - Number(job.startedAtGameMinute));
  const elapsed = Math.max(0, Number(now) - Number(job.startedAtGameMinute));
  return Math.max(0, Math.min(1, elapsed / total));
}

function npcLabel(scene: any, npcId: string): string {
  const definition = scene?.gameCatalogSystem?.getNpcDefinitionById?.(npcId);
  return definition?.name || npcId;
}

function stageVisualKey(
  stages: Array<{ visualKey?: string; durationGameMinutes?: number }> | null | undefined,
  startedAtGameMinute: number,
  absoluteGameMinutes: number,
): string | null {
  if (!Array.isArray(stages) || stages.length === 0) return null;
  const elapsed = Math.max(0, Number(absoluteGameMinutes) - Number(startedAtGameMinute || 0));
  let cursor = 0;
  for (const stage of stages) {
    cursor += Math.max(0, Number(stage.durationGameMinutes || 0));
    if (elapsed < cursor) return stage.visualKey || null;
  }
  return stages[stages.length - 1]?.visualKey || null;
}

function buildingVisualKey(
  building: BuildingInstanceSave,
  definition: ReturnType<typeof getBuildingDefinition>,
  currentLevel: { visualKey?: string; upgradeStages?: Array<{ visualKey?: string; durationGameMinutes?: number }> } | undefined,
  nextLevel: { visualKey?: string; upgradeStages?: Array<{ visualKey?: string; durationGameMinutes?: number }> } | undefined,
  absoluteGameMinutes: number,
): string | null {
  if (building.state === 'planned') {
    return definition?.constructionStages?.[0]?.visualKey || currentLevel?.visualKey || definition?.visualKey || null;
  }
  if (building.state === 'constructing' && building.constructionJob) {
    return stageVisualKey(
      definition?.constructionStages,
      building.constructionJob.startedAtGameMinute,
      absoluteGameMinutes,
    );
  }
  if (building.state === 'upgrading' && building.upgradeJob) {
    return stageVisualKey(
      currentLevel?.upgradeStages ?? nextLevel?.upgradeStages,
      building.upgradeJob.startedAtGameMinute,
      absoluteGameMinutes,
    );
  }
  return currentLevel?.visualKey || definition?.visualKey || null;
}

export const BuildingPanel: React.FC<BuildingPanelProps> = ({
  open,
  buildingId,
  sceneRef,
  onClose,
}) => {
  const [startUpgrade, { isLoading: upgrading }] = useStartBuildingUpgradeMutation();
  const [startRepair, { isLoading: repairing }] = useStartBuildingRepairMutation();
  const [clearBuilding, { isLoading: clearing }] = useClearBuildingMutation();
  const [setHouseResident, { isLoading: settingResident }] = useSetHouseResidentMutation();
  const [selectedNpcId, setSelectedNpcId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [, rerender] = useState(0);
  const save = sceneRef.current?.latestGameSave || sceneRef.current?.initialGameSave || null;
  const building = useMemo(() => findBuilding(save, buildingId), [buildingId, save]);
  const definition = getBuildingDefinition(building?.definitionId);
  const currentLevel = definition?.levels.find((level) => level.level === building?.level);
  const nextLevel = definition?.levels.find((level) => level.level === (building?.level ?? 0) + 1);
  const isHouse = definition?.category === 'house';
  const houseMeta = (building?.meta?.house && typeof building.meta.house === 'object' ? building.meta.house : {}) as {
    residentNpcId?: string | null;
    residentNpcName?: string | null;
    roomId?: string | null;
    displayId?: string | null;
  };
  const npcOptions = useMemo(() => (
    (save?.worldStatus?.unlockedNpcs ?? []).map((npcId: string) => ({
      id: npcId,
      label: npcLabel(sceneRef.current, npcId),
    }))
  ), [save?.worldStatus?.unlockedNpcs, sceneRef]);

  useEffect(() => {
    if (!open || !isHouse) return;
    setSelectedNpcId(houseMeta.residentNpcId || npcOptions[0]?.id || '');
  }, [buildingId, houseMeta.residentNpcId, isHouse, npcOptions, open]);

  if (!open || !building) return null;

  const title = definition?.nameZh || definition?.name || building.definitionId;
  const stats = Object.entries(currentLevel?.stats ?? {});
  const busyJob = building.constructionJob || building.upgradeJob || building.repairJob || null;
  const busyLabel = building.constructionJob ? '施工' : building.upgradeJob ? '升级' : building.repairJob ? '修理' : null;
  const upgradeCost = Object.keys(currentLevel?.upgradeCost ?? {}).length > 0
    ? currentLevel?.upgradeCost
    : nextLevel?.upgradeCost;
  const upgradeDuration = currentLevel?.upgradeDurationGameMinutes ?? nextLevel?.upgradeDurationGameMinutes ?? 0;
  const roomId = sceneRef.current?.roomId || sceneRef.current?.currentRoomId || undefined;
  const absoluteGameMinutes = sceneRef.current?.dayCycle?.absoluteGameMinutes ?? save?.worldStatus?.time?.absoluteGameMinutes ?? 0;
  const progress = jobProgress(busyJob, absoluteGameMinutes);
  const canUpgrade = Boolean(nextLevel && building.state === 'idle' && building.level >= 1);
  const canRepair = building.state === 'disabled';
  const canClear = definition?.category === 'clearable' || building.state === 'clearable';
  const houseReady = isHouse && building.state === 'idle' && building.level >= 1;
  const visualKey = buildingVisualKey(building, definition, currentLevel, nextLevel, absoluteGameMinutes);

  const syncResult = (gameSave: unknown) => {
    sceneRef.current?.syncEventSaveData?.(gameSave);
    rerender((value) => value + 1);
  };

  const handleUpgrade = async () => {
    if (!building || !canUpgrade) return;
    setError(null);
    try {
      const result = await startUpgrade({ roomId, buildingId: building.id, absoluteGameMinutes }).unwrap();
      syncResult(result.gameSave);
    } catch (err) {
      setError(apiMessage(err, '升级失败。'));
    }
  };

  const handleRepair = async () => {
    if (!building || !canRepair) return;
    setError(null);
    try {
      const result = await startRepair({ roomId, buildingId: building.id, absoluteGameMinutes }).unwrap();
      syncResult(result.gameSave);
    } catch (err) {
      setError(apiMessage(err, '修理失败。'));
    }
  };

  const handleClear = async () => {
    if (!building || !canClear) return;
    setError(null);
    try {
      const result = await clearBuilding({ roomId, buildingId: building.id }).unwrap();
      syncResult(result.gameSave);
      onClose();
    } catch (err) {
      setError(apiMessage(err, '清理失败。'));
    }
  };

  const handleSetResident = async (residentNpcId: string | null) => {
    if (!building || !isHouse) return;
    setError(null);
    const selected = npcOptions.find((npc: { id: string; label: string }) => npc.id === residentNpcId);
    try {
      const result = await setHouseResident({
        roomId,
        buildingId: building.id,
        residentNpcId,
        residentNpcName: residentNpcId ? selected?.label || residentNpcId : null,
        absoluteGameMinutes,
      }).unwrap();
      syncResult(result.gameSave);
    } catch (err) {
      setError(apiMessage(err, '入住绑定失败。'));
    }
  };

  return (
    <div className="building-panel-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="building-panel" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="building-panel__header">
          <div>
            <h2>{title}</h2>
            <p>{building.level > 0 ? `Lv.${building.level}` : '施工中'} · {building.state}</p>
          </div>
          <button type="button" className="building-panel__close" onClick={onClose}>×</button>
        </header>

        <div className="building-panel__body">
          <div className="building-panel__sprite" aria-hidden="true">
            <ItemIcon
              itemId={definition?.itemId || building.itemId}
              visualKey={visualKey}
              size={88}
              alt={title}
            />
          </div>

          <div className="building-panel__section">
            <h3>当前数值</h3>
            <div className="building-panel__stats">
              {stats.length > 0 ? stats.map(([key, value]) => (
                <span key={key}>{key}: {String(value)}</span>
              )) : <span>--</span>}
            </div>
          </div>

          <div className="building-panel__section">
            <h3>下一等级</h3>
            {nextLevel ? (
              <div className="building-panel__stats">
                {Object.entries(nextLevel.stats ?? {}).map(([key, value]) => (
                  <span key={key}>{key}: {String(value)}</span>
                ))}
                <span>消耗: {formatResources(upgradeCost)}</span>
                <span>耗时: {upgradeDuration} 分钟</span>
              </div>
            ) : (
              <div className="building-panel__stats"><span>MAX</span></div>
            )}
          </div>

          {(canRepair || canClear || busyJob || error) && (
            <div className="building-panel__section">
              <h3>当前任务</h3>
              <div className="building-panel__stats">
                {busyJob ? (
                  <>
                    <span>任务: {busyLabel}</span>
                    <span>进度: {Math.round(progress * 100)}%</span>
                    <span>完成于: {Math.floor(busyJob.completesAtGameMinute)}</span>
                    <span>石傀儡: {busyJob.assignedWorkerEntityId || '--'}</span>
                  </>
                ) : null}
                {canRepair ? (
                  <>
                    <span>修理消耗: {formatResources(currentLevel?.repairCost ?? definition?.repairCost)}</span>
                    <span>修理耗时: {currentLevel?.repairDurationGameMinutes ?? definition?.repairDurationGameMinutes ?? 0} 分钟</span>
                  </>
                ) : null}
                {canClear ? <span>清理奖励: {formatResources(definition?.clearRewards)}</span> : null}
                {error ? <span className="building-panel__error">{error}</span> : null}
              </div>
            </div>
          )}

          {isHouse ? (
            <div className="building-panel__section">
              <h3>入住</h3>
              <div className="building-panel__resident">
                <span>
                  当前住户: {houseMeta.residentNpcId
                    ? npcLabel(sceneRef.current, houseMeta.residentNpcId)
                    : houseMeta.residentNpcName || '--'}
                </span>
                <select
                  value={selectedNpcId}
                  disabled={!houseReady || settingResident || npcOptions.length === 0}
                  onChange={(event) => setSelectedNpcId(event.target.value)}
                >
                  {npcOptions.length > 0 ? npcOptions.map((npc: { id: string; label: string }) => (
                    <option key={npc.id} value={npc.id}>{npc.label}</option>
                  )) : <option value="">暂无 NPC</option>}
                </select>
                <div className="building-panel__resident-actions">
                  <button
                    type="button"
                    disabled={!houseReady || settingResident || !selectedNpcId}
                    onClick={() => handleSetResident(selectedNpcId)}
                  >
                    绑定入住
                  </button>
                  <button
                    type="button"
                    disabled={!houseReady || settingResident || !houseMeta.residentNpcId}
                    onClick={() => handleSetResident(null)}
                  >
                    清空
                  </button>
                </div>
                {!houseReady ? <span className="building-panel__hint">完工后可绑定 NPC。</span> : null}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="building-panel__actions">
          {canClear ? <button type="button" disabled={clearing} onClick={handleClear}>清理</button> : null}
          <button type="button" disabled={!canUpgrade || upgrading} onClick={handleUpgrade}>升级</button>
          <button type="button" disabled={!canRepair || repairing} onClick={handleRepair}>修理</button>
          <button type="button" onClick={onClose}>关闭</button>
        </footer>
      </section>
    </div>
  );
};
