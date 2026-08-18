import {
  DataTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  Object3D,
  PlaneGeometry,
  PointLight,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
} from "three";

/**
 * 清晰度场：大雾天里"哪儿看得见"的 tile 网格 + 贴地的一块雾毯。
 *
 * 照的是 LOL 式战争迷雾那套骨架（zhuanlan.zhihu.com/p/613190562）：
 *  1. 地图切成 M×N 格，每格一个值
 *  2. 每个"视野源"往格子里写自己的贡献
 *  3. 结果存进一张低分辨率纹理，一块盖全图的 plane 采样它
 *  4. **第二张纹理逐帧插值**——把空间锯齿和时间跳变一起抹掉
 *
 * 但和 LOL 有一个根本不同：那边是**信息遮蔽**（二值，看不见的地方黑），
 * 我们是**天气**（连续，"雾有多浓"）。所以格子里存的是 clarity 0~1，
 * 视野源不是"眼睛"而是**光和庇护**——灯、房子。多个源取 max 不相加：
 * 两盏灯挨着不该比一盏亮出一倍的清晰度。
 *
 * 用户定的三条（2026-08-18）：
 *  - 灯**全天亮**（Lighting 按 low_visibility tag 处理）——不然"放灯驱雾"
 *    白天体验不到
 *  - 森林深处**更浓**：基线随离房子的距离衰减
 *  - **不给玩家自己一圈**：雾天出了灯就是一头扎进白里
 *
 * 不做：障碍物挡视线（文章里的 libfov 是为"墙后看不见敌人"，天气雾是
 * 弥漫的，一堵墙后面不该突然清晰）、体积雾。
 *
 * 规模：据点可走范围约 100×130 米，1 格 = 1 米 → 1.3 万格；100 ms 重算
 * 一次（灯不会每帧动），每次几盏灯 × 各自半径内的格子，几千次乘法。
 */

export type FogFieldBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type FogFieldOptions = {
  bounds: FogFieldBounds;
  /** 格距（米）。1.0 够了：雾的边界本来就该是软的 */
  cell?: number;
  /** 房子这一片（院墙内）：有屋子挡着，雾薄一档 */
  shelter: FogFieldBounds;
  shelterClarity?: number;
  /** 基线：院子边上的雾多浓（清晰度）。0.12 = 伸手见五指，再远就白 */
  floorNear?: number;
  /** 森林深处的基线。离 shelter 越远越往这个数落 */
  floorFar?: number;
  /** 从 shelter 边到 floorFar 的距离（米） */
  floorFalloff?: number;
  /** 雾毯贴多高（世界 Y）。贴着院子地面往上一点 */
  planeY: number;
  /** 雾毯颜色 */
  color?: string;
};

/**
 * 灯的清晰度半径。**从点光的强度推，不另配**：Lighting 给路灯 18、
 * 黄昏 9，油灯那类内嵌灯本来就弱。18 → 约 7 米，够罩住一小片院子。
 */
function lampReach(light: PointLight): number {
  return Math.min(9, 2.5 + Math.sqrt(Math.max(0, light.intensity)) * 1.1);
}

export class FogField {
  readonly root = new Object3D();

  private readonly bounds: FogFieldBounds;
  private readonly cell: number;
  private readonly cols: number;
  private readonly rows: number;

  /** 目标清晰度（每次重算写这里） */
  private readonly target: Float32Array;
  /** 显示用的清晰度（逐帧朝 target 走）——文章里的第二张 RT */
  private readonly shown: Float32Array;
  private readonly texture: DataTexture;
  private readonly texels: Uint8Array;

  private readonly options: Required<Omit<FogFieldOptions, "cell">> & { cell: number };
  private readonly plane: Mesh;
  private sinceRecalc = 1; // 首帧就算
  private enabled = false;

