import { BufferAttribute, BufferGeometry, Line3, Matrix4, Ray, Vector3 } from "three";
import type { Mesh, Object3D } from "three";
import { DoubleSide } from "three";
import { MeshBVH } from "three-mesh-bvh";

/**
 * 模型即碰撞（期 A，2026-08-25 用户拍板）。
 *
 * ## 要解决的债
 *
 * 在此之前碰撞是**三套手写系统拼的**：家具走房间格子占用、建筑走
 * "脚印矩形 + 门口 1.5 米豁免"、活物走圆对圆。每样新东西都要人工接线，
 * 于是餐厅的露天桌、花箱、MENU 黑板这些"脚印外的装饰"是**零碰撞**，
 * 人直接穿过去；门洞能走是因为哪行代码写了豁免，不是因为那里没有墙。
 * memory 里「碰撞必须自动推导」立了规矩，一直没有兑现机制——这个就是。
 *
 * ## 为什么是 three-mesh-bvh 而不是物理引擎
 *
 * 我们需要的只有"静态几何的碰撞查询"（角色 vs 建筑），不需要刚体动力学。
 * rapier/cannon 那一套带来的确定性、存档、回归成本全是白付的。
 * three-mesh-bvh 是 three.js 世界里角色控制器的行业标准（官方 example、
 * drei 的 ecctrl 都用它）：给任意几何建三角形 BVH，对数级查询，
 * 而且**纯几何运算不要渲染器**——我们的模型全是 box/blob/cylinder 拼的
 * BufferGeometry，vitest 里就能建能查，headless 验收那条腿不断。
 *
 * ## 这个模块只回答两个问题
 *
 * 1. `capsuleBlocked` —— 一根竖直胶囊（走路的人的身体带）压没压到三角形。
 *    身高带由调用方给：下缘 = 脚 + 能迈上去的高度（低于台阶高的东西
 *    天然可跨过），上缘 = 头顶。**门洞、拱、屋檐下从此是"推导"出来的**：
 *    能走是因为那一段真的没有三角形。
 * 2. `groundHitBelow` —— 向下打一条线，答第一个命中面的高度。
 *    期 C 拿它做"台明和石阶自动可站"。
 *
 * 策略（哪些楼查、身高带取多少、穿行跳不跳）**不在这里**——这里只有
 * 几何。策略住在 buildingColliders / walkable 那边，谁调用谁定。
 */

export type MeshCollider = {
  /** 竖直胶囊压没压到三角形。y 区间是**世界坐标** */
  capsuleBlocked(x: number, z: number, radius: number, yMin: number, yMax: number): boolean;
  /** 从 fromY 向下的第一个命中面高（世界 Y）。没打到 = null */
  groundHitBelow(x: number, z: number, fromY: number): number | null;
  /** 包围盒（世界坐标），调用方拿去做广相 */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };
  /** 三角形数。观察台和面数预算要看 */
  triangleCount: number;
};

/* 热路径的临时对象全部预分配。isWalkable 一帧被问上千次（导航烘焙时
 * 更多），每次 new 三个 Vector3 就是每帧几千个垃圾对象 */
const scratchLine = new Line3();
const scratchTarget1 = new Vector3();
const scratchTarget2 = new Vector3();
const scratchRay = new Ray(new Vector3(), new Vector3(0, -1, 0));
const scratchMatrix = new Matrix4();
const scratchVec = new Vector3();

/**
 * 把一棵已摆好位置的子树压成一份**世界坐标**三角形汤，建 BVH。
 *
 * 手工合并而不用库里的 StaticGeometryGenerator：那个为蒙皮和形变服务，
 * 要求各网格属性对齐；我们只要 position（BVH 只看位置），box 有
 * normal+uv、blob 可能带顶点色，挑着拷最省事也最不容易被属性差异绊倒。
 *
 * `userData.noCollide` 的网格跳过——烟、以后的特效用它豁免。
 */
export function buildMeshCollider(root: Object3D): MeshCollider {
  root.updateWorldMatrix(true, true);

  const positions: number[] = [];
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || mesh.userData.noCollide) return;
    const geometry = mesh.geometry;
    const attr = geometry.getAttribute("position");
    if (!attr) return;
    scratchMatrix.copy(mesh.matrixWorld);
    const index = geometry.getIndex();
    const count = index ? index.count : attr.count;
    for (let i = 0; i < count; i += 1) {
      const vi = index ? index.getX(i) : i;
      scratchVec.fromBufferAttribute(attr as BufferAttribute, vi).applyMatrix4(scratchMatrix);
      positions.push(scratchVec.x, scratchVec.y, scratchVec.z);
    }
  });

  const merged = new BufferGeometry();
  merged.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  const bvh = new MeshBVH(merged);

  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  const bounds = {
    minX: bb.min.x,
    maxX: bb.max.x,
    minZ: bb.min.z,
    maxZ: bb.max.z,
    minY: bb.min.y,
    maxY: bb.max.y,
  };

  return {
    bounds,
    triangleCount: positions.length / 9,

    capsuleBlocked(x, z, radius, yMin, yMax) {
      // 广相：胶囊连整体包围盒都够不着就别下树
      if (
        x + radius < bounds.minX ||
        x - radius > bounds.maxX ||
        z + radius < bounds.minZ ||
        z - radius > bounds.maxZ ||
        yMax < bounds.minY ||
        yMin > bounds.maxY
      ) {
        return false;
      }
      /*
       * 线段两端各**内缩一个半径**，让整个胶囊（含两端球帽）恰好装进
       * [yMin, yMax]。不内缩的话底端球帽会伸到 yMin 之下——脚下
       * 0.13 米的石阶顶面离带底只有 0.13 < 半径，被判成"挡路"，
       * 期 A 就是这么红的：命中的三角形全是 y≤0.42 的台阶和台明面。
       * 我们要的语义是"**身高带里**有没有东西"，不是"胶囊碰没碰到"。
       * 代价是带顶/带底附近各有一个球帽的圆角，判定略宽松——和真实
       * 角色控制器的胶囊行为一致，正好是"贴着门框也挤得过"的手感。
       */
      const segMin = Math.min(yMin + radius, yMax);
      const segMax = Math.max(yMax - radius, segMin);
      scratchLine.start.set(x, segMin, z);
      scratchLine.end.set(x, segMax, z);
      const rSq = radius * radius;
      return bvh.shapecast({
        intersectsBounds: (box) => {
          // 竖直线段到 AABB 的距离：三轴各自算间隙，y 轴是区间对区间
          const dx = Math.max(box.min.x - x, 0, x - box.max.x);
          const dz = Math.max(box.min.z - z, 0, z - box.max.z);
          const dy = Math.max(box.min.y - segMax, 0, segMin - box.max.y);
          return dx * dx + dy * dy + dz * dz <= rSq;
        },
        intersectsTriangle: (triangle) =>
          triangle.closestPointToSegment(scratchLine, scratchTarget1, scratchTarget2) <= radius,
      });
    },

    groundHitBelow(x, z, fromY) {
      scratchRay.origin.set(x, fromY, z);
      // DoubleSide：合并汤里不保证绕向，背面剔除会让朝下看的面漏接
      const hit = bvh.raycastFirst(scratchRay, DoubleSide);
      return hit ? hit.point.y : null;
    },
  };
}
