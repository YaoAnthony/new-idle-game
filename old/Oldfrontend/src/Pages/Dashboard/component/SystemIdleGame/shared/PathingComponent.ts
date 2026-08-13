/**
 * PathingComponent — reusable A* waypoint navigation.
 *
 * Encapsulates the ~30 lines of duplicated waypoint-following code that
 * previously existed in both Npc.ts and Chicken.ts.
 *
 * Usage:
 *   const pathing = new PathingComponent(speed, reachDist, pathfinder);
 *
 *   // Navigate to world-coordinate target:
 *   pathing.navigateTo(sprite.x, sprite.y, tx, ty, () => doOnArrive());
 *
 *   // Call every frame from update():
 *   const status = pathing.update(sprite, scene); // 'moving' | 'arrived' | 'idle' | 'failed'
 */

import Phaser from 'phaser';
import type { Pathfinder } from '../systems/Pathfinder';

export type PathingStatus = 'moving' | 'arrived' | 'idle' | 'failed';

export class PathingComponent {
  private waypoints:         [number, number][] = [];
  private onArriveCallback:  (() => void) | null = null;
  private _status:           PathingStatus = 'idle';
  private lastDistance       = Infinity;
  private lastProgressAt     = 0;
  private navigationStartedAt = 0;
  private target: { x: number; y: number } | null = null;
  private replanAttempts = 0;
  private lastReplanAt = 0;
  private replanEnabled = true;
  private nearestReachableRadiusPx: number | null = null;

  private static readonly STUCK_MS = 3_500;
  private static readonly MAX_NAVIGATION_MS = 30_000;
  private static readonly MAX_REPLANS = 4;
  private static readonly REPLAN_COOLDOWN_MS = 700;
  private static readonly PROGRESS_EPSILON = 2;
  private static readonly INTERMEDIATE_WAYPOINT_REACH_DIST = 4;

  constructor(
    private readonly speed:     number,
    private readonly reachDist: number,
    private readonly pathfinder: Pathfinder | null,
  ) {}

  // ── Navigation ─────────────────────────────────────────────────────────────

  /**
   * Start navigating from (fromX, fromY) toward (tx, ty).
   * Uses the Pathfinder if available; falls back to direct movement.
   */
  navigateTo(
    fromX:    number,
    fromY:    number,
    tx:       number,
    ty:       number,
    onArrive?: () => void,
  ): void {
    this.onArriveCallback = onArrive ?? null;
    this.waypoints = [];
    this.lastDistance = Infinity;
    this.lastProgressAt = 0;
    this.navigationStartedAt = 0;
    this.target = { x: tx, y: ty };
    this.replanAttempts = 0;
    this.lastReplanAt = 0;
    this.replanEnabled = true;
    this.nearestReachableRadiusPx = null;

    if (this.pathfinder) {
      const path = this.pathfinder.findPath(fromX, fromY, tx, ty);
      if (path.length > 0) {
        this.waypoints = path;
        this._status = 'moving';
        return;
      }
      this.fail();
      return;
    }
    // Direct fallback: single waypoint at target
    this.waypoints = [[tx, ty]];
    this._status   = 'moving';
  }

  /**
   * Navigate toward a target, but if the exact target is sealed off by fences or
   * other blockers, settle for the nearest reachable cell around it.
   */
  navigateToNearestReachable(
    fromX:    number,
    fromY:    number,
    tx:       number,
    ty:       number,
    maxRadiusPx: number,
    onArrive?: () => void,
  ): void {
    this.onArriveCallback = onArrive ?? null;
    this.waypoints = [];
    this.lastDistance = Infinity;
    this.lastProgressAt = 0;
    this.navigationStartedAt = 0;
    this.target = { x: tx, y: ty };
    this.replanAttempts = 0;
    this.lastReplanAt = 0;
    this.replanEnabled = true;
    this.nearestReachableRadiusPx = Math.max(0, maxRadiusPx);

    if (this.pathfinder) {
      const path = this.pathfinder.findPathNearTarget(fromX, fromY, tx, ty, this.nearestReachableRadiusPx);
      if (path.waypoints.length > 0) {
        this.waypoints = path.waypoints;
        this._status = 'moving';
        return;
      }
      this.fail();
      return;
    }

    this.waypoints = [[tx, ty]];
    this._status = 'moving';
  }

  /**
   * Start direct waypoint navigation without consulting the global Pathfinder.
   * Useful for non-main worlds whose coordinates are outside WorldGrid.
   */
  navigateDirectTo(
    fromX:    number,
    fromY:    number,
    tx:       number,
    ty:       number,
    onArrive?: () => void,
  ): void {
    void fromX;
    void fromY;
    this.onArriveCallback = onArrive ?? null;
    this.waypoints = [[tx, ty]];
    this.lastDistance = Infinity;
    this.lastProgressAt = 0;
    this.navigationStartedAt = 0;
    this.target = { x: tx, y: ty };
    this.replanAttempts = 0;
    this.lastReplanAt = 0;
    this.replanEnabled = false;
    this.nearestReachableRadiusPx = null;
    this._status = 'moving';
  }

  /**
   * Follow a precomputed waypoint path. Replanning is disabled because callers
   * may provide paths from a world-local navigator instead of the global grid.
   */
  navigateAlongWaypoints(waypoints: [number, number][], onArrive?: () => void): void {
    this.onArriveCallback = onArrive ?? null;
    this.waypoints = waypoints.map(([x, y]) => [x, y]);
    this.lastDistance = Infinity;
    this.lastProgressAt = 0;
    this.navigationStartedAt = 0;
    const last = this.waypoints[this.waypoints.length - 1];
    this.target = last ? { x: last[0], y: last[1] } : null;
    this.replanAttempts = 0;
    this.lastReplanAt = 0;
    this.replanEnabled = false;
    this.nearestReachableRadiusPx = null;
    this._status = this.waypoints.length > 0 ? 'moving' : 'idle';
  }

