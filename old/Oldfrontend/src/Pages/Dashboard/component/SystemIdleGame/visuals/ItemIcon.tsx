import React, { useEffect, useRef } from 'react';
import { getGameItemDefinition } from '../catalog/GameRuntimeCatalog';
import { fallbackTintForItem, fallbackTintForVisualKey, getItemVisual, getVisual } from './GameVisualRegistry';

const SRC_SIZE = 16;

function tintStyle(tint: number, size: number): React.CSSProperties {
  const r = (tint >> 16) & 0xff;
  const g = (tint >> 8) & 0xff;
  const b = tint & 0xff;
  return {
    width: size * 0.72,
    height: size * 0.72,
    background: `rgb(${r},${g},${b})`,
    border: '2px solid rgba(255,246,198,0.85)',
    borderRadius: 4,
    boxShadow: 'inset -3px -3px 0 rgba(0,0,0,0.22), inset 2px 2px 0 rgba(255,255,255,0.28)',
  };
}

export const ItemIcon: React.FC<{
  itemId?: string | null;
  visualKey?: string | null;
  size?: number;
  alt?: string;
}> = ({ itemId, visualKey, size = 32, alt }) => {
  const visual = visualKey ? getVisual(visualKey) : getItemVisual(itemId);
  const label = alt || (itemId ? getGameItemDefinition(itemId)?.nameZh ?? itemId : '');

  if (visual?.mode === 'sheet') {
    return <SpriteCanvas asset={visual.asset} x={visual.x} y={visual.y} w={visual.w ?? SRC_SIZE} h={visual.h ?? SRC_SIZE} size={size} />;
  }

  if (visual?.mode === 'image') {
    return (
      <img
        src={visual.asset}
        alt={label}
        width={size}
        height={size}
        style={{ imageRendering: 'pixelated', objectFit: 'contain', display: 'block' }}
      />
    );
  }

  const tint = visual?.mode === 'tint'
    ? visual.tint
    : visualKey
      ? fallbackTintForVisualKey(visualKey)
      : fallbackTintForItem(itemId);

  return <div aria-label={label} role={label ? 'img' : undefined} style={tintStyle(tint, size)} />;
};

const SpriteCanvas: React.FC<{ asset: string; x: number; y: number; w: number; h: number; size: number }> = ({
  asset,
  x,
  y,
  w,
  h,
  size,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = new Image();
    image.src = asset;
    image.onload = () => {
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, x, y, w, h, 0, 0, size, size);
    };
  }, [asset, h, size, w, x, y]);

  return <canvas ref={ref} width={size} height={size} style={{ imageRendering: 'pixelated', display: 'block' }} />;
};
