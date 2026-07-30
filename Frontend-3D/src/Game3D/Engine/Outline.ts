import { BackSide, Mesh, MeshBasicMaterial, Object3D } from "three";
import { PALETTE } from "../Visual/palette.js";

/**
 * 浅色描边（inverted hull）：复制网格、翻转到只画背面、整体放大一点点，
 * 于是背面在物体轮廓外露出一圈，形成描边。
 *
 * 只给家具、宠物这类"物件"描边，不给地板和墙——参考图里地面也是没有描边的，
 * 而且大面积几何用缩放法会得到极粗的边。
 *
 * 注意这会让被描边对象的 draw call 翻倍，所以做成可开关。
 */

const OUTLINE_NAME = "__outline";

const outlineMaterial = new MeshBasicMaterial({
  color: PALETTE.outline,
  side: BackSide,
});

export type OutlineOptions = {
  /** 放大比例，1.04 约等于视觉上 1-2 像素 */
  scale?: number;
};

export function addOutline(target: Object3D, options: OutlineOptions = {}): void {
  const scale = options.scale ?? 1.045;

  const meshes: Mesh[] = [];
  target.traverse((node) => {
    if (node instanceof Mesh && node.name !== OUTLINE_NAME) meshes.push(node);
  });

  for (const mesh of meshes) {
    if (mesh.getObjectByName(OUTLINE_NAME)) continue;

    const shell = new Mesh(mesh.geometry, outlineMaterial);
    shell.name = OUTLINE_NAME;
    shell.scale.setScalar(scale);
    shell.castShadow = false;
    shell.receiveShadow = false;
    mesh.add(shell);
  }
}

export function setOutlineVisible(root: Object3D, visible: boolean): void {
  root.traverse((node) => {
    if (node.name === OUTLINE_NAME) node.visible = visible;
  });
}

export function removeOutline(root: Object3D): void {
  const shells: Object3D[] = [];
  root.traverse((node) => {
    if (node.name === OUTLINE_NAME) shells.push(node);
  });

  for (const shell of shells) shell.removeFromParent();
}
