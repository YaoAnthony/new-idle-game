import { BufferAttribute, Mesh, MeshLambertMaterial, Object3D, type Material } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * 把一件模型里**用同一份材质的静态小块合成一块**（2026-09-19）。
 *
 * ---- 为什么 ----
 *
 * 低多边形的配方是拿几十个小方块拼出来的：一盏铁艺路灯 10 块、一张长椅 13 块、
 * 一个寄售箱 39 块。每一块都是一次 draw call，而描边（inverted hull）会再复制一份，
 * 阴影 pass 还要再画一遍——**一盏路灯 ≈ 25 次 draw call**。
 *
 * WebGL 的每次 draw call 都要过 JS 校验 → ANGLE 翻译 → 驱动，这段开销**全在 CPU 上**，
 * 和显卡多强没有关系（官方文档：原生 OpenGL 约 7 万次才掉帧，WebGL 只有 5~6 千次）。
 * 实测这个项目：院子里摆 46 盏灯 = 1657 次 draw call，光提交就吃掉 12 ms 一帧，
 * 而 60 帧的预算总共 16.7 ms。这就是"换 4090 也不见好"的那部分。
 *
 * 合并之后：路灯 10 块 → 3 块，寄售箱 39 → 9，床 12 → 4。主 pass、描边、阴影一起省。
 *
 * ---- 两种粒度 ----
 *
 * 默认按**材质实例**分组，不碰颜色：配方里同色的小块本来就共用 `flatMaterial` 的
 * 缓存材质，分到一组直接合；颜色不同的各留各的。画面一个像素都不差，代价是
 * 颜色一多就合不动——一件家具通常还剩三五块。家具走这一档。
 *
 * `bakeColors` 则把每块的颜色**烘进顶点色**，于是颜色不同也能合成一块。
 * 给纯布景用（领地的杂草：285 块草每块一个抖过色的材质，按材质分组等于没合，
 * 烘顶点色之后是 1 块）。代价是合出来的那块持有自己的材质，不再是共享缓存的那份
 * ——所以只给"没人会按材质找它"的东西用。
 *
 * 下面这些**一律不合**，因为有人会再找回它们：
 * - 有名字的（配方给部件起名就是为了之后找它：门轴、唱盘、灯罩…）
 * - 挂了 userData 的（`noOutline` / `noCollide` / 灯的 `lampStrength` 这些是逐块的旗子）
 * - 自发光、半透明、带贴图的（开关灯改的是自发光那几块，淡出改的是透明度）
 * - 蒙皮 / 实例化网格（骨骼和实例矩阵不是几何体的一部分）
 * - 投影旗标不一样的（合一块之后只能有一个 castShadow）
 */

type Group = { material: Material; meshes: Mesh[] };

export type MergeOptions = {
  /** 把每块的颜色烘进顶点色，让颜色不同的小块也能合成一块（见文件头） */
  bakeColors?: boolean;
};

function mergeKeyOf(mesh: Mesh, options: MergeOptions): string | null {
  if (mesh.name) return null;
  if (Object.keys(mesh.userData).length > 0) return null;
  if ((mesh as { isInstancedMesh?: boolean }).isInstancedMesh) return null;
  if ((mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh) return null;
  if (Array.isArray(mesh.material)) return null;
  if (mesh.morphTargetInfluences) return null;

  const material = mesh.material as Material & {
    map?: unknown;
    transparent?: boolean;
    emissive?: { getHex: () => number };
  };
  if (material.transparent || material.map) return null;
  if (material.emissive && material.emissive.getHex() !== 0) return null;

  const shadow = `${mesh.castShadow ? 1 : 0}|${mesh.receiveShadow ? 1 : 0}`;
  if (!options.bakeColors) return `${material.uuid}|${shadow}`;

  /*
   * 烘颜色时分组只看"同一类材质"，不看是哪一份实例：不透明度、单双面、
   * 平面着色这些进了着色器，混在一起画出来就不对了；颜色反正要进顶点，不进键。
   */
  const flat = (material as { flatShading?: boolean }).flatShading ? 1 : 0;
  return [material.type, material.opacity, material.side, flat, shadow].join("|");
}

/**
 * 就地合并 `root` 底下的静态块。返回省掉了多少个网格（0 = 没什么可合的）。
 *
 * **要在加描边之前调**：描边是照着每个网格复制一份外壳，先合再描 = 外壳也跟着少。
 */
export function mergeStaticParts(root: Object3D, options: MergeOptions = {}): number {
  const groups = new Map<string, Group>();

  root.updateWorldMatrix(false, true);
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const key = mergeKeyOf(node, options);
    if (key === null) return;
    const group = groups.get(key);
    if (group) group.meshes.push(node);
    else groups.set(key, { material: node.material as Material, meshes: [node] });
  });

  let saved = 0;
  for (const { material, meshes } of groups.values()) {
    if (meshes.length < 2) continue;

    const geometries = [];
    for (const mesh of meshes) {
      let geometry = mesh.geometry.clone();
      if (geometry.index) geometry = geometry.toNonIndexed();
      /*
       * 合到 root 的本地空间：每块自己的位置 / 旋转 / 缩放烘进顶点里。
       * `root.matrixWorld` 可能还没算（模型刚建出来、没进场景），所以用
       * 相对变换而不是 world → local 的逆矩阵。
       */
      geometry.applyMatrix4(relativeMatrix(mesh, root));
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      for (const name of Object.keys(geometry.attributes)) {
        if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
      }
      if (options.bakeColors) {
        const color = (mesh.material as unknown as { color: { r: number; g: number; b: number } }).color;
        const count = geometry.attributes.position.count;
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i += 1) {
          colors[i * 3] = color.r;
          colors[i * 3 + 1] = color.g;
          colors[i * 3 + 2] = color.b;
        }
        geometry.setAttribute("color", new BufferAttribute(colors, 3));
      }
      geometry.morphAttributes = {};
      geometries.push(geometry);
    }

    const merged = mergeGeometries(geometries, false);
    if (!merged) {
      for (const geometry of geometries) geometry.dispose();
      continue;
    }

    const combined = new Mesh(merged, options.bakeColors ? vertexColorVariant(material) : material);
    combined.castShadow = meshes[0].castShadow;
    combined.receiveShadow = meshes[0].receiveShadow;
    root.add(combined);

    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    saved += meshes.length - 1;
  }

  return saved;
}

/**
 * 烘完顶点色要一份 `vertexColors: true` 的材质。**不改原材质**——它是按颜色共享的
 * 缓存（primitives.flatMaterial），就地开顶点色会波及场上所有同色的东西。
 */
function vertexColorVariant(material: Material): Material {
  const source = material as Material & { flatShading?: boolean };
  return new MeshLambertMaterial({
    vertexColors: true,
    flatShading: source.flatShading ?? true,
    side: source.side,
    transparent: source.transparent,
    opacity: source.opacity,
  });
}

/** `child` 相对 `root` 的变换。两边的世界矩阵都由调用方保证是新的 */
function relativeMatrix(child: Object3D, root: Object3D) {
  const matrix = child.matrix.clone();
  let node = child.parent;
  while (node && node !== root) {
    matrix.premultiply(node.matrix);
    node = node.parent;
  }
  return matrix;
}
