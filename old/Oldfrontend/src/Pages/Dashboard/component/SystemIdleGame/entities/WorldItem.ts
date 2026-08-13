/**
 * WorldItem — backward-compatibility re-export.
 * Real implementation lives in DropItem.ts.
 * All new code should import DropItem directly.
 */
export {
  DropItem        as WorldItem,
  DropItem,
  ALL_ITEM_DEFS,
  TOOL_ITEM_DEFS,
  type ItemDef    as WorldItemDef,
  type ItemDef,
} from './DropItem';
