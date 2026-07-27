import type { WorldAction, WorldActionResult } from './WorldActionSystem';
import type { WorldSyncSource } from '../../sync/syncPolicy';

export type DomainEvent =
  | {
      type: 'world.action_applied';
      action: WorldAction;
      result: WorldActionResult;
      source: WorldSyncSource;
    }
  | {
      type: 'world.action_rejected';
      action: WorldAction;
      result: WorldActionResult;
      source: WorldSyncSource;
    };