  /** Stop all navigation immediately. */
  clearNavigation(): void {
    this.waypoints        = [];
    this.onArriveCallback = null;
    this._status          = 'idle';
    this.lastDistance     = Infinity;
    this.lastProgressAt   = 0;
    this.navigationStartedAt = 0;
    this.target = null;
    this.replanAttempts = 0;
    this.lastReplanAt = 0;
    this.replanEnabled = true;
    this.nearestReachableRadiusPx = null;
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  /**
   * Advance toward the next waypoint and apply velocity to `sprite`.
   *
   * @param sprite  The arcade sprite to steer.
   * @param scene   Needed only for the optional arrive-delay callback.
   * @param arriveDelay  Extra ms delay before firing the arrive callback (0 = immediate).
   * @returns  'moving' | 'arrived' (fired exactly once per arrival) | 'idle' | 'failed'
   */
  update(
    sprite:       Phaser.Physics.Arcade.Sprite,
    scene:        Phaser.Scene,
    arriveDelay = 0,
    speedMultiplier = 1,
  ): PathingStatus {
    if (this.waypoints.length === 0) {
      sprite.setVelocity(0, 0);
      return this._status;
    }

    const now = scene.time.now;
    if (this.navigationStartedAt === 0) {
      this.navigationStartedAt = now;
      this.lastProgressAt = now;
    }

    const [wx, wy] = this.waypoints[0];
    const dx = wx - sprite.x;
    const dy = wy - sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const waypointReachDist = this.waypoints.length > 1
      ? Math.min(this.reachDist, PathingComponent.INTERMEDIATE_WAYPOINT_REACH_DIST)
      : this.reachDist;

    if (dist < waypointReachDist) {
      this.lastDistance = Infinity;
      this.lastProgressAt = now;
      this.waypoints.shift();
      if (this.waypoints.length === 0) {
        sprite.setVelocity(0, 0);
        this._status = 'arrived';

        const cb = this.onArriveCallback;
        this.onArriveCallback = null;
        if (cb) {
          if (arriveDelay > 0) {
            scene.time.delayedCall(arriveDelay, cb);
          } else {
            cb();
          }
        }
        return 'arrived';
      }
      sprite.setVelocity(0, 0);
      this._status = 'moving';
    } else if (this.isStuck(dist, now)) {
      if (this.tryReplan(sprite.x, sprite.y, now)) {
        sprite.setVelocity(0, 0);
        this._status = 'moving';
        return 'moving';
      }
      sprite.setVelocity(0, 0);
      this.fail();
      return 'failed';
    } else {
      sprite.setVelocity(
        (dx / dist) * this.speed * Math.max(0.1, speedMultiplier),
        (dy / dist) * this.speed * Math.max(0.1, speedMultiplier),
      );
      this._status = 'moving';
    }

    return this._status;
  }

  /** True while there are remaining waypoints. */
  isMoving(): boolean { return this.waypoints.length > 0; }

  /** Remaining waypoints, exposed for debug rendering. */
  getWaypoints(): [number, number][] {
    return this.waypoints.map(([x, y]) => [x, y]);
  }

  /** Current navigation status (does not advance state). */
  get status(): PathingStatus { return this._status; }

  private isStuck(dist: number, now: number): boolean {
    if (this.navigationStartedAt > 0 && now - this.navigationStartedAt > PathingComponent.MAX_NAVIGATION_MS) {
      return true;
    }

    if (dist < this.lastDistance - PathingComponent.PROGRESS_EPSILON) {
      this.lastDistance = dist;
      this.lastProgressAt = now;
      return false;
    }

    if (this.lastDistance === Infinity) {
      this.lastDistance = dist;
      this.lastProgressAt = now;
      return false;
    }

    return now - this.lastProgressAt > PathingComponent.STUCK_MS;
  }

  private tryReplan(fromX: number, fromY: number, now: number): boolean {
    if (!this.replanEnabled || !this.pathfinder || !this.target) return false;
    if (this.replanAttempts >= PathingComponent.MAX_REPLANS) return false;
    if (now - this.lastReplanAt < PathingComponent.REPLAN_COOLDOWN_MS) return true;

    const path = this.nearestReachableRadiusPx === null
      ? { waypoints: this.pathfinder.findPath(fromX, fromY, this.target.x, this.target.y) }
      : this.pathfinder.findPathNearTarget(fromX, fromY, this.target.x, this.target.y, this.nearestReachableRadiusPx);
    if (path.waypoints.length === 0) return false;

    this.waypoints = path.waypoints;
    this.replanAttempts += 1;
    this.lastReplanAt = now;
    this.lastDistance = Infinity;
    this.lastProgressAt = now;
    this.navigationStartedAt = now;
    this._status = 'moving';
    return true;
  }

  private fail(): void {
    this.waypoints = [];
    this.onArriveCallback = null;
    this._status = 'failed';
    this.lastDistance = Infinity;
    this.lastProgressAt = 0;
    this.navigationStartedAt = 0;
    this.target = null;
    this.replanAttempts = 0;
    this.lastReplanAt = 0;
    this.replanEnabled = true;
    this.nearestReachableRadiusPx = null;
  }
}
