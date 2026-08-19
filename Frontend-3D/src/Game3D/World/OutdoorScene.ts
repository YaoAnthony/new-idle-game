import { DayPhaseId, type WeatherDefinition } from "core";
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
import { weatherVisualProfileOf } from "../Visual/weatherProfiles.js";
import { getCurrentMap } from "../../Game/State/worldRuntime";
import {
  hash01,
  type OutdoorTerrain,
  type OutdoorTerrainBuilder,
} from "./outdoorTerrain.js";

/**
 * 屋外的**天气机器**（箱庭③拆分后的职责）。
 *
 * 天穹、星、日月、云、雾、雨——这些每张箱庭都一样，留在这里；
 * 草地、森林、河、地标——每张图各不相同，住在 Maps/<id>/outdoor.ts，
 * 由构造时传进来的地形配方建。在此之前 770 行的 OutdoorScene 把
 * home 的森林河流写死在类里，加第二张图只能整个抄一份。
 *
 * 光照的关键决定不变：外景用**受光材质**，被 Lighting 的方向光/半球光
 * 直接照亮——屋里屋外是同一颗太阳。只有天穹、星星、日月圆盘、云是
 * 自发光的（它们本来就是光源或天空本身）。
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

/**
 * 大雾天的雾色 = 天光被雾漫射后的颜色：**有多少光就多亮**。
 *
 * 第一版写死近白 #e6e9eb（只掺 25% 天色），白天对，夜里就错了——
 * 00:50 的院子雾还是白晃晃的，像有人在天上开了盏灯。真实的夜雾是
 * 暗蓝灰：只有月光/灯光可散射，比晴夜的地平线亮一点（雾比清空气散射
 * 得多），但离白很远。这里按时段给"从天色往白抬多少"：白天抬满、
 * 晨昏抬一半（暖色被雾洗淡）、夜里只抬一点。灯下的局部亮由清晰度场
 * （FogField）负责，不在全局雾色里做。
 */
const FOG_WHITE = "#e6e9eb";
const FOG_LIFT: Record<DayPhaseId, number> = {
  [DayPhaseId.Dawn]: 0.5,
  [DayPhaseId.Day]: 0.75,
  [DayPhaseId.Dusk]: 0.5,
  [DayPhaseId.Night]: 0.1,
};
// 注意 lerp 发生在线性空间（ColorManagement 开着），感知上比数字亮：
// 夜里 0.1 出来是 sRGB 约 #5c6473 的蓝灰，0.2 就已经偏亮了

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
 * 雾把远景推向天色，是参考画风里"空气感"的来源。
 *
 * near 必须大于室内最远视距（约 20），否则屋里也会起雾。
 * far 一度是 78——那是按"院子 + 一圈树"的老尺度定的，小镇长出
 * 两排店铺的商业街（进深近 70）之后，站在街这头看那头整排店铺白成
 * 一片。远景该淡，**在演的东西不该淡**：far 推到 190，雾只负责收
 * 远山和对岸，不再吃掉正在逛的那条街。
 */
const FOG_NEAR = 48;
const FOG_FAR = 190;

/**
 * 全景模式的大气参数（/overview 用）。
 *
 * 天穹半径 85 是按"人站在地面上"定的——镜头一升到几十米高、退到
 * 上百米远就飞到穹顶外面去了（BackSide 的球从外面看是空的，天会没）。
 * 雾也一样：near 48 的雾在那个距离上会把整张图糊成一片天色。
 *
 * 所以全景期间把天穹整个放大、雾整体外推，退出时还原。**不是永久
 * 改大**：穹顶放大之后云和星点的相对位置就散了，日常视角看着不对，
 * 而全景只看几秒，那几秒里没人盯着云。
 */
const OVERVIEW_SKY_SCALE = 3.2;
const OVERVIEW_FOG_NEAR = 220;
const OVERVIEW_FOG_FAR = 560;

/** 雨滴粒子池的上限（各天气档的 rain.count 不得超过它） */
const RAIN_MAX = 420;

export class OutdoorScene {
  readonly root = new Object3D();

  private readonly scene: Scene;
  private readonly fog: Fog;
  private readonly skyGeometry: SphereGeometry;
  private readonly skyMaterial: MeshBasicMaterial;
  private readonly sky: Mesh;

  private readonly starMaterial: PointsMaterial;
  private starBaseOpacity = 0;

  private readonly celestial: Object3D;
  private readonly celestialDiscMaterial: MeshBasicMaterial;
  private readonly celestialHaloMaterial: MeshBasicMaterial;
  private celestialBody: "sun" | "moon" = "sun";
  private celestialDimming = 1;

  private readonly cloudMaterial: MeshBasicMaterial;
  private readonly clouds: { node: Object3D; speed: number }[] = [];

  private readonly rain: Points;
  private readonly rainVelocities: Float32Array;
  private stormWind = false;
  private windy = false;
  /** 当前天气的雾距缩放（全景退出时要按它复原，不是复原到 1） */
  private weatherFogScale = { near: 1, far: 1 };
  private overviewActive = false;
  /*
   * 曾经这里有个 indoors 开关："人在屋里就把雾距推回默认"。那是错的
   * 修法：一进屋整张图的雾都散了，从窗户看出去树是清的。**天气不进屋**
   * 现在由 Engine/fogShelter 在着色器里按射线穿过房子 AABB 的长度算，
   * 雾距全天候按天气档走，屋里屋外各得其所。
   */

