import { findPetDefinition } from "core";
import { Object3D } from "three";
import { getPets } from "../../Game/State/petsRuntime";
import { addOutline } from "../Engine/Outline.js";
import { buildVisual } from "../Visual/VisualRegistry.js";

/**
 * 宠物场景同步。造型**不在这里写死**——走和家具同一条路：
 *
 *   PetSave.definitionId → Core 的 PetDefinition.visualId → VisualRegistry
 *
 * 所以以后把某只换成 GLTF 精模，只改 VisualRegistry 一行，
 * 这个文件、Core、存档、寻路、好感度逻辑全都不动。
 */

/** definitionId → 造型。注册表里查不到时返回 null，调用方跳过（不画错的东西） */
function buildPetVisual(definitionId: string): Object3D | null {
  const definition = findPetDefinition(definitionId);
  if (!definition) return null;

  const visual = buildVisual(definition.visualId);
  if (!visual) return null;

  // 描边宽度听模型的：2.4 米的大家伙和 0.3 米的小团子不能用同一档。
  // 模型没表态就沿用小团子的 1.07
  addOutline(visual, { scale: visual.userData.outlineScale ?? 1.07 });
  return visual;
}

export class PetView {
  readonly root = new Object3D();

  private readonly views = new Map<string, Object3D>();
  private elapsed = 0;

  constructor() {
    this.root.name = "pets";
  }

  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;

    for (const pet of getPets()) {
      let view = this.views.get(pet.petId);
      if (!view) {
        const built = buildPetVisual(pet.definitionId);
        if (!built) continue;

        view = built;
        this.views.set(pet.petId, view);
        this.root.add(view);
      }

      view.position.set(pet.x, 0, pet.z);
      view.rotation.y = pet.heading;

      /**
       * 带骨架的生物自己动（约定：build 时把 animate 闭包挂在 userData 上，
       * 内部只动自己的子节点，root 的位置朝向仍归这里管）。
       * 没有骨架的小团子沿用整体颠一颠。
       */
      const animate = view.userData.animate as
        | ((dt: number, pet: { state: string; moving: boolean }) => void)
        | undefined;
      if (animate) {
        animate(deltaSeconds, pet);
      } else {
        // 移动时颠一颠，待机时轻微呼吸——低多边形的"活"就靠这个
        const bounce = pet.moving
          ? Math.abs(Math.sin(this.elapsed * 9)) * 0.06
          : Math.sin(this.elapsed * 2.4) * 0.015;
        view.position.y = bounce;
      }
    }
  }
}
