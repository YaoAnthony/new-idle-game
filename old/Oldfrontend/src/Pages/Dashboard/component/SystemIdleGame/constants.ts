/** Game-wide constants for the idle game. */
import {
  DEFAULT_ABSOLUTE_GAME_MINUTES,
  GAME_EPOCH_DAY,
  GAME_EPOCH_MONTH,
  GAME_EPOCH_YEAR,
  GAME_MINUTES_PER_REAL_SECOND,
  MINS_PER_DAY,
  REAL_SECONDS_PER_GAME_DAY,
  REAL_SECONDS_PER_GAME_MINUTE,
} from '@timeplan-game/core/game/time';

// ─── World ────────────────────────────────────────────────────────────────────
export const WORLD_W      = 1920;  // 60 tiles × 32px
export const WORLD_H      = 1280;  // 40 tiles × 32px
export const SPAWN_X      = 240;   // in front of player's house door
export const SPAWN_Y      = 360;

// ─── Camera / rendering ───────────────────────────────────────────────────────
export const ZOOM         = 2.0;
export const OBJ_SCALE    = 2;   // all map-objects are drawn at 2× source pixels

// ─── Physics ─────────────────────────────────────────────────────────────────
export const NPC_SPEED    = 70;

// ─── Sprite-sheet frame sizes ─────────────────────────────────────────────────
export const CHAR_FRAME_W   = 48;   // Basic Charakter Spritesheet.png
export const CHAR_FRAME_H   = 48;
export const ACTION_FRAME_W = 48;   // Basic Charakter Actions.png
export const ACTION_FRAME_H = 48;
export const CHICK_FRAME_W  = 16;   // Free Chicken Sprites.png
export const CHICK_FRAME_H  = 16;
export const CHEST_FRAME_W  = 48;   // Chest.png (240×96, 5 cols × 2 rows @ 48px)
export const CHEST_FRAME_H  = 48;   // row 0 = front/down opening, row 1 = left-facing opening
export const TOOL_ICON_SIZE = 16;   // Basic tools and meterials.png

export const NEST_FRAME_W  = 16;   // Egg_And_Nest.png
export const NEST_FRAME_H  = 16;

// ─── Chest ────────────────────────────────────────────────────────────────────
/** Pixel radius within which the player can interact with a chest. */
export const CHEST_INTERACT_RADIUS = 80;

// ─── Nest ─────────────────────────────────────────────────────────────────────
export const NEST_INTERACT_RADIUS     = 60;

// ─── Chicken AI ───────────────────────────────────────────────────────────────
export const CHICKEN_SPEED            = 50;   // px/s when navigating
export const CHICKEN_THIRST_INTERVAL_GAME_MINUTES = 25;
export const CHICKEN_THIRST_PER_INTERVAL  = 10;   // thirst added per interval
export const CHICKEN_THIRST_THRESHOLD = 80;   // triggers water-seeking
export const CHICKEN_GROWTH_PER_DRINK = 20;   // growth added per drink
export const CHICKEN_GROWTH_THRESHOLD = 100;  // triggers nest-seeking
export const CHICKEN_DRINK_GAME_MINUTES = 15;
export const CHICKEN_LAY_GAME_MINUTES   = 25;

// ─── Time ─────────────────────────────────────────────────────────────────────
export {
  DEFAULT_ABSOLUTE_GAME_MINUTES,
  GAME_EPOCH_DAY,
  GAME_EPOCH_MONTH,
  GAME_EPOCH_YEAR,
  GAME_MINUTES_PER_REAL_SECOND,
  MINS_PER_DAY,
  REAL_SECONDS_PER_GAME_DAY,
  REAL_SECONDS_PER_GAME_MINUTE,
};
export const DEFAULT_GAME_TIME_MINUTE = DEFAULT_ABSOLUTE_GAME_MINUTES % MINS_PER_DAY;

// ─── NPC AI ───────────────────────────────────────────────────────────────────
/** Real seconds between autonomous GPT think calls.
 *  Set very high — NPC autonomous thinking is disabled until RTK Query
 *  auth integration is complete.  Player-initiated chat still works fine. */
export const NPC_THINK_INTERVAL = 999999;
export const NPC_MAX_MEMORY     = 20;
export const NPC_AUTONOMOUS_THINK_INTERVAL = 6;
export const NPC_AUTONOMOUS_PAUSE_SECONDS  = 8;
export const NPC_MEMORY_RETENTION_TICKS    = 180;

// ─── Asset frame definitions (same pattern as ozguradmin/sprout-lands-portfolio)
// (x, y, w, h) in source PNG pixels
export const FRAMES = {
  // Grass.png — col 1 row 1 = plain fill (used by invisible collision blocks)
  grass1:   { src: 'grass',   x:  16, y: 16, w: 16, h: 16 },
  grass2:   { src: 'grass',   x:  32, y: 16, w: 16, h: 16 },
  // Water.png — 4-frame animation
  water0:   { src: 'water',   x:   0, y:  0, w: 16, h: 16 },
  water1:   { src: 'water',   x:  16, y:  0, w: 16, h: 16 },
  water2:   { src: 'water',   x:  32, y:  0, w: 16, h: 16 },
  water3:   { src: 'water',   x:  48, y:  0, w: 16, h: 16 },
  // Basic_Grass_Biom_things.png — trees, decorations
  treeA:    { src: 'objects', x:   0, y:  0, w: 32, h: 48 },
  treeB:    { src: 'objects', x:  32, y:  0, w: 32, h: 48 },
  bush:     { src: 'objects', x:  64, y:  0, w: 16, h: 16 },
  rock:     { src: 'objects', x:  80, y: 48, w: 16, h: 16 },
  flower1:  { src: 'objects', x:  96, y: 48, w: 16, h: 16 },
  flower2:  { src: 'objects', x: 112, y: 48, w: 16, h: 16 },
  flower3:  { src: 'objects', x: 128, y: 48, w: 16, h: 16 },
  // Wooden House.png
  house:    { src: 'house',   x:   0, y:  0, w: 112, h: 80 },
  // Hills.png — 9-patch island border tiles (each 16×16 px)
  // A=top-left  B=top-edge  C=top-right
  // D=left-edge             F=right-edge
  // G=bot-left  H=bot-edge  I=bot-right
  hillA: { src: 'hills', x:  0, y:  0, w: 16, h: 16 },
  hillB: { src: 'hills', x: 16, y:  0, w: 16, h: 16 },
  hillC: { src: 'hills', x: 32, y:  0, w: 16, h: 16 },
  hillD: { src: 'hills', x:  0, y: 16, w: 16, h: 16 },
  hillF: { src: 'hills', x: 32, y: 16, w: 16, h: 16 },
  hillG: { src: 'hills', x:  0, y: 32, w: 16, h: 16 },
  hillH: { src: 'hills', x: 16, y: 32, w: 16, h: 16 },
  hillI: { src: 'hills', x: 32, y: 32, w: 16, h: 16 },
} as const;
