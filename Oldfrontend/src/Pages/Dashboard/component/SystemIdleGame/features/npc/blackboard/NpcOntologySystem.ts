import type { WorldStateManager } from '../../../shared/WorldStateManager';
import type {
  NpcMindState,
  NpcOntologyAffordance,
  NpcOntologyClaim,
  NpcOntologyEpisode,
  NpcOntologyState,
} from '../../../shared/worldStateTypes';
import type { PerceivedDrop, PerceivedObject, PerceptionResult } from '../../../systems/WorldPerceptionSystem';
import { getFoodHungerRestore } from '../../../shared/food';
import { MINS_PER_DAY } from '../../../time/GameTime';
import { migrateNpcMindState } from './NpcMindDefaults';

type OntologyEvent =
  | ({ kind: 'claim' } & Partial<NpcOntologyClaim>)
  | ({ kind: 'episode' } & Partial<NpcOntologyEpisode>)
  | ({ kind: 'affordance' } & Partial<NpcOntologyAffordance>);

export interface NpcOntologyContext {
  claims: Array<Pick<NpcOntologyClaim, 'id' | 'subject' | 'predicate' | 'object' | 'confidence' | 'tags' | 'worldId' | 'x' | 'y' | 'lastConfirmedGameMinute'>>;
  affordances: Array<Pick<NpcOntologyAffordance, 'id' | 'subject' | 'action' | 'trigger' | 'targetId' | 'confidence' | 'worldId' | 'x' | 'y'>>;
  recentEpisodes: Array<Pick<NpcOntologyEpisode, 'id' | 'eventType' | 'summary' | 'source' | 'actionType' | 'ok' | 'absoluteGameMinutes'>>;
}

const MAX_CLAIMS = 160;
const MAX_EPISODES = 120;
const MAX_AFFORDANCES = 80;

function compactId(value: unknown, fallback = 'unknown'): string {
  return String(value || fallback)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w:.-]+/g, '_')
    .slice(0, 180) || fallback;
}

function eventId(prefix: string, parts: unknown[]): string {
  return `${compactId(prefix)}:${parts.map((part) => compactId(part)).join(':')}`.slice(0, 220);
}

function clamp01(value: unknown, fallback = 0.55): number {
  const numeric = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(numeric) ? numeric : fallback));
}

function newestRecord<T>(record: Record<string, T>, max: number, timeKey: keyof T): Record<string, T> {
  return Object.fromEntries(Object.entries(record)
    .sort((a, b) => Number((b[1] as Record<string, unknown>)[String(timeKey)] ?? 0) - Number((a[1] as Record<string, unknown>)[String(timeKey)] ?? 0))
    .slice(0, max));
}

function normalizeOntology(input: unknown, npcId: string, absoluteGameMinutes: number): NpcOntologyState {
  const source = input && typeof input === 'object' ? input as Partial<NpcOntologyState> : {};
  return migrateNpcMindState({ npcId, ontology: source }, npcId, absoluteGameMinutes).ontology;
}

export class NpcOntologySystem {
  constructor(private readonly worldStateManager: WorldStateManager) {}

  updateFromPerception(npcId: string, perception: PerceptionResult, absoluteGameMinutes: number): NpcMindState {
    this.ensureMind(npcId, absoluteGameMinutes);
    const events: OntologyEvent[] = [
      {
        kind: 'episode',
        id: eventId('perception', [npcId, absoluteGameMinutes]),
        eventType: 'observation',
        source: 'runtime_perception',
        summary: `saw ${perception.visibleDrops.length} drops and ${perception.visibleObjects.length} objects`,
        worldId: perception.self.worldId,
        x: perception.self.x,
        y: perception.self.y,
        absoluteGameMinutes,
        tags: ['perception'],
      },
      ...perception.visibleDrops.slice(0, 12).flatMap((drop) => this.eventsForDrop(drop, absoluteGameMinutes)),
      ...perception.visibleObjects.slice(0, 12).flatMap((objectItem) => this.eventsForObject(objectItem, absoluteGameMinutes)),
    ];
    return this.applyEvents(npcId, events, absoluteGameMinutes);
  }

