import { Object3D, type Scene } from "three";

import { on } from "../../Game/EventBus";
import {
  allPlots,
  hasTerritory,
  isInsideTerritory,
  ownedBoundaryEdges,
} from "../../Game/State/territory";
import { groundHeightAt } from "../../Game/State/worldRuntime";
import { PALETTE, jitterShade } from "../Visual/palette";
import { blob, box, cylinder, disposeTree, group } from "../Visual/primitives";
import { hash01 } from "./outdoorTerrain";

/**
 * 领地看得见的那一层：**已开地的绳索围栏** + **锁定格的杂草和地标**。
 *
 * 一条纪律：**围栏不注册 obstacle，也不进占用图。** 拦人的只有
 * `isInsideTerritory` 一处（`doorsRuntime` 的 `outdoorPass`）。围栏是它的
 * 可视化，两者各拦各的话，迟早出现"看得见的边和走得到的边对不上"——
 * 上一轮围墙就是这么翻的车（可走范围放开到河岸，墙还站在老位置）。
 *
 * 地块变化是**稀有事件**，所以整组重建不做增量：一次 `world_changed`
 * reason `territory` 全拆全建。增量的复杂度（哪根桩要删、哪丛草要留）
 * 换来的性能在这个频率下等于零。
 */

/** 桩子每隔几格立一根 */
const POST_SPACING = 2;
const POST_HEIGHT = 0.9;
/** 杂草密度：每 3×3 格一丛 */
const GRASS_STEP = 3;

export class TerritoryView {
  readonly root = new Object3D();
  private readonly offListeners: Array<() => void> = [];

  constructor(private readonly scene: Scene) {
    this.root.name = "territory";
    this.scene.add(this.root);
    this.rebuild();

    this.offListeners.push(
      on("world_changed", ({ reason }) => {
        if (reason === "territory") this.rebuild();
      }),
    );
  }

  private clear(): void {
    for (const child of [...this.root.children]) {
      this.root.remove(child);
      disposeTree(child);
    }
  }

  private rebuild(): void {
    this.clear();
    if (!hasTerritory()) return;

    this.buildFence();
    this.buildLockedPlots();
  }

  /**
   * 沿已开地的外轮廓立木桩 + 拉绳。
   *
   * 桩子踩地形高度（`groundHeightAt`），不是一律 y=0——领地里有起伏，
   * 一排等高的桩子在坡上会半截埋进土里、半截浮在空中。
   */
  private buildFence(): void {
    const edges = ownedBoundaryEdges();
    if (edges.length === 0) return;

    const fence = group("territory-fence", []);

    /*
     * 桩子按**格点**去重再立，不是每条边各立两根：轮廓上相邻两段共用
     * 一个端点，不去重的话每个拐角都会叠两根桩，抖色一叠就露馅。
     */
    const posts = new Set<string>();
    for (const edge of edges) {
      for (const [x, z] of [edge.from, edge.to]) {
        if (x % POST_SPACING === 0 && z % POST_SPACING === 0) {
          posts.add(`${x},${z}`);
        }
      }
    }

    for (const key of posts) {
      const [x, z] = key.split(",").map(Number);
      const y = groundHeightAt(x, z);
      fence.add(
        cylinder(0.07, 0.09, POST_HEIGHT, 6, {
          position: [x, y + POST_HEIGHT / 2, z],
          color: jitterShade(PALETTE.woodMid, x, z),
        }),
      );
    }

    // 绳：每条轮廓段一根细长条，压在桩子上沿附近
    for (const edge of edges) {
      const [x1, z1] = edge.from;
      const [x2, z2] = edge.to;
      const midX = (x1 + x2) / 2;
      const midZ = (z1 + z2) / 2;
      const y = groundHeightAt(midX, midZ) + POST_HEIGHT * 0.78;
      const alongX = z1 === z2;
      fence.add(
        box(alongX ? [1, 0.035, 0.035] : [0.035, 0.035, 1], {
          position: [midX, y, midZ],
          color: PALETTE.paperShade,
          // 一根绳不值得投影，投了也只是地上一条毛边
          castShadow: false,
        }),
      );
    }

    this.root.add(fence);
  }

