/**
 * DayCycle — ambient-light and time system for the idle/exploration game.
 *
 * Inspired by Josh Morony's day-night cycle tutorial:
 * https://www.joshmorony.com/how-to-create-a-day-night-cycle-in-phaser/
 *
 * Technique (matching the tutorial's "sprite tint" approach):
 *   · Named time-of-day keyframes hold an overlay colour + alpha and a sky colour
 *   · Every frame, the two surrounding keyframes are found and linearly interpolated
 *   · Result is applied as:
 *       1. A full-screen fixed rectangle tinted to the ambient colour (overlay)
 *       2. Camera background colour for sky / ground-clear tint
 *       3. Direct tinting of any registered world sprites (grass, objects …)
 *
 * Public API:
 *   absoluteGameMinutes – elapsed in-game minutes (saved to / loaded from server)
 *   update(dt)        – advance time + repaint; call every game frame
 *   getTimeStr()      – "HH:MM" current in-game time string
 *   getDayProgress()  – 0…1, fraction through the 24-hour cycle
 *   registerSprites() – optional: world sprites to receive ambient tinting
 */

import Phaser from 'phaser';
import {
  MINS_PER_DAY,
  DEFAULT_ABSOLUTE_GAME_MINUTES,
} from '../constants';
import {
  advanceByRealSeconds,
  createDefaultGameTimeState,
  formatMinuteOfDay,
  setMinuteOfDay,
  toDateInfo,
  toDayCount,
  toMinuteOfDay,
} from '../time/GameTime';

// ─── Keyframe definition ──────────────────────────────────────────────────────
interface Keyframe {
  /** In-game minute; final keyframe may use MINS_PER_DAY for the wrap point. */
  minute: number;
  /** Overlay RGB (tints the entire screen). */
  r: number; g: number; b: number;
  /** Overlay opacity: 0 = no effect, 1 = fully opaque. */
  alpha: number;
  /** Camera background / sky RGB. */
  bgR: number; bgG: number; bgB: number;
}

// ─── Time-of-day keyframes ────────────────────────────────────────────────────
// Values between entries are linearly interpolated every frame.
// Tuning guide:
//   · Adjust `alpha`   to control darkness depth
//   · Adjust `r/g/b`   to set the hue of the ambient light
//   · Adjust `bgR/G/B` to set the camera-clear / sky colour
const KEYFRAMES: Keyframe[] = [
  //  minute   R    G    B   α     bgR bgG bgB     time
  { minute:    0, r:  4, g:  6, b: 32, alpha: 0.86, bgR:  2, bgG:  4, bgB: 16 }, // 00:00 deep night
  { minute:  180, r:  2, g:  3, b: 24, alpha: 0.93, bgR:  1, bgG:  2, bgB: 12 }, // 03:00 darkest
  { minute:  300, r: 10, g:  8, b: 40, alpha: 0.82, bgR:  5, bgG:  6, bgB: 24 }, // 05:00 pre-dawn
  { minute:  330, r: 72, g: 32, b: 18, alpha: 0.58, bgR: 24, bgG: 14, bgB: 16 }, // 05:30 first light
  { minute:  360, r:245, g:112, b: 35, alpha: 0.32, bgR: 62, bgG: 30, bgB: 14 }, // 06:00 sunrise
  { minute:  420, r:255, g:198, b:112, alpha: 0.09, bgR: 32, bgG: 56, bgB: 18 }, // 07:00 early morning
  { minute:  480, r:  0, g:  0, b:  0, alpha: 0.00, bgR: 22, bgG: 56, bgB: 15 }, // 08:00 full daylight
  { minute:  600, r:  0, g:  0, b:  0, alpha: 0.00, bgR: 18, bgG: 52, bgB: 14 }, // 10:00 noon
  { minute: 1020, r:  0, g:  0, b:  0, alpha: 0.00, bgR: 18, bgG: 52, bgB: 14 }, // 17:00 afternoon
  { minute: 1050, r:245, g:152, b: 45, alpha: 0.13, bgR: 46, bgG: 44, bgB: 12 }, // 17:30 pre-sunset
  { minute: 1080, r:255, g: 88, b: 25, alpha: 0.38, bgR: 58, bgG: 28, bgB:  8 }, // 18:00 sunset
  { minute: 1110, r:155, g: 44, b: 88, alpha: 0.66, bgR: 28, bgG: 12, bgB: 24 }, // 18:30 dusk
  { minute: 1140, r: 52, g: 20, b: 96, alpha: 0.78, bgR: 10, bgG:  8, bgB: 34 }, // 19:00 evening
  { minute: 1200, r: 10, g:  8, b: 48, alpha: 0.84, bgR:  4, bgG:  6, bgB: 24 }, // 20:00 night
  { minute: 1320, r:  4, g:  6, b: 32, alpha: 0.86, bgR:  2, bgG:  4, bgB: 16 }, // 22:00 deep night
  { minute: MINS_PER_DAY, r:  4, g:  6, b: 32, alpha: 0.86, bgR:  2, bgG:  4, bgB: 16 }, // 24:00 ≡ 00:00
];