  recordActionResult(
    npcId: string,
    absoluteGameMinutes: number,
    result: {
      status: 'success' | 'failed';
      actionType: string;
      reason?: string;
      targetX?: number;
      targetY?: number;
      x?: number;
      y?: number;
      worldId?: string;
      meta?: Record<string, unknown>;
    },
  ): NpcMindState {
    const events: OntologyEvent[] = [{
      kind: 'episode',
      id: eventId('action_result', [npcId, result.actionType, result.status, absoluteGameMinutes]),
      eventType: 'action_result',
      actionType: result.actionType,
      source: 'runtime_action',
      ok: result.status === 'success',
      summary: `${result.actionType}_${result.status}${result.reason ? `:${result.reason}` : ''}`,
      worldId: result.worldId,
      x: result.targetX ?? result.x,
      y: result.targetY ?? result.y,
      absoluteGameMinutes,
      tags: ['action', result.status],
      data: result.meta,
    }];
    if (result.actionType === 'pickup_item' && result.status === 'failed') {
      events.push({
        kind: 'claim',
        id: eventId('pickup_failed', [npcId, result.worldId, Math.round(result.targetX ?? 0), Math.round(result.targetY ?? 0)]),
        subject: `location:${result.worldId ?? 'world'}:${Math.round(result.targetX ?? 0)},${Math.round(result.targetY ?? 0)}`,
        predicate: 'may_not_contain',
        object: 'requested_item',
        confidence: 0.7,
        source: 'runtime_action',
        tags: ['drop', 'stale'],
        worldId: result.worldId,
        x: result.targetX,
        y: result.targetY,
        lastConfirmedGameMinute: absoluteGameMinutes,
      });
    }
    return this.applyEvents(npcId, events, absoluteGameMinutes);
  }

  buildContext(npcId: string, absoluteGameMinutes: number, limit = 18): NpcOntologyContext | null {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (!mind?.ontology) return null;
    const ontology = normalizeOntology(mind.ontology, npcId, absoluteGameMinutes);
    const claims = Object.values(ontology.claims)
      .filter((claim) => claim.status === 'active')
      .filter((claim) => claim.expiresAtGameMinute == null || claim.expiresAtGameMinute > absoluteGameMinutes)
      .sort((a, b) => b.confidence - a.confidence || b.lastConfirmedGameMinute - a.lastConfirmedGameMinute)
      .slice(0, limit)
      .map(({ id, subject, predicate, object, confidence, tags, worldId, x, y, lastConfirmedGameMinute }) => ({
        id,
        subject,
        predicate,
        object,
        confidence,
        tags,
        worldId,
        x,
        y,
        lastConfirmedGameMinute,
      }));
    const affordances = Object.values(ontology.affordances)
      .sort((a, b) => b.confidence - a.confidence || b.updatedAtGameMinute - a.updatedAtGameMinute)
      .slice(0, 12)
      .map(({ id, subject, action, trigger, targetId, confidence, worldId, x, y }) => ({
        id,
        subject,
        action,
        trigger,
        targetId,
        confidence,
        worldId,
        x,
        y,
      }));
    const recentEpisodes = Object.values(ontology.episodes)
      .sort((a, b) => b.absoluteGameMinutes - a.absoluteGameMinutes)
      .slice(0, 8)
      .map(({ id, eventType, summary, source, actionType, ok, absoluteGameMinutes: minute }) => ({
        id,
        eventType,
        summary,
        source,
        actionType,
        ok,
        absoluteGameMinutes: minute,
      }));
    return { claims, affordances, recentEpisodes };
  }

