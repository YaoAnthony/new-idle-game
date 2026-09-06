import { findResidentDefinition } from "core";
import { Box3, Object3D, Vector3 } from "three";
import { on } from "../../Game/EventBus";
import { getResident, getResidents } from "../../Game/State/residentsRuntime";
import { groundHeightAt } from "../../Game/State/worldRuntime";
import { addOutline } from "../Engine/Outline.js";
import { buildVisual } from "../Visual/VisualRegistry.js";
import { disposeTree } from "../Visual/primitives.js";

/**
 * 宠物场景同步。造型**不在这里写死**——走和家具同一条路：
 *
 *   ResidentSave.definitionId → Core 的 ResidentDefinition.visualId → VisualRegistry
 *
 * 所以以后把某只换成 GLTF 精模，只改 VisualRegistry 一行，
 * 这个文件、Core、存档、寻路、好感度逻辑全都不动。
 */

/** definitionId → 造型。注册表里查不到时返回 null，调用方跳过（不画错的东西） */
function buildResidentVisual(definitionId: string): Object3D | null {
  const definition = findResidentDefinition(definitionId);
  if (!definition) return null;

  const visual = buildVisual(definition.visualId);
  if (!visual) return null;

  // 描边宽度听模型的：2.4 米的大家伙和 0.3 米的小团子不能用同一档。
  // 模型没表态就沿用小团子的 1.07
  addOutline(visual, { scale: visual.userData.outlineScale ?? 1.07 });
  return visual;
}

export class ResidentView {
  readonly root = new Object3D();

  private readonly views = new Map<string, Object3D>();
  /*
   * 身后拖着的东西（小鱼人的浮筏车）。**和本体分开存**：它不能跟着
   * 本体的 `animate` 一起被挤压拉伸（车不是软的），落点也要单独算
   * ——挂成子节点的话，人一转身车会绕着人公转，像被甩出去的流星锤。
   */
  private readonly trailers = new Map<string, Object3D>();
  private elapsed = 0;
  private readonly unsubscribe: () => void;

  constructor() {
    this.root.name = "pets";

    // 一次性动作（摇头之类）转发给对应造型自己的 playGesture。
    // 没实现的物种（大多数）静默不理，不是错误
    this.unsubscribe = on("resident_gesture", ({ residentId, gesture }) => {
      const view = this.views.get(residentId);
      const play = view?.userData.playGesture as
        | ((name: string) => void)
        | undefined;
      play?.(gesture);
    });
  }

  dispose(): void {
    this.unsubscribe();
  }

  /**
   * 某只的头顶世界坐标（气泡挂这里，居民系统 03）。模型高度量一次缓存在 userData：
   * 每帧 Box3 太贵，而模型不会长高。藏着的（进了屋）没有头顶。
   */
  headAnchorOf(residentId: string): { x: number; y: number; z: number } | null {
    const view = this.views.get(residentId);
    if (!view || !view.visible) return null;
    let top = view.userData.headTop as number | undefined;
    if (top === undefined) {
      top = new Box3().setFromObject(view).max.y - view.position.y;
      view.userData.headTop = top;
    }
    return { x: view.position.x, y: view.position.y + top + 0.2, z: view.position.z };
  }

  /**
   * 摆他身后拖着的那件东西。
   *
   * `trailing` 是**物种定义上的一句声明**（`ResidentDefinition.trailing`），
   * 不是这里的 if——下一个拖东西的角色只要在数据里加一行，这个方法
   * 一个字不用改。
   *
   * 落点是"沿他背后方向退 distance 米"，朝向和他一致：车头始终对着他，
   * 看起来才是被拖着走的。地面高度单独取——人站在缘侧上、车还在地上时，
   * 两边各自贴各自的地。
   */
  private placeTrailer(resident: ReturnType<typeof getResidents>[number]): void {
    const definition = findResidentDefinition(resident.definitionId);
    const trailing = definition?.trailing;
    if (!trailing) return;

    let cart = this.trailers.get(resident.residentId);
    if (!cart) {
      const built = buildVisual(trailing.visualId);
      if (!built) return;
      addOutline(built, { scale: built.userData.outlineScale ?? 1.02 });
      cart = built;
      this.trailers.set(resident.residentId, cart);
      this.root.add(cart);
    }

    const behind = resident.heading + Math.PI;
    const x = resident.x + Math.sin(behind) * trailing.distance;
    const z = resident.z + Math.cos(behind) * trailing.distance;
    cart.position.set(x, groundHeightAt(x, z), z);
    cart.rotation.y = resident.heading;

    const animate = cart.userData.animate as ((dt: number) => void) | undefined;
    animate?.(this.lastDelta);
  }

