import { DayPhaseId, WeatherKind } from "core";
import {
  AmbientLight,
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  Object3D,
  PointLight,
  Scene,
  Vector3,
} from "three";

/**
 * 真室内光（2026-07-29 定稿：镜头锁定屋内、房间有真实屋顶）。
 *
 * 1. 方向光（太阳/月亮）：唯一投影灯。**墙和天花板真的挡光**——
 *    光只能从北墙的窗洞照进来，在地板上打出真实的光斑。
 *    所以太阳全天都在北侧（方位角 135°~225°），仰角压低（11°~38°）
 *    保证光柱能穿过 2 格高的窗洞探进屋里；黄昏几乎平射，光斑拉得最长。
 * 2. 半球光：室内基底光，代替"天空照明"的角色。物体顶面偏天色、
 *    底面偏地板暖色，低多边形的体积感来自这里。
 * 3. 每扇窗一盏暖色点光（不投影）：窗边的进光暖染。屋顶封死后
 *    它们从"点缀"升级成了室内亮度的主力之一。
 * 4. 灯具（配方里名为 lamp-light 的点光）：黄昏半亮、入夜全亮——
 *    动森式的自动灯，Lighting/Ambience 家具因此是有真实功能的。
 *
 * 夜里偏蓝变暗，但环境光有保底亮度——现实里的深夜正是这个游戏最可能被
 * 打开的时段，不能真的黑到看不清家具。
 *
 * 注意：渲染端开了 ACESFilmic 色调映射（Renderer.ts），会压暗中间调，
 * 所以这里的强度整体比"线性直出"时代高约 25%。
 */

type LightingProfile = {
  /** 天光颜色与强度 */
  sunColor: string;
  sunIntensity: number;
  /** 天光方位角（度），模拟太阳在天空中的位置 */
  sunAzimuth: number;
  /** 仰角越低影子越长。黄昏 10° 是斜长影的来源 */
  sunElevation: number;

  /** 半球光：天空色 / 地面反弹色 */
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;

  /** 保底环境光（夜间可读性的下限） */
  ambientColor: string;
  ambientIntensity: number;

  /** 房间外围的背景色，同样随昼夜变化 */
  backgroundColor: string;

  /** 窗口补光（点光源）的颜色与强度（物理光照单位，decay=2） */
  windowFillColor: string;
  windowFillIntensity: number;
};

// 方位角约定：窗户都在北墙（世界 -z 侧），sun 位置 z = cos(azimuth)*r，
// 所以方位角必须落在 (90°, 270°) 太阳才在窗外那一侧，光柱才进得了屋。
const DAY_PROFILES: Record<DayPhaseId, LightingProfile> = {
  [DayPhaseId.Dawn]: {
    // 清晨：东北方低角度桃色光，光斑斜着扫过窗边地板
    sunColor: "#ffc08d",
    sunIntensity: 2.0,
    sunAzimuth: 140,
    sunElevation: 14,
    hemiSky: "#aebcdc",
    hemiGround: "#b98a63",
    hemiIntensity: 0.44,
    ambientColor: "#8fa0bf",
    ambientIntensity: 0.34,
    backgroundColor: "#46536e",
    windowFillColor: "#ffd2a8",
    windowFillIntensity: 12,
  },
  [DayPhaseId.Day]: {
    // 正午也压在 36°——再高光就探不进 2 格高的窗洞了。
    // 基底光给足：白天的屋子要明亮透气，和黄昏的暗调拉开差距
    sunColor: "#fff2d0",
    sunIntensity: 2.5,
    sunAzimuth: 180,
    sunElevation: 36,
    hemiSky: "#cddcf0",
    hemiGround: "#c8a173",
    hemiIntensity: 0.62,
    ambientColor: "#cfd8e6",
    ambientIntensity: 0.52,
    backgroundColor: "#87a0bd",
    windowFillColor: "#fff0d0",
    windowFillIntensity: 9,
  },
  [DayPhaseId.Dusk]: {
    // 黄昏：西北方几乎平射的橙光，光斑在地板上拉到最长——最"动森"的一帧
    sunColor: "#ff8f4d",
    sunIntensity: 2.3,
    sunAzimuth: 222,
    sunElevation: 11,
    hemiSky: "#c495a6",
    hemiGround: "#8a6a55",
    hemiIntensity: 0.42,
    ambientColor: "#94809b",
    ambientIntensity: 0.32,
    backgroundColor: "#54445f",
    windowFillColor: "#ffab66",
    windowFillIntensity: 14,
  },
  [DayPhaseId.Night]: {
    // 夜里：冷银月光从窗口淌进来一小片，屋内主要靠灯具
    sunColor: "#8ea6d8",
    sunIntensity: 0.9,
    sunAzimuth: 165,
    sunElevation: 30,
    hemiSky: "#5a6c96",
    hemiGround: "#4a4a58",
    hemiIntensity: 0.36,
    // 夜间的保底亮度：偏冷、偏暗，但不至于看不清
    ambientColor: "#6b7aa1",
    ambientIntensity: 0.5,
    backgroundColor: "#252e42",
    windowFillColor: "#9db4e6",
    windowFillIntensity: 5,
  },
};