  /**
   * 锁定格的样子（决策 T7）：**杂草丛生，但有特别建筑勾引玩家**。
   *
   * 杂草位置和大小都从 `hash01(格坐标)` 推——确定性的，每次重建长一样。
   * 用随机数的话开一块地重建一次，剩下那些格的草会集体换姿势，看起来像
   * 整片地抖了一下。
   *
   * 1B-0 清场之后格里没有别的东西，所以杂草不用避让谁。
   */
  private buildLockedPlots(): void {
    const weeds = group("territory-weeds", []);
    const landmarks = group("territory-landmarks", []);

    for (const plot of allPlots()) {
      // 用格心问一次就够：一块地要么整块开了要么整块锁着
      const centerX = (plot.rect.minX + plot.rect.maxX) / 2;
      const centerZ = (plot.rect.minZ + plot.rect.maxZ) / 2;
      if (isInsideTerritory(centerX, centerZ)) continue;

      for (let x = plot.rect.minX; x < plot.rect.maxX; x += GRASS_STEP) {
        for (let z = plot.rect.minZ; z < plot.rect.maxZ; z += GRASS_STEP) {
          const seed = hash01(x * 73.1 + z * 19.7);
          const px = x + 0.5 + (seed - 0.5) * 2;
          const pz = z + 0.5 + (hash01(x * 11.3 + z * 41.9) - 0.5) * 2;
          const radius = 0.28 + seed * 0.22;
          weeds.add(
            blob(radius, 0, {
              position: [px, groundHeightAt(px, pz) + radius * 0.6, pz],
              color: jitterShade(
                seed > 0.5 ? PALETTE.leafGreen : PALETTE.caneGreen,
                x,
                z,
                0.06,
              ),
              castShadow: false,
            }),
          );
        }
      }

      /*
       * 地标：**只在该格锁定时出现**，解锁后随整组重建消失。
       * 纯布景——不注册 obstacle、不进占用图、不可交互。走不到它们
       * （格是锁的），只能看见，那就是它全部的作用。
       */
      const visual = plot.lockedVisual;
      if (visual) {
        const built = buildLandmark(visual.landmarkId, visual.at);
        if (built) landmarks.add(built);
      }
    }

    this.root.add(weeds);
    this.root.add(landmarks);
  }

  dispose(): void {
    for (const off of this.offListeners) off();
    this.clear();
    this.scene.remove(this.root);
  }
}

/**
 * 三个勾人的地标。**认不出的 id 返回 null 而不是抛**——地标是内容数据，
 * 打错一个 id 的代价该是"那儿少个东西"，不是整张图起不来。
 */
function buildLandmark(
  landmarkId: string,
  at: { x: number; z: number },
): Object3D | null {
  const y = groundHeightAt(at.x, at.z);

  switch (landmarkId) {
    // 旧桥头灯柱：看得见通往小镇的路在那边
    case "landmark_bridge_lamp":
      return group("landmark-bridge-lamp", [
        box([1.1, 0.35, 1.1], {
          position: [at.x, y + 0.17, at.z],
          color: PALETTE.baseStoneDark,
        }),
        cylinder(0.12, 0.16, 2.6, 6, {
          position: [at.x, y + 1.65, at.z],
          color: PALETTE.baseStone,
        }),
        box([0.42, 0.5, 0.42], {
          position: [at.x, y + 3.15, at.z],
          color: PALETTE.ironMid,
        }),
      ]);

    // 废井：西边最远，给一个"那儿有点东西"的理由
    case "landmark_old_well":
      return group("landmark-old-well", [
        cylinder(1.0, 1.1, 0.9, 8, {
          position: [at.x, y + 0.45, at.z],
          color: PALETTE.baseStoneMoss,
        }),
        cylinder(0.9, 0.9, 0.12, 8, {
          position: [at.x, y + 0.86, at.z],
          color: PALETTE.baseStoneDark,
        }),
        // 两根木架 + 一道横梁：远看就知道这是口井不是块石头
        box([0.14, 1.8, 0.14], {
          position: [at.x - 0.85, y + 1.35, at.z],
          color: PALETTE.woodDark,
        }),
        box([0.14, 1.8, 0.14], {
          position: [at.x + 0.85, y + 1.35, at.z],
          color: PALETTE.woodDark,
        }),
        box([2.0, 0.14, 0.14], {
          position: [at.x, y + 2.2, at.z],
          color: PALETTE.woodMid,
        }),
      ]);

    // 半塌的石碑：北面后庭，暗示这块地有故事
    case "landmark_broken_stele":
      return group("landmark-broken-stele", [
        box([1.4, 0.28, 1.0], {
          position: [at.x, y + 0.14, at.z],
          color: PALETTE.baseStoneDark,
        }),
        // 斜插的石板——"半塌"全靠这个角度，立直了就只是一块碑
        box([1.0, 2.2, 0.22], {
          position: [at.x, y + 1.15, at.z],
          rotation: [0, 0, 0.28],
          color: PALETTE.baseStone,
        }),
        box([0.6, 0.5, 0.2], {
          position: [at.x + 0.9, y + 0.3, at.z + 0.3],
          rotation: [0, 0.5, 1.2],
          color: PALETTE.baseStoneMoss,
        }),
      ]);

    default:
      return null;
  }
}
