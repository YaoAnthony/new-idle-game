import { gameBus } from '../../shared/EventBus';
import type { WorldSyncSource } from '../../sync/syncPolicy';
import type {
  WorldAction,
  WorldActionDispatcher,
  WorldActionResult,
} from './WorldActionSystem';

/**
 * Command gateway for world writes.
 *
 * WorldActionSystem applies the mutation. This gateway is the outer boundary
 * that also emits domain events for UI, sync, and debugging.
 */
export class WorldActionGateway implements WorldActionDispatcher {
  constructor(
    private readonly dispatcher: WorldActionDispatcher,
    private readonly defaultSource: WorldSyncSource = 'local',
  ) {}

  dispatchAction(action: WorldAction, source: WorldSyncSource = this.defaultSource): WorldActionResult {
    const result = this.dispatcher.dispatchAction(action);
    gameBus.emit('world:domain_event', {
      type: result.ok ? 'world.action_applied' : 'world.action_rejected',
      action,
      result,
      source,
    });
    gameBus.emit('world:action_applied', { action, result, source });
    return result;
  }
}
