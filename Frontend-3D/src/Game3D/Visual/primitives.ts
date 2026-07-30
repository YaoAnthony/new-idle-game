import {
  BoxGeometry,
  CylinderGeometry,
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
 */

const materialCache = new Map<string, MeshLambertMaterial>();

export function flatMaterial(value: ColorRepresentation): MeshLambertMaterial {
  const key = typeof value === "string" ? value : String(value);
  const existing = materialCache.get(key);
  if (existing) return existing;

  const material = new MeshLambertMaterial({ color: value, flatShading: true });
  materialCache.set(key, material);
  return material;
}

/** 每个实例独立的材质，用于需要单独染色或调透明度的对象 */
export function ownMaterial(value: ColorRepresentation | Color): MeshLambertMaterial {
  return new MeshLambertMaterial({ color: value, flatShading: true });
}

export type Vec3 = [number, number, number];

type ShapeOptions = {
  position?: Vec3;
  rotation?: Vec3;
  color: ColorRepresentation | Color;
  castShadow?: boolean;
  receiveShadow?: boolean;
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
    new CylinderGeometry(radiusTop, radiusBottom, height, segments),
    typeof options.color === "string"
      ? flatMaterial(options.color)
      : ownMaterial(options.color),
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
