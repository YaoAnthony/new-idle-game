/**
 * AnimationRegistry — registers all Phaser animations at scene create time.
 *
 * Player spritesheet layout (entity/player/player.png, 384×1152, 8×24 @ 48px):
 *   rows  1– 4 = idle   — down/up/right/left
 *   rows  5– 8 = walk   — down/up/right/left
 *   rows  9–12 = jump   — down/up/right/left
 *   rows 13–16 = scythe — down/up/right/left
 *   rows 17–20 = axe    — down/up/right/left
 *   rows 21–24 = water  — down/up/right/left
 *
 * Tool icon layout (Basic tools and meterials.png, 16px grid):
 *   icon 1 (x=0)  = water can
 *   icon 2 (x=16) = axe
 *   icon 3 (x=32) = scythe
 *
 * Chicken spritesheet (Free Chicken Sprites.png, 64×32, 4×2 @ 16px):
 *   row 0 frames 0–3 = walk
 */

import Phaser from 'phaser';

const PLAYER_SHEET_COLS = 8;
const PLAYER_SHEET_DIRECTIONS = ['down', 'up', 'right', 'left'] as const;

function rowFrames(rowNumber: number): { start: number; end: number } {
  const start = (rowNumber - 1) * PLAYER_SHEET_COLS;
  return { start, end: start + PLAYER_SHEET_COLS - 1 };
}

export function registerAnimations(scene: Phaser.Scene): void {
  // ── Character movement ──────────────────────────────────────────────────
  PLAYER_SHEET_DIRECTIONS.forEach((dir, index) => {
    const idle = rowFrames(1 + index);
    const walk = rowFrames(5 + index);
    scene.anims.create({
      key:       `walk-${dir}`,
      frames:    scene.anims.generateFrameNumbers('player', walk),
      frameRate: 8,
      repeat:    -1,
    });
    scene.anims.create({
      key:       `idle-${dir}`,
      frames:    scene.anims.generateFrameNumbers('player', idle),
      frameRate: 4,
      repeat:    -1,
    });
  });

  // ── Jump (rows 9–12) ───────────────────────────────────────────────────
  PLAYER_SHEET_DIRECTIONS.forEach((dir, index) => {
    scene.anims.create({
      key:       `jump-${dir}`,
      frames:    scene.anims.generateFrameNumbers('player', rowFrames(9 + index)),
      frameRate: 10,
      repeat:    0,
    });
  });

  // ── Scythe swing (rows 13–16) ──────────────────────────────────────────
  PLAYER_SHEET_DIRECTIONS.forEach((dir, index) => {
    scene.anims.create({
      key:       `scythe-${dir}`,
      frames:    scene.anims.generateFrameNumbers('player', rowFrames(13 + index)),
      frameRate: 10,
      repeat:    0,
    });
  });

  // ── Axe chop (rows 17–20) ──────────────────────────────────────────────
  PLAYER_SHEET_DIRECTIONS.forEach((dir, index) => {
    scene.anims.create({
      key:       `axe-${dir}`,
      frames:    scene.anims.generateFrameNumbers('player', rowFrames(17 + index)),
      frameRate: 10,
      repeat:    0,
    });
  });

  // ── Water pour (rows 21–24) ────────────────────────────────────────────
  PLAYER_SHEET_DIRECTIONS.forEach((dir, index) => {
    scene.anims.create({
      key:       `water-${dir}`,
      frames:    scene.anims.generateFrameNumbers('player', rowFrames(21 + index)),
      frameRate: 10,
      repeat:    0,
    });
  });

  // ── Water tile (Water.png — 4 frames × 16px, 64×16) ───────────────────
  scene.anims.create({
    key:       'water-tile',
    frames:    scene.anims.generateFrameNumbers('water', { start: 0, end: 3 }),
    frameRate: 4,
    repeat:    -1,
  });

  // ── Chicken ────────────────────────────────────────────────────────────
  // Actual pixel data (64×32, 4×2 @ 16px):
  //   Row 0: frame 0 = walk-A (27px), frame 1 = walk-B (27px),
  //           frame 2 = EMPTY (0px),  frame 3 = EMPTY (0px)
  //   Row 1: frame 4 = idle-A (22px), frame 5 = idle-B (27px),
  //           frame 6 = idle-C (22px), frame 7 = idle-D (27px)
  //
  // Walk: alternate between the two real walk frames.
  // Idle: loop all four row-1 frames for a gentle head-bob.
  scene.anims.create({
    key:       'chicken-walk',
    frames:    scene.anims.generateFrameNumbers('chicken', { frames: [4, 5, 6, 5] }),
    frameRate: 8,
    repeat:    -1,
  });
  scene.anims.create({
    key:       'chicken-idle',
    frames:    scene.anims.generateFrameNumbers('chicken', { frames: [0, 1, 0, 1] }),
    frameRate: 3,
    repeat:    -1,
  });
}
