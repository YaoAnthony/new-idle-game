import { DayPhaseId, WeatherKind } from "core";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  Fog,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
} from "three";
import { PALETTE } from "../Visual/palette.js";
import { blob, box, cylinder, ownMaterial } from "../Visual/primitives.js";

/**
 * 屋外的真实世界（2026-07-30 定稿：告别窗贴画）。
 *
 * 2026-07-29 镜头锁进屋内、房间有了真实屋顶之后，墙外的东西**只能透过
 * 窗洞被看见**——所以外景可以是真 3D 布景，不会穿帮。原来每扇窗背后
 * 压扁在 0.22 米里的"景深盒"贴画（WindowView 的老职责）整个退役。
 *
 * 布景哲学是剧场：只在窗户看得到的方向做细（北面），东西两翼稀疏，
 * 南面几乎不做。世界观：**纯野森林 + 一条河**，没有任何人间烟火——
 * 唯一的例外是阶段 3 的庭院（前人留下的苔石与石灯笼）。
 *
 * 光照的关键决定：外景用**受光材质**，被 Lighting 的方向光/半球光
 * 直接照亮——屋里屋外是同一颗太阳，昼夜变化不需要再维护一份手工调色表。
 * 只有天穹、星星、日月圆盘、云是自发光的（它们本来就是光源或天空本身）。
 */

// ---- 天空渐变（从窗贴画搬来的调色，那套调得不错） ----
const SKY_TOP: Record<DayPhaseId, string> = {
  [DayPhaseId.Dawn]: "#8fa3cc",
  [DayPhaseId.Day]: "#79aede",
  [DayPhaseId.Dusk]: "#6d5a8e",
  [DayPhaseId.Night]: "#131a30",
};

const SKY_BOTTOM: Record<DayPhaseId, string> = {
  [DayPhaseId.Dawn]: "#ffc9a0",
  [DayPhaseId.Day]: "#cfe6f2",
  [DayPhaseId.Dusk]: "#ff9a5e",
  [DayPhaseId.Night]: "#2a3654",
};

const CLOUD_COLORS: Record<DayPhaseId, string> = {
  [DayPhaseId.Dawn]: "#ffd9c4",
  [DayPhaseId.Day]: "#ffffff",
  [DayPhaseId.Dusk]: "#ffb08a",
  [DayPhaseId.Night]: "#3a4666",
};

const STAR_OPACITY: Record<DayPhaseId, number> = {
  [DayPhaseId.Dawn]: 0.12,
  [DayPhaseId.Day]: 0,
  [DayPhaseId.Dusk]: 0.35,
  [DayPhaseId.Night]: 0.95,
};

const SUN_COLOR = "#ffe9a8";
const MOON_COLOR = "#e6ecff";

/**
 * 外景地面与树的基础色。受光材质，昼夜明暗交给灯光，不在这里做。
 * 和室内共用的色值直接取 PALETTE，别抄数值——色板改了外景要跟着变。
 * 森林专用的深绿是新配的，野地本来就该比室内盆栽沉一个调。
 */
const GROUND_GREEN = "#7fa063";
const GROUND_GREEN_DARK = "#6d8c55";
const TREE_GREEN = "#5e7d4f";
const TREE_GREEN_LIGHT = PALETTE.leafGreen;
const TRUNK_BROWN = PALETTE.wallTrim;
const RIVER_BLUE = PALETTE.waterBlue;
const RIVER_FOAM = "#dcedf4";

/**
 * 雾把远树推向天色，是参考画风里"空气感"的来源。
 * near 必须大于室内最远视距（约 20），否则屋里也会起雾。
 */
const FOG_NEAR = 26;
const FOG_FAR = 78;

/**
 * 河的走向：z(x) 的缓波。中景横穿（定稿），庭院和远林之间。
 *
 * 所有"离房子多远"的量都从北墙位置推导（房子尺寸改过一次 16×12→24×16，
 * 写死距离的教训只吃一次）：默认镜头俯角下，视线穿过窗洞落在
 * 北墙外 2~15 一带的地面上——河必须躺在这条**视线走廊**里才看得见。
 */
