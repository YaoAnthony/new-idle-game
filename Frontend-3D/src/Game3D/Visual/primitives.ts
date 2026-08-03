import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  SphereGeometry,
  type Color,
  type ColorRepresentation,
} from "three";

/**
 * 低多边形图元工厂。整套画风不用贴图、不用 PBR——
 * 所有形体都由这几个图元拼出来，靠平面着色和色块区分面。
 *
 * **例外：角色的皮肤走平滑着色**（见 ownSmoothMaterial）。
 * 平面着色让每个面各自受光，家具和树因此有方块味；但同一套规则用在
 * 脸上就是满脸棱面。动森那种光滑脸 = 顶点法线插值 + 足够细分，
 * 家具保持 flat、皮肤单独 smooth，两种味道各归各的。
 */

const materialCache = new Map<string, MeshLambertMaterial>();

export function flatMaterial(
  value: ColorRepresentation,
  doubleSide = false,
): MeshLambertMaterial {
  // 缓存键要带上单双面：同一个颜色的单面和双面是两种材质，
  // 只按颜色缓存会让先创建的那种把另一种顶掉
  const key = `${typeof value === "string" ? value : String(value)}|${doubleSide}`;
  const existing = materialCache.get(key);
  if (existing) return existing;

  const material = new MeshLambertMaterial({
    color: value,
    flatShading: true,
    side: doubleSide ? DoubleSide : FrontSide,
  });
  materialCache.set(key, material);
  return material;
}

/** 每个实例独立的材质，用于需要单独染色或调透明度的对象 */
export function ownMaterial(
  value: ColorRepresentation | Color,
  doubleSide = false,
): MeshLambertMaterial {
  return new MeshLambertMaterial({
    color: value,
    flatShading: true,
    side: doubleSide ? DoubleSide : FrontSide,
  });
}

/**
 * 平滑着色版（顶点法线插值）。给角色的皮肤、头发这类有机形体用——
 * 配合足够的球面细分（脸 24×18 起）才有效果：着色只抹平面与面的
 * 光照跳变，轮廓的多边形折线要靠细分本身。
 */
export function ownSmoothMaterial(
  value: ColorRepresentation | Color,
  doubleSide = false,
): MeshLambertMaterial {
  return new MeshLambertMaterial({
    color: value,
    flatShading: false,
    side: doubleSide ? DoubleSide : FrontSide,
  });
}

export type Vec3 = [number, number, number];

type ShapeOptions = {
  position?: Vec3;
  rotation?: Vec3;
  color: ColorRepresentation | Color;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /**
   * 去掉圆柱的顶底盖。做**容器**必须开口——
   * CylinderGeometry 默认带顶盖，锅从上往下看就是一块盖板，
   * 不管里面画了什么都被盖住。
   */
  openEnded?: boolean;
  /** 双面渲染。开了口的容器要靠它才看得见远侧内壁，否则里面是空的 */
  doubleSide?: boolean;
};

function applyCommon(mesh: Mesh, options: ShapeOptions): Mesh {
  if (options.position) mesh.position.set(...options.position);
  if (options.rotation) mesh.rotation.set(...options.rotation);

  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

export function box(size: Vec3, options: ShapeOptions): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(...size),
    typeof options.color === "string"
      ? flatMaterial(options.color)
      : ownMaterial(options.color),
  );
  return applyCommon(mesh, options);
}

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  options: ShapeOptions,
): Mesh {
  const mesh = new Mesh(
    new CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      segments,
      1,
      options.openEnded ?? false,
    ),
    typeof options.color === "string"
      ? flatMaterial(options.color, options.doubleSide)
      : ownMaterial(options.color, options.doubleSide),
  );
  return applyCommon(mesh, options);
}

export function sphere(
  radius: number,
  widthSegments: number,
  heightSegments: number,
  options: ShapeOptions,
): Mesh {
  const mesh = new Mesh(
    new SphereGeometry(radius, widthSegments, heightSegments),
    typeof options.color === "string"
      ? flatMaterial(options.color)
      : ownMaterial(options.color),
  );
  return applyCommon(mesh, options);
}

/** 低细分二十面体，用来做团子状的有机形体（树冠、小动物身体） */
export function blob(radius: number, detail: number, options: ShapeOptions): Mesh {
  const mesh = new Mesh(
    new IcosahedronGeometry(radius, detail),
    typeof options.color === "string"
      ? flatMaterial(options.color)
      : ownMaterial(options.color),
  );
  return applyCommon(mesh, options);
}

export function group(name: string, children: Object3D[]): Object3D {
  const container = new Object3D();
  container.name = name;
  for (const child of children) container.add(child);
  return container;
}

/** 释放一棵子树里所有几何体，避免场景重建时泄漏 */
export function disposeTree(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
  });
}
