import { expect, test } from "vitest";
import { BoxGeometry, Mesh, MeshLambertMaterial, Object3D } from "three";

import { mergeStaticParts } from "../src/Game3D/Visual/mergeStatics";

/**
 * 静态小块合并（2026-09-19）。低多边形的配方是几十个小方块拼的，每块一次 draw call，
 * 而 draw call 的开销全在 CPU 上、和显卡无关。这组用例盯两件事：
 * **该合的合了**，以及**不该动的一个都没动**（有人会按名字 / userData / 材质找回它们）。
 */

function mesh(color: number, extras: Partial<Mesh> = {}): Mesh {
  const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ color }));
  Object.assign(m, extras);
  return m;
}

function meshCount(root: Object3D): number {
  let n = 0;
  root.traverse((node) => {
    if (node instanceof Mesh) n += 1;
  });
  return n;
}

test("合并_同一份材质的小块合成一块", () => {
  const root = new Object3D();
  const shared = new MeshLambertMaterial({ color: 0x884422 });
  for (let i = 0; i < 5; i += 1) {
    const m = new Mesh(new BoxGeometry(1, 1, 1), shared);
    m.position.set(i, 0, 0);
    root.add(m);
  }
  expect(mergeStaticParts(root)).toBe(4);
  expect(meshCount(root)).toBe(1);
});

test("合并_不同材质各留各的_画面不会变", () => {
  const root = new Object3D();
  root.add(mesh(0x111111), mesh(0x222222), mesh(0x333333));
  expect(mergeStaticParts(root)).toBe(0);
  expect(meshCount(root)).toBe(3);
});

test("合并_烘顶点色时颜色不同也能合_并且换成自己的材质", () => {
  const root = new Object3D();
  const a = mesh(0xff0000);
  const b = mesh(0x00ff00);
  root.add(a, b);
  expect(mergeStaticParts(root, { bakeColors: true })).toBe(1);
  expect(meshCount(root)).toBe(1);
  const merged = root.children.find((c): c is Mesh => c instanceof Mesh)!;
  expect(merged.geometry.attributes.color).toBeDefined();
  expect((merged.material as MeshLambertMaterial).vertexColors).toBe(true);
  // 原材质是按颜色共享的缓存，不许就地改
  expect((a.material as MeshLambertMaterial).vertexColors).toBe(false);
});

test("合并_有名字的不动_配方起名就是为了之后找它", () => {
  const root = new Object3D();
  const shared = new MeshLambertMaterial({ color: 0x884422 });
  const hinge = new Mesh(new BoxGeometry(1, 1, 1), shared);
  hinge.name = "hinge";
  const plain = new Mesh(new BoxGeometry(1, 1, 1), shared);
  const other = new Mesh(new BoxGeometry(1, 1, 1), shared);
  root.add(hinge, plain, other);

  mergeStaticParts(root);
  expect(root.getObjectByName("hinge")).toBe(hinge);
  expect(meshCount(root)).toBe(2); // hinge + 合起来的那块
});

test("合并_挂了userData的不动_那是逐块的旗子", () => {
  const root = new Object3D();
  const shared = new MeshLambertMaterial({ color: 0x884422 });
  const decor = new Mesh(new BoxGeometry(1, 1, 1), shared);
  decor.userData.noCollide = true;
  const solid = new Mesh(new BoxGeometry(1, 1, 1), shared);
  const solid2 = new Mesh(new BoxGeometry(1, 1, 1), shared);
  root.add(decor, solid, solid2);

  mergeStaticParts(root);
  // 把 noCollide 的那块合进会碰撞的那块里 = 布景突然变成墙
  expect(decor.parent).toBe(root);
  expect(decor.userData.noCollide).toBe(true);
  expect(meshCount(root)).toBe(2);
});

test("合并_自发光的不动_开关灯改的就是它", () => {
  const root = new Object3D();
  const glow = new Mesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ emissive: 0xffaa33 }));
  const shared = new MeshLambertMaterial({ color: 0x333333 });
  root.add(glow, new Mesh(new BoxGeometry(1, 1, 1), shared), new Mesh(new BoxGeometry(1, 1, 1), shared));

  mergeStaticParts(root);
  expect(glow.parent).toBe(root);
  expect(meshCount(root)).toBe(2);
});

test("合并_子块的位置烘进顶点_形状不变", () => {
  const root = new Object3D();
  const shared = new MeshLambertMaterial({ color: 0x884422 });
  const near = new Mesh(new BoxGeometry(1, 1, 1), shared);
  const far = new Mesh(new BoxGeometry(1, 1, 1), shared);
  far.position.set(10, 0, 0);
  root.add(near, far);

  mergeStaticParts(root);
  const merged = root.children.find((c): c is Mesh => c instanceof Mesh)!;
  merged.geometry.computeBoundingBox();
  const box = merged.geometry.boundingBox!;
  expect(box.min.x).toBeCloseTo(-0.5);
  expect(box.max.x).toBeCloseTo(10.5);
});
