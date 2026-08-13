import Phaser from 'phaser';
import { fallbackTintForItem, fallbackTintForVisualKey, getItemVisual, getVisual, type GameVisual } from './GameVisualRegistry';

const DISPLAY_SIZE = 24;
const SRC_SIZE = 16;

export function ensureItemTexture(
  scene: Phaser.Scene,
  itemId: string,
  options: { namespace?: string; size?: number; fallbackTint?: number } = {},
): string {
  const visual = getItemVisual(itemId);
  return ensureVisualTexture(scene, visual, {
    namespace: options.namespace ?? 'item',
    id: itemId,
    size: options.size,
    fallbackTint: options.fallbackTint ?? fallbackTintForItem(itemId),
  });
}

export function ensureVisualKeyTexture(
  scene: Phaser.Scene,
  visualKey: string,
  options: { namespace?: string; size?: number; fallbackTint?: number } = {},
): string {
  const visual = getVisual(visualKey);
  return ensureVisualTexture(scene, visual, {
    namespace: options.namespace ?? 'visual',
    id: visualKey.replace(/[^a-z0-9_-]/gi, '-'),
    size: options.size,
    fallbackTint: options.fallbackTint ?? fallbackTintForVisualKey(visualKey),
  });
}

export function ensureVisualTexture(
  scene: Phaser.Scene,
  visual: GameVisual | null,
  options: { namespace: string; id: string; size?: number; fallbackTint?: number },
): string {
  const key = `${options.namespace}:${options.id}`;
  if (scene.textures.exists(key)) return key;

  const size = Math.max(1, options.size ?? DISPLAY_SIZE);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    scene.textures.addCanvas(key, canvas);
    return key;
  }
  ctx.imageSmoothingEnabled = false;

  if (visual?.mode === 'sheet' && scene.textures.exists(visual.textureKey)) {
    const source = scene.textures.get(visual.textureKey).getSourceImage() as CanvasImageSource;
    ctx.drawImage(source, visual.x, visual.y, visual.w ?? SRC_SIZE, visual.h ?? SRC_SIZE, 0, 0, size, size);
  } else if (visual?.mode === 'image' && scene.textures.exists(visual.textureKey)) {
    const source = scene.textures.get(visual.textureKey).getSourceImage() as CanvasImageSource & { width?: number; height?: number };
    const width = Math.max(1, Number(source.width ?? size));
    const height = Math.max(1, Number(source.height ?? size));
    const scale = Math.min(size / width, size / height);
    const drawW = width * scale;
    const drawH = height * scale;
    ctx.drawImage(source, 0, 0, width, height, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH);
  } else {
    drawTintFallback(ctx, size, visual?.mode === 'tint' ? visual.tint : options.fallbackTint ?? 0xdddddd);
  }

  scene.textures.addCanvas(key, canvas);
  return key;
}

function drawTintFallback(ctx: CanvasRenderingContext2D, size: number, tint: number): void {
  const r = (tint >> 16) & 0xff;
  const g = (tint >> 8) & 0xff;
  const b = tint & 0xff;
  const center = size / 2;
  ctx.fillStyle = `rgba(${r},${g},${b},0.92)`;
  ctx.beginPath();
  ctx.arc(center, center, center - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(center - 3, center - 3, Math.max(2, size / 6), 0, Math.PI * 2);
  ctx.fill();
}