  consolidateIfNeeded(npcId: string, absoluteGameMinutes: number): void {
    const mind = this.ensureMind(npcId, absoluteGameMinutes);
    const ontology = normalizeOntology(mind.ontology, npcId, absoluteGameMinutes);
    const dayStart = Math.floor(absoluteGameMinutes / MINS_PER_DAY) * MINS_PER_DAY;
    if ((ontology.lastConsolidatedGameMinute ?? 0) >= dayStart) return;
    Object.values(ontology.claims).forEach((claim) => {
      if (claim.expiresAtGameMinute != null && claim.expiresAtGameMinute <= absoluteGameMinutes) {
        claim.status = 'stale';
        claim.confidence = Math.min(claim.confidence, 0.25);
      }
    });
    ontology.episodes = newestRecord(
      Object.fromEntries(Object.entries(ontology.episodes)
        .filter(([, episode]) => episode.absoluteGameMinutes >= dayStart - MINS_PER_DAY)),
      MAX_EPISODES,
      'absoluteGameMinutes',
    );
    ontology.lastConsolidatedGameMinute = absoluteGameMinutes;
    ontology.lastUpdatedGameMinute = absoluteGameMinutes;
    this.worldStateManager.patchNpcMindState(npcId, { ontology });
  }

  private ensureMind(npcId: string, absoluteGameMinutes: number): NpcMindState {
    const existing = this.worldStateManager.getNpcMindState(npcId);
    const migrated = migrateNpcMindState(existing, npcId, absoluteGameMinutes);
    if (!existing || !existing.ontology) this.worldStateManager.registerNpcMindState(migrated);
    return migrated;
  }

  private applyEvents(npcId: string, events: OntologyEvent[], absoluteGameMinutes: number): NpcMindState {
    const mind = this.ensureMind(npcId, absoluteGameMinutes);
    const ontology = normalizeOntology(mind.ontology, npcId, absoluteGameMinutes);
    for (const event of events) {
      if (event.kind === 'claim') {
        const id = compactId(event.id || eventId('claim', [event.subject, event.predicate, String(event.object)]));
        const previous = ontology.claims[id];
        ontology.claims[id] = {
          id,
          subject: String(event.subject || previous?.subject || 'unknown'),
          predicate: String(event.predicate || previous?.predicate || 'related_to'),
          object: event.object ?? previous?.object ?? '',
          confidence: Math.max(previous?.confidence ?? 0, clamp01(event.confidence, 0.55)),
          source: String(event.source || previous?.source || 'runtime'),
          evidenceKeys: [...new Set([...(previous?.evidenceKeys ?? []), ...(event.evidenceKeys ?? [])])].slice(-12),
          tags: [...new Set([...(previous?.tags ?? []), ...(event.tags ?? [])])].slice(0, 12),
          worldId: event.worldId ?? previous?.worldId,
          x: event.x ?? previous?.x,
          y: event.y ?? previous?.y,
          createdAtGameMinute: previous?.createdAtGameMinute ?? absoluteGameMinutes,
          lastConfirmedGameMinute: event.lastConfirmedGameMinute ?? absoluteGameMinutes,
          expiresAtGameMinute: event.expiresAtGameMinute ?? previous?.expiresAtGameMinute,
          status: event.status ?? previous?.status ?? 'active',
        };
      } else if (event.kind === 'episode') {
        const id = compactId(event.id || eventId('episode', [event.eventType, absoluteGameMinutes]));
        ontology.episodes[id] = {
          id,
          eventType: String(event.eventType || 'event'),
          summary: String(event.summary || ''),
          source: String(event.source || 'runtime'),
          toolName: event.toolName,
          actionType: event.actionType,
          ok: event.ok,
          tags: event.tags ?? [],
          worldId: event.worldId,
          x: event.x,
          y: event.y,
          absoluteGameMinutes: event.absoluteGameMinutes ?? absoluteGameMinutes,
          data: event.data,
        };
      } else if (event.kind === 'affordance') {
        const id = compactId(event.id || eventId('affordance', [event.subject, event.action, event.trigger]));
        ontology.affordances[id] = {
          id,
          subject: String(event.subject || 'unknown'),
          action: String(event.action || 'inspect'),
          targetId: event.targetId,
          trigger: event.trigger,
          confidence: clamp01(event.confidence, 0.6),
          source: String(event.source || 'runtime'),
          claimIds: event.claimIds ?? [],
          worldId: event.worldId,
          x: event.x,
          y: event.y,
          updatedAtGameMinute: event.updatedAtGameMinute ?? absoluteGameMinutes,
        };
      }
    }
    ontology.claims = newestRecord(ontology.claims, MAX_CLAIMS, 'lastConfirmedGameMinute');
    ontology.episodes = newestRecord(ontology.episodes, MAX_EPISODES, 'absoluteGameMinutes');
    ontology.affordances = newestRecord(ontology.affordances, MAX_AFFORDANCES, 'updatedAtGameMinute');
    ontology.lastUpdatedGameMinute = absoluteGameMinutes;
    this.worldStateManager.patchNpcMindState(npcId, { ontology });
    return this.worldStateManager.getNpcMindState(npcId) ?? { ...mind, ontology };
  }

