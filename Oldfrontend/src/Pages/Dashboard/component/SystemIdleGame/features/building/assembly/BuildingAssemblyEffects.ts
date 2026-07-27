import type { BuildingAssemblyEffect } from '../BuildingTypes';

export function playBuildingAssemblyEffects(scene: any, effects: BuildingAssemblyEffect[] | null | undefined): void {
  if (!scene || !Array.isArray(effects)) return;
  effects.forEach((effect) => {
    if (effect?.type === 'assembly_light') playAssemblyLight(scene, effect);
  });
}

function playAssemblyLight(scene: any, effect: BuildingAssemblyEffect): void {
  const graphics = scene.add?.graphics?.();
  if (!graphics) return;
  const cellX = Math.floor(Number(effect.cellX ?? 0));
  const cellY = Math.floor(Number(effect.cellY ?? 0));
  const x = Number(effect.x ?? cellX * 32 + 16);
  const y = Number(effect.y ?? cellY * 32 + 16);
  const radius = Math.max(16, Number(effect.radius ?? 78));
  const duration = Math.max(250, Number(effect.durationMs ?? 1600));
  graphics.setDepth?.(9500);
  const topLeftX = (cellX - 1) * 32;
  const topLeftY = (cellY - 1) * 32;
  scene.tweens?.addCounter?.({
    from: 0,
    to: 1,
    duration,
    ease: 'Sine.easeInOut',
    onUpdate: (tween: any) => {
      const progress = Number(tween.getValue?.() ?? 0);
      const pulse = Math.sin(progress * Math.PI);
      graphics.clear();
      graphics.fillStyle(0xfff2a8, 0.18 + pulse * 0.2);
      graphics.fillRect(topLeftX, topLeftY, 96, 96);
      graphics.fillStyle(0xffffd6, 0.12 + pulse * 0.32);
      graphics.fillCircle(x, y - 8, radius * (0.72 + pulse * 0.38));
      graphics.lineStyle(2, 0xfff6bf, 0.35 + pulse * 0.45);
      graphics.strokeCircle(x, y - 8, radius * (0.82 + progress * 0.28));
    },
    onComplete: () => {
      graphics.clear();
      graphics.destroy();
    },
  });
}
