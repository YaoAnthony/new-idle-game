import { findPetDefinition } from "core";
import { Object3D } from "three";
import { on } from "../../Game/EventBus";
import { getPets } from "../../Game/State/petsRuntime";
import { groundHeightAt } from "../../Game/State/worldRuntime";
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
  private readonly unsubscribe: () => void;

  constructor() {
    this.root.name = "pets";

    // 一次性动作（摇头之类）转发给对应造型自己的 playGesture。
    // 没实现的物种（大多数）静默不理，不是错误
    this.unsubscribe = on("pet_gesture", ({ petId, gesture }) => {
      const view = this.views.get(petId);
      const play = view?.userData.playGesture as
        | ((name: string) => void)
        | undefined;
      play?.(gesture);
    });
  }

  dispose(): void {
    this.unsubscribe();
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

      /*
       * 零件装没装上（石傀儡的头）。**模型自己认领这件事**：视图只把
       * "装了没有"这个布尔递过去，不去翻子节点找那块头——翻子节点等于
       * 让这里记住"头在模型里叫什么名字"，换个模型就得回来改。
       * 没有这个钩子的物种（所有宠物）静默跳过。
       */
      const setHead = view.userData.setHeadAttached as
        | ((attached: boolean) => void)
        | undefined;
      setHead?.(pet.attachedParts.has("head"));

      // 脚下的承托面（缘侧那类室外平台）。溜达到廊子上的猫要站在板上，
      // 不是陷进去半截——和玩家读的是同一个地形高度
      const ground = groundHeightAt(pet.x, pet.z);
      view.position.set(pet.x, ground, pet.z);
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
        // 叠在承托面上，不是覆盖它——覆盖的话站在缘侧上的小团子会掉回地面
        view.position.y = ground + bounce;
      }
    }
  }
}