  constructor(options: FogFieldOptions) {
    this.options = {
      cell: 1,
      shelterClarity: 0.55,
      floorNear: 0.12,
      floorFar: 0.04,
      floorFalloff: 40,
      color: "#eef0f2",
      ...options,
    };
    this.bounds = options.bounds;
    this.cell = this.options.cell;
    this.cols = Math.ceil((this.bounds.maxX - this.bounds.minX) / this.cell) + 1;
    this.rows = Math.ceil((this.bounds.maxZ - this.bounds.minZ) / this.cell) + 1;

    this.target = new Float32Array(this.cols * this.rows);
    this.shown = new Float32Array(this.cols * this.rows);
    this.texels = new Uint8Array(this.cols * this.rows);
    this.texture = new DataTexture(this.texels, this.cols, this.rows, RedFormat, UnsignedByteType);
    // 双线性放大：1 米一格的清晰度在屏幕上要是软的边，不是马赛克
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.needsUpdate = true;

    const width = this.bounds.maxX - this.bounds.minX;
    const depth = this.bounds.maxZ - this.bounds.minZ;
    const material = new ShaderMaterial({
      uniforms: {
        uClarity: { value: this.texture },
        uColor: { value: [0, 0, 0] },
        uDensity: { value: 0.8 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vDist;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uClarity;
        uniform vec3 uColor;
        uniform float uDensity;
        varying vec2 vUv;
        varying float vDist;
        void main() {
          float clarity = texture2D(uClarity, vUv).r;
          /*
           * 雾毯的不透明度 = 雾浓 × (1 - 清晰) × 距离系数。
           * 距离系数：镜头脚下 4 米内透明、12 米外全实——毯子是"远处白茫茫"，
           * 不是糊在角色脚上的一块板。第一版没这一项，人站在毯子里，地都看不见。
           * 灯下面 clarity→1，毯子被烧出一个洞。
           */
          float near = smoothstep(4.0, 12.0, vDist);
          // 毯子四边淡到 0：最外 8% 渐隐，和全局雾接上，不留一条硬边
          vec2 edge = smoothstep(0.0, 0.08, vUv) * smoothstep(0.0, 0.08, 1.0 - vUv);
          float rim = edge.x * edge.y;
          float alpha = uDensity * (1.0 - clarity) * near * rim;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      // 不写深度：它是一层薄气，不该挡住后面的东西参与深度排序
      depthWrite: false,
      side: DoubleSide,
      // 不吃场景雾——它自己就是雾
      fog: false,
    });
    const c = material.uniforms.uColor.value as number[];
    const hex = parseInt(this.options.color.slice(1), 16);
    c[0] = ((hex >> 16) & 255) / 255;
    c[1] = ((hex >> 8) & 255) / 255;
    c[2] = (hex & 255) / 255;

    this.plane = new Mesh(new PlaneGeometry(width, depth), material);
    this.plane.rotation.x = -Math.PI / 2;
    this.plane.position.set(
      (this.bounds.minX + this.bounds.maxX) / 2,
      this.options.planeY,
      (this.bounds.minZ + this.bounds.maxZ) / 2,
    );
    // PlaneGeometry 的 uv v 轴朝上（+y→ 旋转后是 -z），纹理行 0 在 minZ：翻一下
    this.plane.scale.y = -1;
    this.plane.name = "fog-blanket";
    this.plane.renderOrder = 5;
    this.plane.visible = false;
    this.root.add(this.plane);
    this.root.name = "fog-field";
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.plane.visible = enabled;
    if (enabled) {
      // 一开就重算，别等 100 ms；shown 从全雾起，然后化开——"雾来了"
      this.sinceRecalc = 1;
      this.shown.fill(0);
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 重算目标清晰度。lights 是场景里**此刻亮着的**点光（intensity>0），
   * 由调用方每次扫一遍场景传进来——灯是家具，玩家随时会摆、会搬。
   */
  private recalc(lights: PointLight[]): void {
    const { shelter, shelterClarity, floorNear, floorFar, floorFalloff } = this.options;
    const t = this.target;

    for (let r = 0; r < this.rows; r += 1) {
      const z = this.bounds.minZ + r * this.cell;
      for (let c = 0; c < this.cols; c += 1) {
        const x = this.bounds.minX + c * this.cell;
        // 基线：离房子越远越浓（森林深处更白）
        const dx = Math.max(shelter.minX - x, 0, x - shelter.maxX);
        const dz = Math.max(shelter.minZ - z, 0, z - shelter.maxZ);
        const dist = Math.hypot(dx, dz);
        const k = Math.min(1, dist / floorFalloff);
        let clarity = floorNear + (floorFar - floorNear) * k;
        // 房子这一片：有屋子挡着，雾薄一档；边缘 3 米过渡，别切成一个方框
        if (dist < 3) clarity = Math.max(clarity, shelterClarity * (1 - dist / 3) + clarity * (dist / 3));
        t[r * this.cols + c] = clarity;
      }
    }

    // 灯：径向衰减的圆，多盏取 max。只扫每盏灯半径内的格子
    const scratch = new Vector3();
    for (const light of lights) {
      const reach = lampReach(light);
      light.getWorldPosition(scratch);
      const cx = scratch.x;
      const cz = scratch.z;
      const c0 = Math.max(0, Math.floor((cx - reach - this.bounds.minX) / this.cell));
      const c1 = Math.min(this.cols - 1, Math.ceil((cx + reach - this.bounds.minX) / this.cell));
      const r0 = Math.max(0, Math.floor((cz - reach - this.bounds.minZ) / this.cell));
      const r1 = Math.min(this.rows - 1, Math.ceil((cz + reach - this.bounds.minZ) / this.cell));
      for (let r = r0; r <= r1; r += 1) {
        const z = this.bounds.minZ + r * this.cell;
        for (let c = c0; c <= c1; c += 1) {
          const x = this.bounds.minX + c * this.cell;
          const d = Math.hypot(x - cx, z - cz) / reach;
          if (d >= 1) continue;
          // 灯芯全清、边缘归零；平方让中间那圈亮得实
          const lit = 1 - d * d;
          const i = r * this.cols + c;
          if (lit > t[i]) t[i] = lit;
        }
      }
    }
  }

  /**
   * 每帧调。灯的扫描由外面做（RoomScene 有 scene 引用），这里只管
   * 节流重算 + 逐帧插值 + 上传纹理。
   */
  update(deltaSeconds: number, collectLights: () => PointLight[]): void {
    if (!this.enabled) return;

    this.sinceRecalc += deltaSeconds;
    if (this.sinceRecalc >= 0.1) {
      this.sinceRecalc = 0;
      this.recalc(collectLights());
    }

    // 指数逼近：灯点亮/熄灭时雾是"化开"的，不是切换。约 0.4 秒到位
    const k = 1 - Math.exp(-6 * deltaSeconds);
    const shown = this.shown;
    const target = this.target;
    const texels = this.texels;
    let dirty = false;
    for (let i = 0; i < shown.length; i += 1) {
      const next = shown[i] + (target[i] - shown[i]) * k;
      if (Math.abs(next - shown[i]) > 1e-4) dirty = true;
      shown[i] = next;
      texels[i] = Math.round(Math.min(1, Math.max(0, next)) * 255);
    }
    if (dirty) this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.plane.geometry.dispose();
    (this.plane.material as ShaderMaterial).dispose();
    this.root.removeFromParent();
  }
}
