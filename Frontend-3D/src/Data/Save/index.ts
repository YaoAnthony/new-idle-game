export { getSaveRepository, createLocalSaveRepository } from "./SaveRepository";
export { serializeGameSave, hydrateGameSave } from "./serialize";
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