/** 灯具亮度（配方里名为 lamp-light 的点光）：黄昏半亮、入夜全亮 */
const LAMP_INTENSITY: Record<DayPhaseId, number> = {
  [DayPhaseId.Dawn]: 0,
  [DayPhaseId.Day]: 0,
  [DayPhaseId.Dusk]: 9,
  [DayPhaseId.Night]: 18,
};

/** 天气对光照的修正系数。desat 把所有光色往灰拉，雨天低饱和的来源 */
const WEATHER_MODIFIERS: Record<
  WeatherKind,
  { sun: number; hemi: number; ambient: number; cool: number; desat: number }
> = {
  [WeatherKind.Sunny]: { sun: 1, hemi: 1, ambient: 1, cool: 0, desat: 0 },
  [WeatherKind.Cloudy]: { sun: 0.55, hemi: 0.9, ambient: 1, cool: 0.25, desat: 0.25 },
  [WeatherKind.Rain]: { sun: 0.35, hemi: 0.8, ambient: 0.95, cool: 0.45, desat: 0.45 },
  [WeatherKind.Wind]: { sun: 0.85, hemi: 0.95, ambient: 1, cool: 0.12, desat: 0.1 },
  [WeatherKind.Storm]: { sun: 0.22, hemi: 0.65, ambient: 0.85, cool: 0.6, desat: 0.55 },
};

const COOL_TINT = new Color("#7f9bd4");

/** 亮度不变地降低饱和度（雨天/阴天的灰调） */
function desaturate(target: Color, amount: number): Color {
  if (amount <= 0) return target;
  const luma = target.r * 0.299 + target.g * 0.587 + target.b * 0.114;
  return target.lerp(new Color(luma, luma, luma), amount);
}

export class Lighting {
  readonly root: Object3D;

  private readonly sun: DirectionalLight;
  private readonly hemi: HemisphereLight;
  private readonly ambient: AmbientLight;
  private windowFills: PointLight[] | null = null;

  constructor(private readonly scene: Scene, roomWidth: number, roomDepth: number) {
    this.root = new Object3D();
    this.root.name = "lighting";

    this.sun = new DirectionalLight("#ffffff", 1);
    this.sun.castShadow = true;
    // 2048 + 收紧的正交视锥 = 每格更多阴影纹素；normalBias 抹掉平面上的摩尔纹
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 4;

    // 视锥只需覆盖房间的半对角线，而不是 max(w,d)——纹素密度提高约 1.8 倍
    const halfDiagonal = Math.hypot(roomWidth / 2, roomDepth / 2);
    const extent = halfDiagonal + 2;
    const camera = this.sun.shadow.camera;
    camera.left = -extent;
    camera.right = extent;
    camera.top = extent;
    camera.bottom = -extent;
    camera.near = 1;
    camera.far = 30 + halfDiagonal + 6;
    camera.updateProjectionMatrix();

    this.hemi = new HemisphereLight("#ffffff", "#ffffff", 0.5);
    this.hemi.position.set(0, 10, 0);

    this.ambient = new AmbientLight("#ffffff", 1);

    this.root.add(this.sun);
    this.root.add(this.sun.target);
    this.root.add(this.hemi);
    this.root.add(this.ambient);
    scene.add(this.root);
  }