  private eventsForDrop(drop: PerceivedDrop, absoluteGameMinutes: number): OntologyEvent[] {
    const edible = getFoodHungerRestore(drop.itemId) > 0;
    const subject = `drop:${drop.id || `${drop.itemId}:${drop.x}:${drop.y}`}`;
    const claimId = eventId('visible_drop', [drop.worldId, drop.id || drop.itemId, Math.round(drop.x), Math.round(drop.y)]);
    return [
      {
        kind: 'claim',
        id: claimId,
        subject,
        predicate: 'visible_item',
        object: `item:${drop.itemId}`,
        confidence: 0.68,
        source: 'runtime_perception',
        tags: edible ? ['drop', 'item', 'food'] : ['drop', 'item'],
        worldId: drop.worldId,
        x: drop.x,
        y: drop.y,
        expiresAtGameMinute: absoluteGameMinutes + 90,
        lastConfirmedGameMinute: absoluteGameMinutes,
      },
      ...(edible ? [{
        kind: 'affordance' as const,
        id: eventId('pickup_edible_drop', [drop.id || drop.itemId]),
        subject,
        action: 'pickup_item',
        targetId: drop.id,
        trigger: 'hunger_low',
        confidence: 0.68,
        source: 'runtime_perception',
        claimIds: [claimId],
        worldId: drop.worldId,
        x: drop.x,
        y: drop.y,
        updatedAtGameMinute: absoluteGameMinutes,
      }] : []),
    ];
  }

  private eventsForObject(objectItem: PerceivedObject, absoluteGameMinutes: number): OntologyEvent[] {
    const events: OntologyEvent[] = [{
      kind: 'claim',
      id: eventId('visible_object', [objectItem.worldId, objectItem.id || objectItem.type]),
      subject: `object:${objectItem.id || objectItem.type}`,
      predicate: 'is_a',
      object: objectItem.type,
      confidence: 0.64,
      source: 'runtime_perception',
      tags: ['object', objectItem.type],
      worldId: objectItem.worldId,
      x: objectItem.x,
      y: objectItem.y,
      lastConfirmedGameMinute: absoluteGameMinutes,
      expiresAtGameMinute: objectItem.type === 'tree' ? undefined : absoluteGameMinutes + 180,
    }];
    if (objectItem.type === 'tree' && objectItem.meta?.hasFruit === true) {
      const subject = `place:${objectItem.worldId}:${objectItem.id || `${Math.round(objectItem.x)},${Math.round(objectItem.y)}`}`;
      const claimId = eventId('food_source', [objectItem.worldId, objectItem.id || objectItem.x, objectItem.y]);
      events.push({
        kind: 'claim',
        id: claimId,
        subject,
        predicate: 'can_satisfy',
        object: 'need:hunger',
        confidence: 0.7,
        source: 'runtime_perception',
        tags: ['food', 'fruit_tree', 'hunger'],
        worldId: objectItem.worldId,
        x: objectItem.x,
        y: objectItem.y,
        lastConfirmedGameMinute: absoluteGameMinutes,
      }, {
        kind: 'affordance',
        id: eventId('pick_fruit_affordance', [objectItem.worldId, objectItem.id || objectItem.x, objectItem.y]),
        subject,
        action: 'pick_fruit',
        targetId: objectItem.id,
        trigger: 'hunger_low',
        confidence: 0.72,
        source: 'runtime_perception',
        claimIds: [claimId],
        worldId: objectItem.worldId,
        x: objectItem.x,
        y: objectItem.y,
        updatedAtGameMinute: absoluteGameMinutes,
      });
    }
    return events;
  }
}