  /** 这张图的地形（Maps/<id>/outdoor.ts 建的） */
  private readonly terrain: OutdoorTerrain;

  private elapsed = 0;

  /** 北墙的世界 z（负数）。所有外景距离从它推导 */
  private readonly northZ: number;

  constructor(
    scene: Scene,
    roomSize: { width: number; depth: number },
    terrainBuilder: OutdoorTerrainBuilder,
  ) {
    this.northZ = -roomSize.depth / 2;
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
    this.sky = new Mesh(this.skyGeometry, this.skyMaterial);
    this.sky.name = "sky-dome";
    this.sky.renderOrder = -3;
    this.root.add(this.sky);

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

    // ---- 地形：这张图自己的草地/树/河/地标 ----
    this.terrain = terrainBuilder({ roomSize, northZ: this.northZ });
    this.root.add(this.terrain.root);

    // ---- 雨（真的下在世界里） ----
    const rain = this.buildRain();
    this.rain = rain.points;
    this.rainVelocities = rain.velocities;
    this.root.add(this.rain);

    /*
     * **整个室外世界沉到室内地板之下**（V0.13）。
     *
     * 世界 y=0 是室内地板，房子架空在院子之上（和式住宅的床高，
     * 见 MapDefinition.floorLevel）。地形建在"地面 = 0"的本地系里，
     * 整组下沉一次就位。天穹/日月/雨跟着沉，在 85 半径的天球尺度上
     * 看不出来。露天广场的图 floorLevel = 0，正好不沉。
     */
    this.root.position.y = -getCurrentMap().floorLevel;

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

  apply(phase: DayPhaseId, weather: WeatherDefinition): void {
    const look = weatherVisualProfileOf(weather);
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

    // 雾色贴地平线，远树被推向天色。大雾天从天色往白抬（抬多少看时段，
    // 见 FOG_LIFT）：白天沿用天色×0.96 出来是一片水泥灰，夜里写死近白又
    // 成了天上开灯——两头都错过一次
    if (look.visibilityField) this.fog.color.set(SKY_BOTTOM[phase]).lerp(new Color(FOG_WHITE), FOG_LIFT[phase]);
    else this.fog.color.set(SKY_BOTTOM[phase]).multiplyScalar(0.96);
    // 全局雾距按天气档缩放（大雾把 48/190 压到 3/22）；全景期间另有一套，
    // setOverviewAtmosphere 会盖过去
    this.weatherFogScale = look.fogScale;
    this.applyFogDistance();

    this.cloudMaterial.color.set(CLOUD_COLORS[phase]);
    if (look.clouds.overcast) this.cloudMaterial.color.multiplyScalar(0.72);
    this.cloudMaterial.opacity = look.clouds.opacity;

    this.starBaseOpacity = look.starsVisible ? STAR_OPACITY[phase] : 0;
    this.starMaterial.opacity = this.starBaseOpacity;

    // 密度分级不能丢：小雨和暴雨的差别主要靠粒子数，只调透明度会让小雨也像暴雨
    this.rain.visible = look.rain.count > 0;
    this.rain.geometry.setDrawRange(0, Math.min(RAIN_MAX, look.rain.count));
    (this.rain.material as PointsMaterial).opacity = look.rain.opacity;
    // 风：连续量。>0.9 才算暴风（雨丝横着飞），>0.3 算有风（树梢/云动）
    this.stormWind = look.windSlant > 0.9;
    this.windy = look.windSlant > 0.3;

    this.celestialDimming = look.celestialDimming;
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

    // 地形自己的动画（河的流光、花瓣…）
    this.terrain.update?.(deltaSeconds, this.elapsed, { windy: this.windy });

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

  /** 当前全局雾色（雾毯要和它一个色，不然地上一层白、空气里一层灰） */
  get fogColor(): Color {
    return this.fog.color;
  }

  /**
   * 全景模式的大气开关：天穹放大、雾外推，退出还原。
   *
   * 只动这两样，云/星/日月不跟着放大——它们贴在原来那圈半径上，从
   * 高空看会显得离得近。全景是几秒钟的截图工具，为它把整套天象参数
   * 化一遍不值当；真正会毁掉截图的只有"没有天"和"全是雾"这两件。
   */
  setOverviewAtmosphere(active: boolean): void {
    this.overviewActive = active;
    this.sky.scale.setScalar(active ? OVERVIEW_SKY_SCALE : 1);
    this.applyFogDistance();
  }

  /**
   * 雾距二选一：全景（推到天穹外）> 当前天气档。两处各自改 fog.near/far
   * 的写法删了——互相覆盖，谁最后写谁赢，退出全景会把天气档冲掉。
   * 屋里不在这里管（见类头注释）。
   */
  private applyFogDistance(): void {
    if (this.overviewActive) {
      this.fog.near = OVERVIEW_FOG_NEAR;
      this.fog.far = OVERVIEW_FOG_FAR;
    } else {
      this.fog.near = FOG_NEAR * this.weatherFogScale.near;
      this.fog.far = FOG_FAR * this.weatherFogScale.far;
    }
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