// ─── Night / morning boundaries ──────────────────────────────────────────────
/** In-game minute at which night begins (19:00). */
const NIGHT_START    = 1140;
/** In-game minute at which morning begins (06:00). */
const MORNING_MINUTE = 360;

// ─── Linear interpolation helper ──────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ─── Interpolate between the two keyframes surrounding a given minute ─────────
function interpolateKeyframes(minute: number): Keyframe {
  // Default: wrap correctly within the keyframe list
  let lo = KEYFRAMES[0];
  let hi = KEYFRAMES[KEYFRAMES.length - 1];

  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (minute >= KEYFRAMES[i].minute && minute < KEYFRAMES[i + 1].minute) {
      lo = KEYFRAMES[i];
      hi = KEYFRAMES[i + 1];
      break;
    }
  }

  const span = hi.minute - lo.minute;
  const t    = span > 0 ? (minute - lo.minute) / span : 0;

  return {
    minute,
    r:     Math.round(lerp(lo.r,     hi.r,     t)),
    g:     Math.round(lerp(lo.g,     hi.g,     t)),
    b:     Math.round(lerp(lo.b,     hi.b,     t)),
    alpha:              lerp(lo.alpha, hi.alpha, t),
    bgR:   Math.round(lerp(lo.bgR,   hi.bgR,   t)),
    bgG:   Math.round(lerp(lo.bgG,   hi.bgG,   t)),
    bgB:   Math.round(lerp(lo.bgB,   hi.bgB,   t)),
  };
}

// ─── DayCycle class ───────────────────────────────────────────────────────────
export class DayCycle {

  // ── Public state ─────────────────────────────────────────────────────────
  /** Elapsed in-game minutes since the game epoch (this value is persisted to the server). */
  absoluteGameMinutes = DEFAULT_ABSOLUTE_GAME_MINUTES;

  /**
   * Fired once when a fast-forward completes and clock snaps to morning.
   * GameScene sets this to wire up sleep manager + React notifications.
   */
  onFastForwardComplete: (() => void) | null = null;

  // ── Fast-forward (sleep) ──────────────────────────────────────────────────
  /** Target absoluteGameMinutes for fast-forward; null = normal speed. */
  private _fastForwardTarget: number | null = null;
  /** How many times faster than real-time to advance when sleeping. */
  readonly FAST_FORWARD_RATE = 20;

  // ── Private Phaser objects ────────────────────────────────────────────────
  private readonly overlay: Phaser.GameObjects.Rectangle;
  private readonly camera:  Phaser.Cameras.Scene2D.Camera;
  /** World sprites that should be tinted with the ambient light colour. */
  private readonly tinted: Phaser.GameObjects.GameObject[] = [];
  private lightingEnabled = true;

