import { DayPhaseId, WeatherKind } from "core";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
} from "three";
import { blob, cylinder, ownMaterial } from "../Visual/primitives.js";
import type { WindowAnchor } from "./RoomBuilder.js";

/**
 * 窗外的"景深盒" + 窗边的室内氛围粒子。
 *
 * 房间是封闭的盒子，不做室外场景——窗户是屋内唯一的对外通道，
 * 天气、昼夜、外面世界的存在感全靠它传达。所以窗后不能只贴一块死色板。
 *
 * 层次（从远到近，全部塞在 0.22 的极扁深度里）：
 *   渐变天空底 → 星点 → 漂移云朵 → 远山剪影 → 近山剪影 → 树剪影 → 雨粒子
 * 窗内侧另有两样东西：雨天玻璃的微光淅沥感、晴天斜射进屋的尘埃微粒。
 *
 * 成本是十几个面片加两个粒子发射器，但镜头移动时层与层之间有视差，
 * 昼夜切换时整扇窗像一幅会换颜色的画。
 */

// ---- 分层色板（按昼夜阶段） ------------------------------------------------
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

const HILL_FAR_COLORS: Record<DayPhaseId, string> = {
  [DayPhaseId.Dawn]: "#8d90ab",
  [DayPhaseId.Day]: "#9db4a8",
  [DayPhaseId.Dusk]: "#7e6a86",
  [DayPhaseId.Night]: "#232c44",
};

const HILL_NEAR_COLORS: Record<DayPhaseId, string> = {
  [DayPhaseId.Dawn]: "#68766b",
  [DayPhaseId.Day]: "#6f9a71",
  [DayPhaseId.Dusk]: "#544f68",
  [DayPhaseId.Night]: "#1a2236",
};

const SILHOUETTE_COLORS: Record<DayPhaseId, string> = {
  [DayPhaseId.Dawn]: "#4a5a52",
  [DayPhaseId.Day]: "#5c7a56",
  [DayPhaseId.Dusk]: "#3f4348",
  [DayPhaseId.Night]: "#161d2c",
};

const CLOUD_COLORS: Record<DayPhaseId, string> = {
  [DayPhaseId.Dawn]: "#ffd9c4",
  [DayPhaseId.Day]: "#ffffff",
  [DayPhaseId.Dusk]: "#ffb08a",
  [DayPhaseId.Night]: "#3a4666",
};

const CLOUD_OPACITY: Record<DayPhaseId, number> = {
  [DayPhaseId.Dawn]: 0.85,
  [DayPhaseId.Day]: 0.92,
  [DayPhaseId.Dusk]: 0.85,
  [DayPhaseId.Night]: 0.4,
};

const STAR_OPACITY: Record<DayPhaseId, number> = {
  [DayPhaseId.Dawn]: 0.12,
  [DayPhaseId.Day]: 0,
  [DayPhaseId.Dusk]: 0.35,
  [DayPhaseId.Night]: 0.95,
};

/** 尘埃只在"阳光照得进来"的时段可见 */
const DUST_OPACITY: Record<DayPhaseId, number> = {
  [DayPhaseId.Dawn]: 0.26,
  [DayPhaseId.Day]: 0.3,
  [DayPhaseId.Dusk]: 0.26,
  [DayPhaseId.Night]: 0,
};
// ---------------------------------------------------------------------------

/**
 * 关键约束：没有屋顶、相机俯视，墙后的东西会被从墙顶上方直接看到。
 * 相机仰角 38° 时，墙后距离 d 处只有 y < 墙高 - d·tan(38°) 的区域被墙挡住。
 * 所以整个景深盒必须压得很扁、贴紧墙背面，藏进这个视线阴影里。
 */
const SKY_DISTANCE = 0.215;
const STAR_DISTANCE = 0.205;
const CLOUD_DISTANCE = 0.18;
const HILL_FAR_DISTANCE = 0.155;
const HILL_NEAR_DISTANCE = 0.135;
const SILHOUETTE_DISTANCE = 0.12;

/** 雨滴池上限；实际密度按天气用 drawRange 分级 */
const RAIN_MAX = 160;
const RAIN_COUNT_RAIN = 90;
const RAIN_COUNT_STORM = 160;

const STAR_COUNT = 48;
const DUST_COUNT = 60;
/** 尘埃向屋内延伸的深度（局部 +Z 是屋内方向） */
const DUST_DEPTH = 3.2;

