/**
 * SleepManager — Minecraft-style sleep-threshold system.
 *
 * threshold (0–1):
 *   0.0 → any 1 player sleeping skips the night  (default)
 *   0.5 → ≥50% of connected players must be sleeping
 *   1.0 → ALL players must be sleeping
 *
 * Solo play always skips night on the first sleeper regardless of threshold.
 *
 * Usage:
 *   1. Call trySleep(dayCycle)       when local player presses F on a bed.
 *   2. Call onRemoteSleepChange()    when a multiplayer peer sleep-event arrives.
 *   3. Call setTotalPlayers(n)       when peers join / leave.
 *   4. Call onMorning()              when a new day starts naturally.
 */

import type { DayCycle } from './DayCycle';
import { gameBus } from '../shared/EventBus';

// ─────────────────────────────────────────────────────────────────────────────
export class SleepManager {

  /** Fraction (0–1) of players that must be sleeping to skip night. */
  threshold: number;

  private _localSleeping  = false;
  /** Remote player IDs currently sleeping (keyed by peer ID). */
  private _remoteSleeping = new Set<string>();
  /** Total connected players (1 = solo). */
  private _totalPlayers   = 1;

  // ──────────────────────────────────────────────────────────────────────────
  constructor(threshold = 0) {
    this.threshold = threshold;
  }

  // ── Multiplayer sync ───────────────────────────────────────────────────────
  /** Update total player count when peers join or disconnect. */
  setTotalPlayers(n: number): void {
    this._totalPlayers = Math.max(1, n);
  }

  // ── Accessors ──────────────────────────────────────────────────────────────
  get totalPlayers():   number  { return this._totalPlayers; }
  get localSleeping():  boolean { return this._localSleeping; }

  get sleepingCount(): number {
    return (this._localSleeping ? 1 : 0) + this._remoteSleeping.size;
  }

  // ── Local player tries to sleep ───────────────────────────────────────────
  /**
   * Called when the local player presses F on a bed.
   * Returns a user-facing message string.
   */
  trySleep(dayCycle: DayCycle): string {
    if (!dayCycle.isNight()) {
      const msg = '🌞 现在还是白天，等天黑再睡吧...';
      gameBus.emit('ui:show_message', { text: msg });
      return msg;
    }
    if (this._localSleeping) {
      const msg = '💤 你已经在睡觉了...';
      gameBus.emit('ui:show_message', { text: msg });
      return msg;
    }

    this._localSleeping = true;
    gameBus.emit('world:sleep_state_changed', { sleeping: true });
    gameBus.emit('day:sleep_vote', { sleeping: this.sleepingCount, total: this._totalPlayers });

    if (this._checkThreshold()) {
      return this._skipNight(dayCycle);
    }

    const stillNeeded = this._neededCount() - this.sleepingCount;
    const msg = `💤 你已躺下睡觉... 还需要 ${stillNeeded} 位玩家入睡才能跳过黑夜`;
    gameBus.emit('ui:show_message', { text: msg });
    return msg;
  }

  // ── Remote player sleep event ─────────────────────────────────────────────
  /**
   * Called when a multiplayer peer sends a `player_sleep` event.
   * @param playerId  unique peer identifier
   * @param sleeping  true = laid down, false = woke up
   */
  onRemoteSleepChange(playerId: string, sleeping: boolean, dayCycle: DayCycle): void {
    if (sleeping) {
      this._remoteSleeping.add(playerId);
    } else {
      this._remoteSleeping.delete(playerId);
    }
    gameBus.emit('day:sleep_vote', { sleeping: this.sleepingCount, total: this._totalPlayers });

    if (sleeping && this._checkThreshold()) {
      this._skipNight(dayCycle);
    }
  }

  // ── Morning arrived naturally ─────────────────────────────────────────────
  /** Reset sleeping state at the start of a new day. */
  onMorning(): void {
    const wasSleeping   = this._localSleeping;
    this._localSleeping = false;
    this._remoteSleeping.clear();
    if (wasSleeping) gameBus.emit('world:sleep_state_changed', { sleeping: false });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Minimum sleepers needed.
   *   threshold=0 → 1 player (solo always skips)
   *   threshold=1 → all players
   */
  private _neededCount(): number {
    return Math.max(1, Math.ceil(this._totalPlayers * this.threshold));
  }

  private _checkThreshold(): boolean {
    return this.sleepingCount >= this._neededCount();
  }

  private _skipNight(dayCycle: DayCycle): string {
    // Accelerate time (20× speed) to 06:00 — not an instant jump
    dayCycle.accelerateToMorning();

    // Wake everyone up (onFastForwardComplete fires the arrival notification)
    const wasSleeping   = this._localSleeping;
    this._localSleeping = false;
    this._remoteSleeping.clear();
    if (wasSleeping) gameBus.emit('world:sleep_state_changed', { sleeping: false });

    const msg = '💤 进入梦乡... 时间加速到天明';
    gameBus.emit('ui:show_message', { text: msg });
    return msg;
  }
}