  /**
   * 懒发现窗口补光：WindowView 的 root 名字以 "window-view-" 开头、
   * 位置在洞口中心、+Z 轴指向屋内（lookAt 的朝向约定）。
   * 首次 apply 时扫一遍场景，为每扇窗（最多 3 盏）挂一个不投影点光。
   */
  private ensureWindowFills(): PointLight[] {
    if (this.windowFills) return this.windowFills;

    this.windowFills = [];
    const anchors: Object3D[] = [];
    this.scene.traverse((node) => {
      if (node.name.startsWith("window-view-")) anchors.push(node);
    });

    for (const anchor of anchors.slice(0, 3)) {
      const light = new PointLight("#ffffff", 0, 9, 2);
      light.castShadow = false;

      anchor.updateWorldMatrix(true, false);
      const inward = anchor.getWorldDirection(new Vector3());
      light.position
        .setFromMatrixPosition(anchor.matrixWorld)
        .addScaledVector(inward, 0.7);

      this.root.add(light);
      this.windowFills.push(light);
    }

    return this.windowFills;
  }

  apply(phase: DayPhaseId, weather: WeatherKind): void {
    const profile = DAY_PROFILES[phase];
    const modifier = WEATHER_MODIFIERS[weather];

    const sunColor = desaturate(
      new Color(profile.sunColor).lerp(COOL_TINT, modifier.cool * 0.5),
      modifier.desat * 0.6,
    );
    this.sun.color.copy(sunColor);
    this.sun.intensity = profile.sunIntensity * modifier.sun;

    const azimuth = MathUtils.degToRad(profile.sunAzimuth);
    const elevation = MathUtils.degToRad(profile.sunElevation);
    const radius = 30;
    const horizontal = Math.cos(elevation) * radius;

    this.sun.position.set(
      Math.sin(azimuth) * horizontal,
      Math.sin(elevation) * radius,
      Math.cos(azimuth) * horizontal,
    );
    this.sun.target.position.set(0, 0, 0);
    this.sun.target.updateMatrixWorld();

    this.hemi.color.copy(
      desaturate(
        new Color(profile.hemiSky).lerp(COOL_TINT, modifier.cool * 0.35),
        modifier.desat,
      ),
    );
    this.hemi.groundColor.copy(
      desaturate(new Color(profile.hemiGround), modifier.desat),
    );
    this.hemi.intensity = profile.hemiIntensity * modifier.hemi;

    const ambientColor = desaturate(
      new Color(profile.ambientColor).lerp(COOL_TINT, modifier.cool * 0.4),
      modifier.desat * 0.7,
    );
    this.ambient.color.copy(ambientColor);
    this.ambient.intensity = profile.ambientIntensity * modifier.ambient;

    // 窗口补光：随天气衰减但保留 35% 底——阴雨天窗边仍然比屋子中间亮一点
    const fills = this.ensureWindowFills();
    const fillColor = desaturate(
      new Color(profile.windowFillColor).lerp(COOL_TINT, modifier.cool * 0.5),
      modifier.desat * 0.5,
    );
    const fillIntensity =
      profile.windowFillIntensity * (0.35 + 0.65 * modifier.sun);
    for (const fill of fills) {
      fill.color.copy(fillColor);
      fill.intensity = fillIntensity;
    }

    const background = new Color(profile.backgroundColor).lerp(
      COOL_TINT.clone().multiplyScalar(0.35),
      modifier.cool * 0.5,
    );
    this.scene.background = desaturate(background, modifier.desat * 0.4);

    // 灯具：配方里内嵌的 lamp-light 点光。每次 apply 重新扫一遍场景，
    // 这样新摆下的灯下一次环境变化就会被点亮（RoomScene 在 world_changed 时也会 apply）
    const lampIntensity = LAMP_INTENSITY[phase];
    this.scene.traverse((node) => {
      if (node.name === "lamp-light" && node instanceof PointLight) {
        node.intensity = lampIntensity;
      }
    });
  }

  setShadowsEnabled(enabled: boolean): void {
    this.sun.castShadow = enabled;
  }
}