/** 确定性伪随机：同一扇窗每次加载得到同样的山形/星空 */
function hash01(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class WindowView {
  readonly root: Object3D;

  private readonly skyGeometry: BufferGeometry;
  private readonly silhouetteMaterials: ReturnType<typeof ownMaterial>[] = [];
  private readonly hillFarMaterial: MeshBasicMaterial;
  private readonly hillNearMaterial: MeshBasicMaterial;
  private readonly cloudMaterial: MeshBasicMaterial;
  private readonly clouds: { node: Object3D; speed: number }[] = [];
  private readonly starMaterial: PointsMaterial;
  private starBaseOpacity = 0;

  private readonly rain: Points;
  private readonly rainVelocities: Float32Array;
  private stormWind = false;

  private readonly glassGlow: Mesh;
  private readonly glassMaterial: MeshBasicMaterial;

  private readonly dust: Points;
  private readonly dustVelocities: Float32Array;
  private dustBaseOpacity = 0;
  private readonly dustBox: { x: number; yMin: number; yMax: number };

  private elapsed = 0;

  private readonly boxWidth: number;
  private readonly boxHeight: number;

  constructor(anchor: WindowAnchor) {
    this.root = new Object3D();
    this.root.name = `window-view-${anchor.openingId}`;

    // 景深盒放在墙外侧：沿内法线的反方向推出去
    const [nx, , nz] = anchor.inward;
    this.root.position.set(anchor.center[0], anchor.center[1], anchor.center[2]);

    // 让盒子朝向房间内部，这样子物体用局部 -Z 表示"更远"
    this.root.lookAt(
      anchor.center[0] + nx,
      anchor.center[1],
      anchor.center[2] + nz,
    );

    // backdrop 比洞口大一圈防止斜视露边；因为贴得近，出血量不需要大
    this.boxWidth = anchor.width + 0.8;
    this.boxHeight = anchor.height + 0.8;

    // ---- 天空：上下双色渐变（顶点色），只朝屋内渲染 ----
    this.skyGeometry = new PlaneGeometry(this.boxWidth, this.boxHeight);
    const skyColors = new Float32Array(4 * 3);
    this.skyGeometry.setAttribute("color", new BufferAttribute(skyColors, 3));

    const sky = new Mesh(
      this.skyGeometry,
      new MeshBasicMaterial({ vertexColors: true, depthWrite: false }),
    );
    sky.position.z = -SKY_DISTANCE;
    sky.renderOrder = -2;
    this.root.add(sky);

    // ---- 星点 ----
    this.starMaterial = new PointsMaterial({
      color: "#fff6de",
      size: 0.045,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.root.add(this.buildStars());

    // ---- 云朵 ----
    this.cloudMaterial = new MeshBasicMaterial({
      color: CLOUD_COLORS[DayPhaseId.Day],
      transparent: true,
      opacity: CLOUD_OPACITY[DayPhaseId.Day],
      depthWrite: false,
    });
    this.buildClouds();

    // ---- 山丘剪影（远/近两层） ----
    this.hillFarMaterial = new MeshBasicMaterial({
      color: HILL_FAR_COLORS[DayPhaseId.Day],
    });
    this.hillNearMaterial = new MeshBasicMaterial({
      color: HILL_NEAR_COLORS[DayPhaseId.Day],
    });
    this.root.add(
      this.buildRidge(this.hillFarMaterial, -HILL_FAR_DISTANCE, 0.62, 11, 7),
    );
    this.root.add(
      this.buildRidge(this.hillNearMaterial, -HILL_NEAR_DISTANCE, 0.42, 7, 31),
    );

    // ---- 树剪影 ----
    this.root.add(this.buildSilhouettes());

    // ---- 雨 ----
    const { points, velocities } = this.buildRain();
    this.rain = points;
    this.rainVelocities = velocities;
    this.root.add(this.rain);

    // ---- 玻璃内侧微光（雨天的淅沥感） ----
    this.glassMaterial = new MeshBasicMaterial({
      color: "#aecde8",
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.glassGlow = new Mesh(
      new PlaneGeometry(anchor.width * 0.96, anchor.height * 0.96),
      this.glassMaterial,
    );
    // 贴在洞口内侧一点点，从屋内看是玻璃上的一层水光
    this.glassGlow.position.z = 0.03;
    this.glassGlow.rotation.y = Math.PI;
    this.glassGlow.visible = false;
    this.root.add(this.glassGlow);

    // ---- 室内尘埃（阳光微粒） ----
    this.dustBox = {
      x: this.boxWidth / 2 + 0.9,
      // 局部 y=0 是窗中心；地板在 -center[1]，稍微抬起避免贴地
      yMin: -anchor.center[1] + 0.15,
      yMax: 1.1,
    };
    const dustBuilt = this.buildDust();
    this.dust = dustBuilt.points;
    this.dustVelocities = dustBuilt.velocities;
    this.root.add(this.dust);
  }

  // ---- 构建 ----------------------------------------------------------------

  /** 山脊剪影：一条锯齿棱线向下填充到盒底，顶点高度用确定性噪声 */
  private buildRidge(
    material: MeshBasicMaterial,
    z: number,
    peakRatio: number,
    segments: number,
    seed: number,
  ): Mesh {
    const bottom = -this.boxHeight / 2;
    const positions = new Float32Array((segments + 1) * 2 * 3);
    const indices = new Uint16Array(segments * 6);

    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const x = (t - 0.5) * (this.boxWidth + 0.4);
      const noise = hash01(seed + i * 3.7);
      const wave = Math.sin(t * Math.PI * 2.3 + seed) * 0.5 + 0.5;
      const height =
        this.boxHeight * peakRatio * (0.45 + 0.35 * wave + 0.2 * noise);

      const top = i * 6;
      positions[top] = x;
      positions[top + 1] = bottom + height;
      positions[top + 2] = 0;
      positions[top + 3] = x;
      positions[top + 4] = bottom - 0.2;
      positions[top + 5] = 0;
    }

    for (let i = 0; i < segments; i += 1) {
      const a = i * 2;
      const offset = i * 6;
      indices[offset] = a;
      indices[offset + 1] = a + 1;
      indices[offset + 2] = a + 2;
      indices[offset + 3] = a + 1;
      indices[offset + 4] = a + 3;
      indices[offset + 5] = a + 2;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));

    const mesh = new Mesh(geometry, material);
    mesh.position.z = z;
    return mesh;
  }

  private buildStars(): Points {
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i += 1) {
      // 集中在天空的上 2/3，避免和山丘重叠
      positions[i * 3] = (hash01(i * 7.3) - 0.5) * this.boxWidth;
      positions[i * 3 + 1] =
        this.boxHeight * (hash01(i * 13.9 + 5) * 0.66 - 0.16);
      positions[i * 3 + 2] = 0;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));

    const stars = new Points(geometry, this.starMaterial);
    stars.name = "stars";
    stars.position.z = -STAR_DISTANCE;
    stars.renderOrder = -1;
    return stars;
  }

  /** 云 = 三个交叠圆片拼成的团子，压在同一平面上缓慢漂移 */
  private buildClouds(): void {
    const layouts = [
      { x: -this.boxWidth * 0.3, y: this.boxHeight * 0.28, scale: 0.3, speed: 0.055 },
      { x: this.boxWidth * 0.15, y: this.boxHeight * 0.12, scale: 0.22, speed: 0.085 },
      { x: this.boxWidth * 0.42, y: this.boxHeight * 0.34, scale: 0.17, speed: 0.07 },
    ];

    for (const layout of layouts) {
      const cloud = new Object3D();
      cloud.name = "cloud";

      const puffs: Array<[number, number, number]> = [
        [0, 0, 1],
        [-0.9, -0.1, 0.72],
        [0.85, -0.14, 0.62],
      ];
      for (const [px, py, pr] of puffs) {
        const puff = new Mesh(
          new CircleGeometry(layout.scale * pr, 12),
          this.cloudMaterial,
        );
        puff.position.set(layout.scale * px, layout.scale * py, 0);
        cloud.add(puff);
      }

      cloud.position.set(layout.x, layout.y, -CLOUD_DISTANCE);
      this.clouds.push({ node: cloud, speed: layout.speed });
      this.root.add(cloud);
    }
  }

  private buildSilhouettes(): Object3D {
    const container = new Object3D();
    container.name = "silhouettes";

    // 景深盒是扁的，树剪影按"窗景画"来配比：树冠占洞口高度的一半左右
    const unit = this.boxHeight / 4;

    const layout = [
      { x: -this.boxWidth * 0.24, scale: unit * 1, lift: 0 },
      { x: this.boxWidth * 0.2, scale: unit * 0.72, lift: -0.06 },
      { x: this.boxWidth * 0.02, scale: unit * 0.5, lift: -0.1 },
    ];

    for (const item of layout) {
      const shade = SILHOUETTE_COLORS[DayPhaseId.Day];
      const trunkMaterial = ownMaterial(shade);
      const crownMaterial = ownMaterial(shade);
      this.silhouetteMaterials.push(trunkMaterial, crownMaterial);

      const trunk = cylinder(0.05 * unit * 4, 0.07 * unit * 4, item.scale * 0.9, 5, {
        color: shade,
        position: [item.x, -this.boxHeight / 2 + item.scale * 0.45 + item.lift, 0],
        castShadow: false,
        receiveShadow: false,
      });
      trunk.material = trunkMaterial;

      const crown = blob(item.scale * 0.55, 0, {
        color: shade,
        position: [item.x, -this.boxHeight / 2 + item.scale * 1.05 + item.lift, 0],
        castShadow: false,
        receiveShadow: false,
      });
      crown.material = crownMaterial;

      const tree = new Object3D();
      tree.add(trunk);
      tree.add(crown);
      tree.position.z = -SILHOUETTE_DISTANCE;
      container.add(tree);
    }

    return container;
  }

  private buildRain(): { points: Points; velocities: Float32Array } {
    const positions = new Float32Array(RAIN_MAX * 3);
    const velocities = new Float32Array(RAIN_MAX);

    for (let i = 0; i < RAIN_MAX; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * this.boxWidth;
      positions[i * 3 + 1] = (Math.random() - 0.5) * this.boxHeight;
      positions[i * 3 + 2] = -Math.random() * SKY_DISTANCE;
      velocities[i] = 4 + Math.random() * 4;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));

    const material = new PointsMaterial({
      color: "#cfe3f5",
      size: 0.08,
      transparent: true,
      opacity: 0.75,
      blending: AdditiveBlending,
      depthWrite: false,
    });

    const points = new Points(geometry, material);
    points.name = "rain";
    points.visible = false;
    return { points, velocities };
  }

  private buildDust(): { points: Points; velocities: Float32Array } {
    const positions = new Float32Array(DUST_COUNT * 3);
    const velocities = new Float32Array(DUST_COUNT * 3);
    const { x: xExtent, yMin, yMax } = this.dustBox;

    for (let i = 0; i < DUST_COUNT; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 2 * xExtent;
      positions[i * 3 + 1] = yMin + Math.random() * (yMax - yMin);
      positions[i * 3 + 2] = 0.35 + Math.random() * DUST_DEPTH;

      // 极慢的随机漂浮，整体略微下沉（尘埃感）
      velocities[i * 3] = (Math.random() - 0.5) * 0.06;
      velocities[i * 3 + 1] = -0.008 - Math.random() * 0.02;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));

    const material = new PointsMaterial({
      color: "#fff3d0",
      size: 0.05,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });

    const points = new Points(geometry, material);
    points.name = "dust";
    points.visible = false;
    return { points, velocities };
  }

  // ---- 状态应用与逐帧更新 --------------------------------------------------

  apply(phase: DayPhaseId, weather: WeatherKind): void {
    // 天空渐变：顶点 0/1 是上边，2/3 是下边（PlaneGeometry 的顶点顺序）
    const top = new Color(SKY_TOP[phase]);
    const bottom = new Color(SKY_BOTTOM[phase]);
    const colorAttribute = this.skyGeometry.getAttribute("color") as BufferAttribute;
    const skyArray = colorAttribute.array as Float32Array;
    skyArray[0] = top.r; skyArray[1] = top.g; skyArray[2] = top.b;
    skyArray[3] = top.r; skyArray[4] = top.g; skyArray[5] = top.b;
    skyArray[6] = bottom.r; skyArray[7] = bottom.g; skyArray[8] = bottom.b;
    skyArray[9] = bottom.r; skyArray[10] = bottom.g; skyArray[11] = bottom.b;
    colorAttribute.needsUpdate = true;

    this.hillFarMaterial.color.set(HILL_FAR_COLORS[phase]);
    this.hillNearMaterial.color.set(HILL_NEAR_COLORS[phase]);

    const silhouette = new Color(SILHOUETTE_COLORS[phase]);
    for (const material of this.silhouetteMaterials) material.color.copy(silhouette);

    const raining = weather === WeatherKind.Rain || weather === WeatherKind.Storm;
    const overcast =
      raining || weather === WeatherKind.Cloudy;

    // 云：阴雨天更多云意（更暗更实），风天照旧
    this.cloudMaterial.color.set(CLOUD_COLORS[phase]);
    if (overcast) this.cloudMaterial.color.multiplyScalar(0.72);
    this.cloudMaterial.opacity =
      CLOUD_OPACITY[phase] * (overcast ? 1 : 0.9);

    // 星点被云层遮住
    this.starBaseOpacity = overcast ? 0 : STAR_OPACITY[phase];
    this.starMaterial.opacity = this.starBaseOpacity;

    // 雨密度分级：小雨 90、暴雨 160
    this.rain.visible = raining;
    this.rain.geometry.setDrawRange(
      0,
      weather === WeatherKind.Storm ? RAIN_COUNT_STORM : RAIN_COUNT_RAIN,
    );
    this.stormWind = weather === WeatherKind.Storm;
    const rainMaterial = this.rain.material as PointsMaterial;
    rainMaterial.opacity = weather === WeatherKind.Storm ? 0.95 : 0.7;

    // 玻璃内侧微光只在下雨时出现
    this.glassGlow.visible = raining;

    // 尘埃只在晴/风天、阳光时段可见
    this.dustBaseOpacity =
      weather === WeatherKind.Sunny || weather === WeatherKind.Wind
        ? DUST_OPACITY[phase]
        : 0;
    this.dust.visible = this.dustBaseOpacity > 0;
    (this.dust.material as PointsMaterial).opacity = this.dustBaseOpacity;
  }

  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;

    // 云的漂移：飘出右侧就从左侧回来
    const wrap = this.boxWidth / 2 + 1;
    for (const cloud of this.clouds) {
      cloud.node.position.x += cloud.speed * deltaSeconds;
      if (cloud.node.position.x > wrap) cloud.node.position.x = -wrap;
    }

    // 星点微闪：整体缓慢呼吸即可，不需要逐星闪烁
    if (this.starBaseOpacity > 0) {
      this.starMaterial.opacity =
        this.starBaseOpacity * (0.86 + 0.14 * Math.sin(this.elapsed * 1.7));
    }

    // 雨天玻璃微光：底噪 + 两个不同频率的正弦叠出"水光晃动"
    if (this.glassGlow.visible) {
      const flicker =
        Math.sin(this.elapsed * 2.3) * 0.012 +
        Math.sin(this.elapsed * 5.1 + 1.7) * 0.008;
      this.glassMaterial.opacity =
        (this.stormWind ? 0.075 : 0.05) + flicker;
    }

    // 尘埃漂浮：直线漂 + 正弦横摆，出界回绕
    if (this.dust.visible) {
      const attribute = this.dust.geometry.getAttribute("position") as BufferAttribute;
      const array = attribute.array as Float32Array;
      const { x: xExtent, yMin, yMax } = this.dustBox;

      for (let i = 0; i < DUST_COUNT; i += 1) {
        const offset = i * 3;
        array[offset] +=
          this.dustVelocities[offset] * deltaSeconds +
          Math.sin(this.elapsed * 0.6 + i * 1.3) * 0.012 * deltaSeconds;
        array[offset + 1] += this.dustVelocities[offset + 1] * deltaSeconds;
        array[offset + 2] += this.dustVelocities[offset + 2] * deltaSeconds;

        if (array[offset] > xExtent) array[offset] = -xExtent;
        if (array[offset] < -xExtent) array[offset] = xExtent;
        if (array[offset + 1] < yMin) array[offset + 1] = yMax;
        if (array[offset + 2] > 0.35 + DUST_DEPTH) array[offset + 2] = 0.35;
        if (array[offset + 2] < 0.35) array[offset + 2] = 0.35 + DUST_DEPTH;
      }

      attribute.needsUpdate = true;
    }

    if (!this.rain.visible) return;

    const attribute = this.rain.geometry.getAttribute("position") as BufferAttribute;
    const array = attribute.array as Float32Array;
    const top = this.boxHeight / 2;
    const count = this.rain.geometry.drawRange.count;

    for (let i = 0; i < Math.min(count, RAIN_MAX); i += 1) {
      const index = i * 3 + 1;
      array[index] -= this.rainVelocities[i] * deltaSeconds;

      // 暴雨带一点横向风斜
      if (this.stormWind) {
        array[i * 3] -= 1.4 * deltaSeconds;
        if (array[i * 3] < -this.boxWidth / 2) array[i * 3] = this.boxWidth / 2;
      }

      if (array[index] < -top) array[index] = top;
    }

    attribute.needsUpdate = true;
  }
}