  // ─────────────────────────────────────────────────────────────────────────
  constructor(scene: Phaser.Scene, initialAbsoluteGameMinutes = DEFAULT_ABSOLUTE_GAME_MINUTES) {
    this.absoluteGameMinutes = initialAbsoluteGameMinutes;
    this.camera   = scene.cameras.main;

    // Full-screen ambient overlay — fixed to camera, always on top of world
    const { width, height } = scene.scale;
    this.overlay = scene.add
      .rectangle(0, 0, width * 4, height * 4, 0x000000, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(9800);               // below speech bubbles (9998/9999)

    // Apply initial colour immediately so there is no single-frame white flash
    this._applyKeyframe(interpolateKeyframes(this._currentMinute()));
  }

  // ── Optional sprite registration ─────────────────────────────────────────
  /**
   * Register world-layer sprites (ground tiles, objects, etc.) to receive
   * direct ambient tinting — the tutorial's core technique.
   * Characters / UI elements should NOT be registered here.
   */
  registerSprites(sprites: Phaser.GameObjects.GameObject[]): void {
    this.tinted.push(...sprites);
  }

  setLightingEnabled(enabled: boolean): void {
    if (this.lightingEnabled === enabled) return;
    this.lightingEnabled = enabled;
    this._applyKeyframe(interpolateKeyframes(this._currentMinute()));
  }

  // ── Fast-forward API ──────────────────────────────────────────────────────
  /** True while the clock is running at FAST_FORWARD_RATE speed. */
  get isAccelerating(): boolean { return this._fastForwardTarget !== null; }

  /**
   * Begin fast-forwarding to the next 06:00 at FAST_FORWARD_RATE × speed.
   * Does nothing if already fast-forwarding or if it's already morning.
   */
  accelerateToMorning(): void {
    if (this._fastForwardTarget !== null) return;
    const curMinute   = this._currentMinute();
    const day         = toDayCount(this.absoluteGameMinutes);
    const targetDay   = curMinute < MORNING_MINUTE ? day : day + 1;
    this._fastForwardTarget = targetDay * MINS_PER_DAY + MORNING_MINUTE;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────
  /** Advance time by `dt` real seconds and repaint the ambient light. */
  update(dt: number): void {
    if (this._fastForwardTarget !== null) {
      const nextMinute = advanceByRealSeconds(this.absoluteGameMinutes, dt, this.FAST_FORWARD_RATE);
      if (nextMinute >= this._fastForwardTarget) {
        // Arrived at morning — snap exactly and stop
        this.absoluteGameMinutes           = this._fastForwardTarget;
        this._fastForwardTarget = null;
        this._applyKeyframe(interpolateKeyframes(this._currentMinute()));
        this.onFastForwardComplete?.();
        return;
      }
      this.absoluteGameMinutes = nextMinute;
    } else {
      this.absoluteGameMinutes = advanceByRealSeconds(this.absoluteGameMinutes, dt);
    }
    this._applyKeyframe(interpolateKeyframes(this._currentMinute()));
  }

  // ── Public getters ────────────────────────────────────────────────────────
  /** Returns the current in-game time as "HH:MM". */
  getTimeStr(): string {
    return formatMinuteOfDay(this.getCurrentMinute());
  }

  /** Returns the fraction of the 24-hour cycle elapsed (0 = midnight, 0.5 = noon). */
  getDayProgress(): number {
    return this._currentMinute() / MINS_PER_DAY;
  }

  /** Returns the current in-game minute of the day. Public so schedule systems can dispatch routines. */
  getCurrentMinute(): number {
    return Math.floor(this._currentMinute());
  }

  /** Integer day count since the game epoch (2026-01-01 = day 0). */
  getDayCount(): number {
    return toDayCount(this.absoluteGameMinutes);
  }

  /**
   * Resolve the full in-game calendar from absoluteGameMinutes.
   * Uses JS Date for proper month length / leap year arithmetic.
   * Returns: { year, month (1-12), day (1-31), hour (0-23), minute (0-59), dayOfWeek (0=Sunday) }
   */
  getDateInfo(): {
    year: number; month: number; day: number;
    hour: number; minute: number; dayOfWeek: number; dayCount: number;
  } {
    return toDateInfo(this.absoluteGameMinutes, createDefaultGameTimeState().epoch);
  }

  /** "YYYY-MM-DD" using the in-game date. */
  getDateStr(): string {
    const d = this.getDateInfo();
    return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
  }

  /** "YYYY-MM-DD HH:MM" — primary HUD format. */
  getDateTimeStr(): string {
    const d = this.getDateInfo();
    return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')} ` +
           `${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}`;
  }

  /**
   * Jump the in-game clock to a specific minute of the day.
   * Preserves the integer day count so only the time-of-day changes.
   */
  setTimeOfDay(minute: number): void {
    this.absoluteGameMinutes = setMinuteOfDay(this.absoluteGameMinutes, minute);
  }

  /**
   * Returns true when the current in-game time counts as "night":
   *   19:00 (min 1140) → 06:00 (min 360), i.e. dusk through dawn.
   */
  isNight(): boolean {
    const m = this._currentMinute();
    return m >= NIGHT_START || m < MORNING_MINUTE;
  }

  /**
   * Fast-forward the clock to the next 06:00 (in-game morning).
   * - If it's before 06:00 today, snaps to today's 06:00.
   * - Otherwise snaps to tomorrow's 06:00.
   * Returns the in-game minutes skipped (useful for saving state).
   */
  skipToMorning(): number {
    const curMinute   = this._currentMinute();
    const day         = toDayCount(this.absoluteGameMinutes);
    const targetDay   = curMinute < MORNING_MINUTE ? day : day + 1;
    const targetMinute = targetDay * MINS_PER_DAY + MORNING_MINUTE;
    const skipped      = targetMinute - this.absoluteGameMinutes;
    this.absoluteGameMinutes = targetMinute;
    this._applyKeyframe(interpolateKeyframes(MORNING_MINUTE));
    return skipped;
  }

  // ── Private helpers ───────────────────────────────────────────────────────
  private _currentMinute(): number {
    return toMinuteOfDay(this.absoluteGameMinutes);
  }

  private _applyKeyframe(kf: Keyframe): void {
    const alpha = this.resolveOverlayAlpha(kf.alpha);
    // 1. Screen-space overlay (colour + transparency)
    const overlayColor = Phaser.Display.Color.GetColor(kf.r, kf.g, kf.b);
    this.overlay.setFillStyle(overlayColor, alpha);

    // 2. Camera background colour (visible in empty/black border areas)
    this.camera.setBackgroundColor(
      Phaser.Display.Color.GetColor(kf.bgR, kf.bgG, kf.bgB),
    );

    // 3. Registered world-sprite tinting (Josh Morony technique)
    if (this.tinted.length > 0) {
      const tintKeyframe = { ...kf, alpha };
      const tintHex = alpha < 0.02
        ? 0xffffff   // full daylight → no tint change
        : this._spriteTint(tintKeyframe);
      for (const obj of this.tinted) {
        (obj as Phaser.GameObjects.Sprite).setTint(tintHex);
      }
    }
  }

  private resolveOverlayAlpha(alpha: number): number {
    if (this.lightingEnabled) return alpha;
    return Math.min(alpha, 0.36);
  }

  /**
   * Compute the ambient sprite-tint colour by blending from white (full day)
   * towards the overlay hue (night/dawn/dusk).  Keeps sprites readable.
   */
  private _spriteTint(kf: Keyframe): number {
    const t = Math.min(kf.alpha * 0.9, 1);
    return Phaser.Display.Color.GetColor(
      Math.round(lerp(255, kf.r, t)),
      Math.round(lerp(255, kf.g, t)),
      Math.round(lerp(255, kf.b, t)),
    );
  }
}