const RIVER_WIDTH = 2.8;

/** 确定性伪随机：森林每次加载长得一样 */
function hash01(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const RAIN_MAX = 420;
/** 小雨的粒子数。外景比旧窗贴画大得多，密度按面积等比放大 */
const RAIN_COUNT_LIGHT = 190;

export class OutdoorScene {
  readonly root = new Object3D();

  private readonly scene: Scene;
  private readonly fog: Fog;
  private readonly skyGeometry: SphereGeometry;
  private readonly skyMaterial: MeshBasicMaterial;

  private readonly starMaterial: PointsMaterial;
  private starBaseOpacity = 0;

  private readonly celestial: Object3D;
  private readonly celestialDiscMaterial: MeshBasicMaterial;
  private readonly celestialHaloMaterial: MeshBasicMaterial;
  private celestialBody: "sun" | "moon" = "sun";
  private celestialDimming = 1;

  private readonly cloudMaterial: MeshBasicMaterial;
  private readonly clouds: { node: Object3D; speed: number }[] = [];

  /** 河面流光：几条顺流漂的小白条 */
  private readonly streaks: Mesh[] = [];

  private readonly rain: Points;
  private readonly rainVelocities: Float32Array;
  private stormWind = false;

  private elapsed = 0;

  /** 北墙的世界 z（负数）。所有外景距离从它推导 */
  private readonly northZ: number;
  private readonly riverCenter: (x: number) => number;

  constructor(scene: Scene, roomSize: { width: number; depth: number }) {
    this.northZ = -roomSize.depth / 2;
    const riverZ = this.northZ - 11;
    this.riverCenter = (x: number) => riverZ + Math.sin(x * 0.11) * 1.4;
    this.scene = scene;
    this.root.name = "outdoor";

    // ---- 雾 ----
    this.fog = new Fog(new Color(SKY_BOTTOM[DayPhaseId.Day]), FOG_NEAR, FOG_FAR);
    scene.fog = this.fog;

    // ---- 天穹：反转半球，顶点色上下渐变 ----
    this.skyGeometry = new SphereGeometry(85, 28, 14);
    const positions = this.skyGeometry.getAttribute("position");
    const skyColors = new Float32Array(positions.count * 3);
    this.skyGeometry.setAttribute("color", new BufferAttribute(skyColors, 3));

    this.skyMaterial = new MeshBasicMaterial({
      vertexColors: true,
      side: BackSide,
      fog: false,
      depthWrite: false,
    });
    const sky = new Mesh(this.skyGeometry, this.skyMaterial);
    sky.name = "sky-dome";
    sky.renderOrder = -3;
    this.root.add(sky);

    // ---- 星点：贴在天穹内侧的上半球 ----
    this.starMaterial = new PointsMaterial({
      color: "#fff6de",
      size: 0.5,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      fog: false,
      depthWrite: false,
    });
    this.root.add(this.buildStars());

    // ---- 日月 ----
    this.celestialHaloMaterial = new MeshBasicMaterial({
      color: SUN_COLOR,
      transparent: true,
      opacity: 0.26,
      blending: AdditiveBlending,
      fog: false,
      depthWrite: false,
    });
    this.celestialDiscMaterial = new MeshBasicMaterial({
      color: SUN_COLOR,
      transparent: true,
      opacity: 1,
      fog: false,
      depthWrite: false,
    });
    this.celestial = new Object3D();
    this.celestial.name = "celestial";
    this.celestial.renderOrder = -2;
    this.celestial.add(new Mesh(new CircleGeometry(6.5, 24), this.celestialHaloMaterial));
    this.celestial.add(new Mesh(new CircleGeometry(2.6, 24), this.celestialDiscMaterial));
    this.root.add(this.celestial);

    // ---- 云 ----
    this.cloudMaterial = new MeshBasicMaterial({
      color: CLOUD_COLORS[DayPhaseId.Day],
      transparent: true,
      opacity: 0.9,
      fog: false,
      depthWrite: false,
    });
    this.buildClouds();

    // ---- 地面 / 森林 / 河 ----
    this.buildGround();
    this.buildForest();
    this.buildRiver();

    // ---- 雨（真的下在世界里，不再是窗贴画上的粒子） ----
    const rain = this.buildRain();
    this.rain = rain.points;
    this.rainVelocities = rain.velocities;
    this.root.add(this.rain);

    scene.add(this.root);
  }

  // ---- 构建 ----------------------------------------------------------------

  private buildStars(): Points {
    const COUNT = 220;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i += 1) {
      // 均匀铺在上半球，radius 略小于天穹
      const azimuth = hash01(i * 7.3) * Math.PI * 2;
      const altitude = Math.asin(hash01(i * 13.9 + 5));
      const r = 78;
      positions[i * 3] = Math.cos(altitude) * Math.cos(azimuth) * r;
      positions[i * 3 + 1] = Math.sin(altitude) * r * 0.9 + 2;
      positions[i * 3 + 2] = Math.cos(altitude) * Math.sin(azimuth) * r;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const stars = new Points(geometry, this.starMaterial);
    stars.name = "stars";
    stars.renderOrder = -2;
    return stars;
  }

  private buildClouds(): void {
    const layouts = [
      { x: -26, y: 24, z: -46, scale: 4.2, speed: 0.5 },
      { x: 4, y: 28, z: -52, scale: 5.6, speed: 0.34 },
      { x: 30, y: 22, z: -44, scale: 3.4, speed: 0.62 },
      { x: -48, y: 26, z: -30, scale: 4.6, speed: 0.4 },
    ];

    for (const layout of layouts) {
      const cloud = new Object3D();
      cloud.name = "cloud";
      const puffs: Array<[number, number, number]> = [
        [0, 0, 1],
        [-0.9, -0.12, 0.7],
        [0.85, -0.16, 0.6],
      ];
      for (const [px, py, pr] of puffs) {
        const puff = new Mesh(
          new SphereGeometry(layout.scale * pr * 0.5, 10, 7),
          this.cloudMaterial,
        );
        puff.position.set(layout.scale * px * 0.6, layout.scale * py, 0);
        puff.scale.y = 0.55;
        cloud.add(puff);
      }
      cloud.position.set(layout.x, layout.y, layout.z);
      this.clouds.push({ node: cloud, speed: layout.speed });
      this.root.add(cloud);
    }
  }

  private buildGround(): void {
    // 大草地。房子地板自己有网格，外景地面压低一点避免共面
    const ground = box([170, 0.1, 150], {
      color: GROUND_GREEN,
      position: [0, -0.08, -20],
    });
    ground.receiveShadow = true;
    this.root.add(ground);

    // 几块深色草斑打破单调。必须是**零厚度的贴地圆片**——
    // 用扁盒子的话，窗里以掠射角看过去侧面会露出来，像浮空的台阶
    for (let i = 0; i < 9; i += 1) {
      const px = (hash01(i * 3.1) - 0.5) * 90;
      const pz = this.northZ - 2 - hash01(i * 5.7) * 40;
      const size = 3 + hash01(i * 9.3) * 6;
      const patch = new Mesh(
        new CircleGeometry(size / 2, 10),
        ownMaterial(GROUND_GREEN_DARK),
      );
      patch.rotation.x = -Math.PI / 2;
      patch.scale.y = 0.7;
      patch.position.set(px, -0.015, pz);
      patch.receiveShadow = true;
      this.root.add(patch);
    }
  }

  /**
   * 野森林。**关键不是数量是高度**：默认镜头是俯视的，视线穿过窗洞
   * 一路向下，外面必须有竖起来的东西接住视线，否则满窗都是草地。
   * 所以河对岸是一道又高又密的林墙，河这边散几棵近树给窗景当前景。
   * 庭院预留区（x 0..10, z -6..-14）留空，阶段 3 摆苔石和樱花树。
   */
  private buildForest(): void {
    const trees: Array<[number, number, number]> = [];

    // 庭院预留区：落地窗正外（窗世界 x 由 wallWidth-7 推出，24 宽时是 5..10）
    const gardenMinX = 3.5;
    const gardenMaxX = 11.5;

    for (let i = 0; i < 34; i += 1) {
      // 河对岸的主林墙：高大、紧密，是窗景的"绿色背景板"
      const x = (hash01(i * 3.3) - 0.5) * 96;
      const z = this.northZ - 12.5 - hash01(i * 7.1) * 13;
      trees.push([x, z, 1.5 + hash01(i * 17.7) * 1.1]);
    }

    for (let i = 40; i < 52; i += 1) {
      // 河这一侧的近树：给厨房小窗当画框前景，避开庭院预留区
      const pick = hash01(i * 3.9);
      const x = pick < 0.45 ? -3 - hash01(i * 5.1) * 24 : 12 + hash01(i * 5.3) * 22;
      if (x > gardenMinX && x < gardenMaxX) continue;
      trees.push([x, this.northZ - 2.5 - hash01(i * 6.7) * 5, 0.9 + hash01(i * 9.1) * 0.5]);
    }

    for (let i = 60; i < 70; i += 1) {
      // 东西两翼（门口方向也要有树可看）
      const x = (hash01(i * 4.7) < 0.5 ? -1 : 1) * (16 + hash01(i * 8.9) * 26);
      trees.push([x, 6 - hash01(i * 6.1) * 16, 0.9 + hash01(i * 13.9) * 0.7]);
    }

    // 远丘：三座压扁的绿色圆顶垫在林墙后面，把地平线抬起来，
    // 雾一罩就是参考画风里那种远处发白的层次
    const hills: Array<[number, number, number, number]> = [
      [-34, -48, 22, 9],
      [10, -54, 30, 12],
      [46, -46, 20, 8],
    ];
    for (const [hx, hz, hr, hh] of hills) {
      // blob 第二参数是细分级别不是随机种子——传坐标进去要么几百万面要么直接空掉
      const hill = blob(hr, 1, {
        color: "#54724a",
        position: [hx, 0, hz],
        castShadow: false,
      });
      hill.scale.y = hh / hr;
      hill.receiveShadow = false;
      this.root.add(hill);
    }

    for (let i = 0; i < trees.length; i += 1) {
      const [x, z, scale] = trees[i];
      const tree = new Object3D();

      const trunkHeight = 1.1 * scale + hash01(i * 2.9) * 0.6;
      const trunk = cylinder(0.12 * scale, 0.17 * scale, trunkHeight, 5, {
        color: TRUNK_BROWN,
        position: [0, trunkHeight / 2, 0],
        castShadow: false,
      });
      tree.add(trunk);

      const crownColor = hash01(i * 11.3) < 0.4 ? TREE_GREEN_LIGHT : TREE_GREEN;
      // 细分固定 0：低多边形树冠要的就是那股棱角。形态差异靠 scale 和旋转
      const crown = blob(0.85 * scale, 0, {
        color: crownColor,
        position: [0, trunkHeight + 0.55 * scale, 0],
        castShadow: false,
      });
      tree.add(crown);

      if (hash01(i * 6.3) > 0.55) {
        const side = blob(0.5 * scale, 0, {
          color: crownColor,
          position: [0.55 * scale, trunkHeight + 0.25 * scale, 0.1],
          castShadow: false,
        });
        tree.add(side);
      }

      tree.position.set(x, 0, z);
      tree.rotation.y = hash01(i * 23.1) * Math.PI * 2;
      this.root.add(tree);
    }
  }

  /** 河：一条缓波的三角带，两岸各镶一线浅色"岸沫" */
  private buildRiver(): void {
    const SEGMENTS = 36;
    const X_MIN = -70;
    const X_MAX = 70;

    const buildStrip = (halfWidth: number, y: number, color: string): Mesh => {
      const positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
      const indices = new Uint32Array(SEGMENTS * 6);

      for (let i = 0; i <= SEGMENTS; i += 1) {
        const x = X_MIN + ((X_MAX - X_MIN) * i) / SEGMENTS;
        const center = this.riverCenter(x);
        const offset = i * 6;
        positions[offset] = x;
        positions[offset + 1] = y;
        positions[offset + 2] = center - halfWidth;
        positions[offset + 3] = x;
        positions[offset + 4] = y;
        positions[offset + 5] = center + halfWidth;
      }
      for (let i = 0; i < SEGMENTS; i += 1) {
        const a = i * 2;
        const offset = i * 6;
        indices[offset] = a;
        indices[offset + 1] = a + 2;
        indices[offset + 2] = a + 1;
        indices[offset + 3] = a + 1;
        indices[offset + 4] = a + 2;
        indices[offset + 5] = a + 3;
      }

      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setIndex(new BufferAttribute(indices, 1));
      geometry.computeVertexNormals();

      const mesh = new Mesh(geometry, ownMaterial(color));
      mesh.receiveShadow = true;
      return mesh;
    };

    // 岸沫垫在水面下、更宽一圈，露出的边就是两条浅色岸线
    this.root.add(buildStrip(RIVER_WIDTH / 2 + 0.22, 0.005, RIVER_FOAM));
    this.root.add(buildStrip(RIVER_WIDTH / 2, 0.02, RIVER_BLUE));

    // 流光小白条：顺流（+x）漂，出界回绕
    for (let i = 0; i < 7; i += 1) {
      const streak = box([0.9, 0.015, 0.09], {
        color: RIVER_FOAM,
        position: [X_MIN + hash01(i * 4.1) * (X_MAX - X_MIN), 0.035, 0],
        castShadow: false,
      });
      this.streaks.push(streak);
      this.root.add(streak);
    }
  }

  private buildRain(): { points: Points; velocities: Float32Array } {
    const positions = new Float32Array(RAIN_MAX * 3);
    const velocities = new Float32Array(RAIN_MAX);

    for (let i = 0; i < RAIN_MAX; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 70;
      positions[i * 3 + 1] = Math.random() * 20;
      // 近界必须退到北墙之外，否则有一撮雨会悬在客厅中央下个不停
      positions[i * 3 + 2] = this.northZ - 1.5 - Math.random() * 32;
      velocities[i] = 9 + Math.random() * 7;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));

    const material = new PointsMaterial({
      color: "#cfe3f5",
      size: 0.14,
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
    });

    const points = new Points(geometry, material);
    points.name = "outdoor-rain";
    points.visible = false;
    return { points, velocities };
  }

  // ---- 状态应用与逐帧更新 --------------------------------------------------

  apply(phase: DayPhaseId, weather: WeatherKind): void {
    // 天穹渐变：按顶点高度插值。地平线附近吃 SKY_BOTTOM，天顶吃 SKY_TOP
    const top = new Color(SKY_TOP[phase]);
    const bottom = new Color(SKY_BOTTOM[phase]);
    const positions = this.skyGeometry.getAttribute("position");
    const colors = this.skyGeometry.getAttribute("color") as BufferAttribute;
    const mixed = new Color();
    for (let i = 0; i < positions.count; i += 1) {
      const t = Math.min(Math.max(positions.getY(i) / 60, 0), 1);
      mixed.copy(bottom).lerp(top, t);
      colors.setXYZ(i, mixed.r, mixed.g, mixed.b);
    }
    colors.needsUpdate = true;

    // 雾色贴地平线，远树被推向天色
    this.fog.color.set(SKY_BOTTOM[phase]).multiplyScalar(0.96);

    const raining = weather === WeatherKind.Rain || weather === WeatherKind.Storm;
    const overcast = raining || weather === WeatherKind.Cloudy;

    this.cloudMaterial.color.set(CLOUD_COLORS[phase]);
    if (overcast) this.cloudMaterial.color.multiplyScalar(0.72);
    this.cloudMaterial.opacity = overcast ? 0.96 : 0.88;

    this.starBaseOpacity = overcast ? 0 : STAR_OPACITY[phase];
    this.starMaterial.opacity = this.starBaseOpacity;

    // 密度分级不能丢：小雨和暴雨的差别主要靠粒子数，只调透明度会让小雨也像暴雨
    this.rain.visible = raining;
    this.rain.geometry.setDrawRange(
      0,
      weather === WeatherKind.Storm ? RAIN_MAX : RAIN_COUNT_LIGHT,
    );
    this.stormWind = weather === WeatherKind.Storm;
    (this.rain.material as PointsMaterial).opacity =
      weather === WeatherKind.Storm ? 0.85 : 0.6;

    this.celestialDimming = raining ? 0.22 : overcast ? 0.5 : 1;
  }

  /**
   * 日月挂在真天空上，东升（+x）西落（-x），走北侧（-z）弧线——
   * 和 Lighting 的方向光同一侧，光和光源看起来是一回事。
   */
  setCelestial(body: "sun" | "moon", progress: number): void {
    if (body !== this.celestialBody) {
      this.celestialBody = body;
      const color = body === "sun" ? SUN_COLOR : MOON_COLOR;
      this.celestialDiscMaterial.color.set(color);
      this.celestialHaloMaterial.color.set(color);
      this.celestial.scale.setScalar(body === "sun" ? 1 : 0.78);
    }

    const t = Math.max(0, Math.min(1, progress));
    const arc = Math.sin(t * Math.PI);

    this.celestial.position.set(
      Math.cos(t * Math.PI) * 46,
      4 + arc * 30,
      -56,
    );
    this.celestial.lookAt(0, 2, 0);

    const altitude = 0.35 + 0.65 * arc;
    this.celestialDiscMaterial.opacity = altitude * this.celestialDimming;
    this.celestialHaloMaterial.opacity = 0.28 * altitude * this.celestialDimming;
    this.celestial.visible = this.celestialDiscMaterial.opacity > 0.02;
  }

  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;

    for (const cloud of this.clouds) {
      cloud.node.position.x += cloud.speed * deltaSeconds;
      if (cloud.node.position.x > 62) cloud.node.position.x = -62;
    }

    if (this.starBaseOpacity > 0) {
      this.starMaterial.opacity =
        this.starBaseOpacity * (0.86 + 0.14 * Math.sin(this.elapsed * 1.7));
    }

    // 河面流光顺流漂
    for (let i = 0; i < this.streaks.length; i += 1) {
      const streak = this.streaks[i];
      streak.position.x += (0.9 + hash01(i * 7.7) * 0.5) * deltaSeconds;
      if (streak.position.x > 70) streak.position.x = -70;
      streak.position.z = this.riverCenter(streak.position.x) + (hash01(i * 3.7) - 0.5) * 1.6;
    }

    if (!this.rain.visible) return;

    const attribute = this.rain.geometry.getAttribute("position") as BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let i = 0; i < RAIN_MAX; i += 1) {
      const index = i * 3 + 1;
      array[index] -= this.rainVelocities[i] * deltaSeconds;
      if (this.stormWind) {
        array[i * 3] -= 3.2 * deltaSeconds;
        if (array[i * 3] < -35) array[i * 3] = 35;
      }
      if (array[index] < 0) array[index] = 20;
    }
    attribute.needsUpdate = true;
  }

  dispose(): void {
    if (this.scene.fog === this.fog) this.scene.fog = null;
    this.root.removeFromParent();
    // 外景的几何体量远大于家具，不能只靠 renderer.dispose() 兜底
    this.root.traverse((node) => {
      if (node instanceof Mesh || node instanceof Points) {
        node.geometry.dispose();
      }
    });
  }
}
