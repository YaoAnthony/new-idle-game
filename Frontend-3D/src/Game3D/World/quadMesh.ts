import {
  BufferAttribute,
  BufferGeometry,
  FrontSide,
  Mesh,
  MeshLambertMaterial,
  type Color,
} from "three";

export type Quad = {
  /** 四个角，按逆时针顺序（从可见面看过去） */
  corners: [number, number, number][];
  normal: [number, number, number];
  color: Color;
};

/**
 * 按目标法线校正绕序：算错了就翻过来。
 *
 * 手推绕序是这套四边形建模里最容易错、又最难一眼看出来的地方——
 * 错了不会报错，只会让那一面**从该看见的方向消失**（背面剔除），
 * 而"少了一面墙"和"这里本来就没建"长得一模一样。V0.13 的破风板
 * 就是栽在同类的符号推导上。倾斜面尤其难推，所以斜的椽子、缘侧木台
 * 一律走这个函数，只声明"我要朝哪"，绕序交给叉乘。
 */
export function faced(
  corners: [number, number, number][],
  want: [number, number, number],
): [number, number, number][] {
  const [p0, p1, p2] = corners;
  const ax = p1[0] - p0[0];
  const ay = p1[1] - p0[1];
  const az = p1[2] - p0[2];
  const bx = p2[0] - p0[0];
  const by = p2[1] - p0[1];
  const bz = p2[2] - p0[2];

  // 叉乘出面的实际朝向，和目标反向就倒过来
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;

  const dot = nx * want[0] + ny * want[1] + nz * want[2];
  return dot < 0 ? [...corners].reverse() : corners;
}

/**
 * 把一堆四边形合并成单个 BufferGeometry，颜色写进顶点色。
 *
 * 这样一面墙或整块地板只占一个 draw call，同时每一格还能有独立的色差——
 * 低多边形风格的分块质感就是这么来的，不需要任何贴图。
 */
export function buildQuadGeometry(quads: Quad[]): BufferGeometry {
  const vertexCount = quads.length * 4;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(quads.length * 6);

  quads.forEach((quad, quadIndex) => {
    const base = quadIndex * 4;

    quad.corners.forEach((corner, cornerIndex) => {
      const offset = (base + cornerIndex) * 3;

      positions[offset] = corner[0];
      positions[offset + 1] = corner[1];
      positions[offset + 2] = corner[2];

      normals[offset] = quad.normal[0];
      normals[offset + 1] = quad.normal[1];
      normals[offset + 2] = quad.normal[2];

      colors[offset] = quad.color.r;
      colors[offset + 1] = quad.color.g;
      colors[offset + 2] = quad.color.b;
    });

    const indexOffset = quadIndex * 6;
    indices[indexOffset] = base;
    indices[indexOffset + 1] = base + 1;
    indices[indexOffset + 2] = base + 2;
    indices[indexOffset + 3] = base;
    indices[indexOffset + 4] = base + 2;
    indices[indexOffset + 5] = base + 3;
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));

  return geometry;
}

export function createQuadMesh(
  quads: Quad[],
  name: string,
  options: { castShadow?: boolean } = {},
): Mesh {
  const geometry = buildQuadGeometry(quads);
  // 只渲染朝屋内的面。镜头锁在屋内后这纯粹是省渲染量；
  // 投影用的是 three 的默认 shadowSide 规则（FrontSide 材质 → 渲染背面进深度图），
  // 从屋外照来的太阳看到的正是墙的背面，所以单面墙照样挡光，光只能从窗洞进来。
  const material = new MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: FrontSide,
  });

  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.castShadow = options.castShadow ?? false;
  return mesh;
}
