import { Material, Mesh, Object3D } from "three";

/**
 * 把一棵子树淡成半透明，再淡回来。
 *
 * **必须换成实例私有的材质**：`primitives.ts` 的 `flatMaterial` 是按颜色
 * 全局缓存共享的，直接改 opacity 会把所有同色物件一起淡掉——
 * 挡住角色的是一个衣柜，结果满屋子木头都透了。描边壳（`Outline.ts`）
 * 也共享一份材质，同样要换，否则填充淡了却剩一圈实心轮廓，像鬼影。
 *
 * 淡回全不透明时把原材质换回去，缓存的复用价值不能白白丢掉。
 */

/** 原材质存在这里，淡回去时换回来 */
const ORIGINAL = "__fadeOriginalMaterial";

type Faded = Object3D & { userData: { __fadeOpacity?: number } };

function meshesOf(root: Object3D): Mesh[] {
  const found: Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof Mesh) found.push(node);
  });
  return found;
}

/** 换上私有材质（已经换过就跳过） */
function detachMaterials(root: Object3D): void {
  for (const mesh of meshesOf(root)) {
    if (mesh.userData[ORIGINAL]) continue;

    const source = mesh.material as Material;
    mesh.userData[ORIGINAL] = source;

    const clone = source.clone();
    clone.transparent = true;
    // 半透明物件之间互相遮挡的排序问题，在这套低多边形画风里
    // 关掉深度写入就够了，不必上正经的 OIT
    clone.depthWrite = false;
    mesh.material = clone;
  }
}

/** 换回共享材质，顺手释放克隆出来的那份 */
function reattachMaterials(root: Object3D): void {
  for (const mesh of meshesOf(root)) {
    const original = mesh.userData[ORIGINAL] as Material | undefined;
    if (!original) continue;

    (mesh.material as Material).dispose();
    mesh.material = original;
    delete mesh.userData[ORIGINAL];
  }
}

function setOpacity(root: Object3D, opacity: number): void {
  for (const mesh of meshesOf(root)) {
    (mesh.material as Material).opacity = opacity;
  }
}

/**
 * 朝目标不透明度走一步。返回**当前**不透明度。
 *
 * `speed` 是每秒的变化量。淡出要比淡回来快——挡住视线的那一下必须立刻让开，
 * 而人走开之后慢慢显形才不会闪。
 */
export function stepFade(
  target: Object3D,
  targetOpacity: number,
  deltaSeconds: number,
  speed = 4,
): number {
  const node = target as Faded;
  const current = node.userData.__fadeOpacity ?? 1;
  if (Math.abs(current - targetOpacity) < 0.001) return current;

  const step = speed * deltaSeconds;
  const next =
    current < targetOpacity
      ? Math.min(current + step, targetOpacity)
      : Math.max(current - step, targetOpacity);

  node.userData.__fadeOpacity = next;

  if (next >= 0.999) {
    reattachMaterials(target);
    return 1;
  }

  detachMaterials(target);
  setOpacity(target, next);
  return next;
}

/** 立刻恢复不透明（家具被拿走、场景销毁时用） */
export function clearFade(target: Object3D): void {
  reattachMaterials(target);
  (target as Faded).userData.__fadeOpacity = 1;
}
