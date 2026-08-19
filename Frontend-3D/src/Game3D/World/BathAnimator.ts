import type { Object3D } from "three";
import { getWorld } from "../../Game/State/worldRuntime";

/**
 * 浴缸的水面跟着水位走。
 *
 * 和 GramophoneAnimator 一类：**跟着状态走的持续状态**，每帧读实例的
 * `state.water.level`（Systems/bath 在推进它），把名为 `bath-water` 的
 * 节点按水位缩放——它在配方里是一块从缸底到满水位的方块，原点在底部，
 * scale.y 就是水位；0 时直接藏起来（不留一张共面的薄片在缸底闪）。
 *
 * 节点每帧按名找不缓存，理由同唱片机：模型是 FurnitureView 对账时整棵
 * 重建的，缓存的引用下一帧可能就不在场景里了。
 */
export class BathAnimator {
  constructor(
    private readonly findTubs: () => Array<{ instanceId: string; root: Object3D }>,
  ) {}

  update(): void {
    const placed = getWorld().placedFurniture;
    for (const { instanceId, root } of this.findTubs()) {
      const water = root.getObjectByName("bath-water");
      if (!water) continue;
      const level = placed.find((item) => item.instanceId === instanceId)?.state.water?.level ?? 0;
      if (level <= 0.005) {
        water.visible = false;
        continue;
      }
      water.visible = true;
      water.scale.y = level;
    }
  }
}
