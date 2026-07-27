export type {
  GameItemDefinition,
  GameItemRarity,
  GameItemType,
  ItemActionType,
  ItemCapability,
} from '../catalog/GameCatalogTypes';

export {
  getGameItemDefinition,
  getGameItems,
  registerDynamicGameItems,
} from '../catalog/GameRuntimeCatalog';
