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
  hydrateGameSave,
  // 开新档的复位口。为什么需要它见 serialize.ts 里 pristine 那一段
  capturePristineSave,
  resetToPristineSave,
} from "./serialize";
export {
  startAutosave,
  saveNow,
  setBaseline,
  getBaseline,
  setSaveComposer,
} from "./autosave";
export { migrateSave, migrations } from "./migrations";
export {
  SAVE_KEYS,
  SAVE_SCHEMA_VERSION,
  type LoadOutcome,
  type SaveMode,
  type SaveOutcome,
  type SaveRepository,
} from "./types";
