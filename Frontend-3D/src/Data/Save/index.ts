export {
  getSaveRepository,
  createLocalSaveRepository,
  createCloudBoundRepository,
  setCloudRepositoryFactory,
  resetSaveRepository,
  stashMainToConflict,
} from "./SaveRepository";
export {
  serializeGameSave,
  // 开新档的复位口。为什么需要它见 serialize.ts 里 pristine 那一段
  capturePristineSave,
  resetToPristineSave,
  // 读档事务：期间的 *_changed 不算"世界变了"
  isRestoring,
  // 房客应用房主的整片刷新
  applyWorldReplica,
} from "./serialize";
/*
 * `hydrateGameSave` 故意不从这里出：直接灌会绕过迁移。读档 / 做客进出走
 * runtime.ts 的三条入口（`tests/saveBoundary.test.ts` 守着这条界）。
 */
export {
  loadSaveIntoRuntime,
  enterWorldSnapshot,
  exitWorldSnapshot,
  type LoadIntoRuntimeOutcome,
} from "./runtime";
export {
  autosaveTriggers,
  refreshTriggers,
  matchTriggers,
  replicateWorldSlices,
  type TriggerTable,
} from "./registry/derive";
export {
  startAutosave,
  saveNow,
  setBaseline,
  getBaseline,
  setSaveComposer,
} from "./autosave";
export { migrateSave, migrations } from "./migrations";
export {
  getActiveSlot,
  setActiveSlot,
  isSaveSlotId,
  keysForSlot,
  LOCAL_SAVE_SLOT_IDS,
  SAVE_SLOT_IDS,
  type LocalSaveSlotId,
  type SaveSlotId,
} from "./slots";
export {
  describeSaveSlot,
  listSaveSlots,
  type SaveSlotSummary,
} from "./slotSummary";
export {
  SAVE_KEYS,
  SAVE_SCHEMA_VERSION,
  type LoadOutcome,
  type SaveMode,
  type SaveOutcome,
  type SaveRepository,
} from "./types";