  private lastDelta = 0;

  /**
   * 手里的道具（居民系统 12）：`heldProp` 是 VisualId，查同一张注册表挂到模型上。
   * 挂点**按身体尺寸算**（右手边、半身高、略靠前），不去模型里找"手"这个节点——三种居民的骨架
   * 各不相同，找节点等于让这里记住每种模型的命名。道具随身高缩放：傀儡的锤子该比小团子的杯子大。
   * 模型的 animate 只动子节点、不动 root，所以挂在 root 上的道具不会被拉伸。
   */
  private syncProp(view: Object3D, propId: string | null): void {
    const current = (view.userData.propId as string | undefined) ?? null;
    if (current === propId) return;
    const old = view.userData.propNode as Object3D | undefined;
    if (old) {
      view.remove(old);
      disposeTree(old);
    }
    view.userData.propId = propId ?? undefined;
    view.userData.propNode = undefined;
    if (!propId) return;
    const prop = buildVisual(propId);
    if (!prop) return;
    let size = view.userData.bodySize as Vector3 | undefined;
    if (!size) {
      size = new Box3().setFromObject(view).getSize(new Vector3());
      view.userData.bodySize = size;
    }
    const scale = Math.min(1.6, Math.max(0.6, size.y));
    prop.scale.setScalar(scale);
    prop.position.set(size.x * 0.42, size.y * 0.5, size.z * 0.3);
    view.add(prop);
    view.userData.propNode = prop;
  }

  update(deltaSeconds: number): void {
    this.lastDelta = deltaSeconds;
    this.elapsed += deltaSeconds;

    for (const resident of getResidents()) {
      let view = this.views.get(resident.residentId);
      if (!view) {
        const built = buildResidentVisual(resident.definitionId);
        if (!built) continue;

        view = built;
        this.views.set(resident.residentId, view);
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
      setHead?.(resident.attachedParts.has("head"));

      /*
       * 藏起来（进了屋、钻了树洞）= 模型整个不画（居民系统 02）。
       * 01 定了 hide 这个动词，视图却一直没接——人"进了屋"身子还杵在门口，
       * 02 浏览器验收在小狐家门口抓到的。木偶的 hidden 走关键帧，同一条路。
       */
      view.visible = resident.state !== "hidden";
      if (!view.visible) continue;

      this.syncProp(view, resident.heldProp);

      // 脚下的承托面（缘侧那类室外平台）。溜达到廊子上的猫要站在板上，
      // 不是陷进去半截——和玩家读的是同一个地形高度
      const ground = groundHeightAt(resident.x, resident.z);
      view.position.set(resident.x, ground, resident.z);
      view.rotation.y = resident.heading;

      this.placeTrailer(resident);

      /**
       * 带骨架的生物自己动（约定：build 时把 animate 闭包挂在 userData 上，
       * 内部只动自己的子节点，root 的位置朝向仍归这里管）。
       * 没有骨架的小团子沿用整体颠一颠。
       */
      const animate = view.userData.animate as
        | ((dt: number, resident: { state: string; moving: boolean }) => void)
        | undefined;
      if (animate) {
        animate(deltaSeconds, resident);
      } else {
        // 移动时颠一颠，待机时轻微呼吸——低多边形的"活"就靠这个
        const bounce = resident.moving
          ? Math.abs(Math.sin(this.elapsed * 9)) * 0.06
          : Math.sin(this.elapsed * 2.4) * 0.015;
        // 叠在承托面上，不是覆盖它——覆盖的话站在缘侧上的小团子会掉回地面
        view.position.y = ground + bounce;
      }
    }

    /*
     * 清扫：运行时里已经不在的生物，把模型收走（期 3：水獭隔天走、
     * 小龙被送走）。在这之前从没有生物会消失，所以这个循环一直不存在——
     * 不补的话水獭走了模型还站在原地，成了一只按 F 没反应的"空壳"。
     */
    for (const [residentId, trailer] of this.trailers) {
      if (getResident(residentId)) continue;
      this.root.remove(trailer);
      disposeTree(trailer);
      this.trailers.delete(residentId);
    }

    for (const [residentId, view] of this.views) {
      if (getResident(residentId)) continue;
      this.root.remove(view);
      disposeTree(view);
      this.views.delete(residentId);
    }
  }
}
