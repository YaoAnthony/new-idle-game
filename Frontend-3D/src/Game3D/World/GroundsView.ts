import {
  cornerShape,
  cornerTiles,
  groundDefinitions,
  groundTuning,
  roomCellToWorld,
  type GridPosition,
} from "core";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  ShapeUtils,
  Vector2,
  type Scene,
} from "three";

import { on } from "../../Game/EventBus";
import { getGroundLayer } from "../../Game/State/grounds";
import { getRoom } from "../../Game/State/world/maps";
import { getCurrentMap, groundHeightAt } from "../../Game/State/worldRuntime";
import { cornerPolygons, polygonArea } from "../Visual/groundShapes";
import { PALETTE } from "../Visual/palette";
import { box, group } from "../Visual/primitives";
import { hash01 } from "./outdoorTerrain";

/**
 * 铺的地面的 3D 表现（地面系统 2026-09-18）。
 *
 * 每种地面一个 Mesh：按 Core 的 `cornerTiles`（对偶网格的格点）出瓦片，每片是
 * 形状多边形挤出 `slabHeight` 的一块板——顶面是地面色（逐片明度抖动，低多边形要的
 * 色块感），侧面是棱色。合并成一份几何，一种地面一次 draw call。
 *
 * **画面只读 `getGroundLayer()`**，形状在 Core 算（`cornerShape`），这里只把
 * shape + rotation 变成三角形。假设院子房间轴对齐（据点的院子是），瓦片的本地偏移
 * 直接加在格点的世界坐标上。
 */

type GroundMesh = { mesh: Mesh; geometry: BufferGeometry };

export class GroundsView {
  readonly root = new Object3D();
  private readonly meshes = new Map<string, GroundMesh>();
  private readonly cursor: Object3D;
  private readonly offs: Array<() => void>;

  constructor(scene: Scene) {
    this.root.name = "grounds";
    scene.add(this.root);
    this.cursor = buildCursor();
    this.cursor.visible = false;
    this.root.add(this.cursor);
    this.rebuildAll();
    this.offs = [
      on("ground_changed", () => this.rebuildAll()),
      on("world_changed", ({ reason }) => {
        if (reason === "restored") this.rebuildAll();
      }),
      on("map_changed", () => this.rebuildAll()),
    ];
  }

  /**
   * 整体重建。一次铺一格、几十格的院子，重建全部瓦片也只是几百个三角形，
   * 比"只刷周围四个格点"省下的复杂度更值。真铺到上千格再做增量。
   */
  private rebuildAll(): void {
    const map = getCurrentMap();
    const roomId = map.outdoorRoomId;
    const room = getRoom(roomId);
    const layer = getGroundLayer();
    for (const definition of groundDefinitions) {
      const tiles = room ? cornerTiles(layer, roomId, definition.groundId) : [];
      const existing = this.meshes.get(definition.groundId);
      if (existing) {
        existing.mesh.removeFromParent();
        existing.geometry.dispose();
        (existing.mesh.material as MeshStandardMaterial).dispose();
        this.meshes.delete(definition.groundId);
      }
      if (!room || tiles.length === 0) continue;
      const top = paletteColor(definition.visual.top);
      const rim = paletteColor(definition.visual.rim);
      const positions: number[] = [];
      const colors: number[] = [];
      const scratch = new Color();
      for (const tile of tiles) {
        const { shape, rotation } = cornerShape(tile.mask);
        const polygons = cornerPolygons(shape, rotation, groundTuning.cornerSegments);
        if (polygons.length === 0) continue;
        // 格点 = 格 (cx, cy) 的西北角 = 半格之前的格心
        const at = roomCellToWorld(room, tile.cx - 0.5, tile.cy - 0.5);
        const y = groundHeightAt(at.x, at.z) + 0.005;
        scratch.set(top).offsetHSL(0, 0, (hash01(tile.cx * 17.3 + tile.cy * 31.7) - 0.5) * definition.visual.jitter);
        for (const polygon of polygons) {
          appendSlab(positions, colors, polygon, at.x, at.z, y, groundTuning.slabHeight, scratch, rim);
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
      geometry.computeVertexNormals();
      const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: DoubleSide });
      const mesh = new Mesh(geometry, material);
      mesh.name = `ground-${definition.groundId}`;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.userData.noCollide = true;
      this.root.add(mesh);
      this.meshes.set(definition.groundId, { mesh, geometry });
    }
  }

  /** 对准的那一格画个框；null 收掉 */
  setCursor(cell: { roomId: string; cell: GridPosition } | null): void {
    if (!cell) {
      this.cursor.visible = false;
      return;
    }
    const room = getRoom(cell.roomId);
    if (!room) {
      this.cursor.visible = false;
      return;
    }
    const at = roomCellToWorld(room, cell.cell.x, cell.cell.y);
    this.cursor.position.set(at.x, groundHeightAt(at.x, at.z) + groundTuning.slabHeight + 0.02, at.z);
    this.cursor.visible = true;
  }

  dispose(): void {
    for (const off of this.offs) off();
    for (const entry of this.meshes.values()) {
      entry.geometry.dispose();
      (entry.mesh.material as MeshStandardMaterial).dispose();
    }
    this.meshes.clear();
    this.root.removeFromParent();
  }
}

function paletteColor(key: string): string {
  const value = (PALETTE as Record<string, string>)[key];
  if (!value) {
    console.warn(`[grounds] PALETTE 里没有 ${key}，先用田土色顶着`);
    return PALETTE.farmDirtPacked;
  }
  return value;
}

/**
 * 一个多边形挤成一块板：顶面（earcut 三角化，内凹角也能切）+ 每条边一片竖面。
 * 不加底面（看不见）。材质双面，所以绕向不用较真。
 */
function appendSlab(
  positions: number[],
  colors: number[],
  polygon: Array<[number, number]>,
  ox: number,
  oz: number,
  y: number,
  height: number,
  top: Color,
  rimHex: string,
): void {
  const contour = (polygonArea(polygon) < 0 ? [...polygon].reverse() : polygon).map(([x, z]) => new Vector2(x, z));
  const triangles = ShapeUtils.triangulateShape(contour, []);
  const push = (x: number, z: number, py: number, color: Color): void => {
    positions.push(ox + x, py, oz + z);
    colors.push(color.r, color.g, color.b);
  };
  for (const [a, b, c] of triangles) {
    for (const index of [a, b, c]) push(contour[index].x, contour[index].y, y + height, top);
  }
  const rim = new Color(rimHex);
  for (let i = 0; i < contour.length; i += 1) {
    const p = contour[i];
    const q = contour[(i + 1) % contour.length];
    push(p.x, p.y, y, rim);
    push(q.x, q.y, y, rim);
    push(q.x, q.y, y + height, rim);
    push(p.x, p.y, y, rim);
    push(q.x, q.y, y + height, rim);
    push(p.x, p.y, y + height, rim);
  }
}

function buildCursor(): Object3D {
  const t = 0.035;
  const s = 0.9;
  const opts = { color: PALETTE.groundCursor, castShadow: false, receiveShadow: false };
  const node = group("ground-cursor", [
    box([s, 0.02, t], { position: [0, 0, -s / 2], ...opts }),
    box([s, 0.02, t], { position: [0, 0, s / 2], ...opts }),
    box([t, 0.02, s], { position: [-s / 2, 0, 0], ...opts }),
    box([t, 0.02, s], { position: [s / 2, 0, 0], ...opts }),
  ]);
  node.traverse((child) => {
    child.userData.noCollide = true;
  });
  return node;
}
