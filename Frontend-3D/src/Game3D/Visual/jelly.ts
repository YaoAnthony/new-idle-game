import {
  BackSide,
  BufferAttribute,
  Color,
  FrontSide,
  Mesh,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  Object3D,
  SphereGeometry,
  type BufferGeometry,
  type ColorRepresentation,
  type Material,
} from "three";

/**
 * 胶状物的材质（史莱姆用，以后果冻类的东西都走它）。
 *
 * ## 为什么不能只是"把颜色调透明一点"
 *
 * 半透明本身读不出"胶"，只读得出"颜色淡"。让人看出是果冻的是三件事，
 * 缺一不可：
 *
 * 1. **透过前壳看见后壳**——这是体积感的来源。一层单面的半透明球看起来
 *    是一张半透明的饼；能看见背面的内轮廓，脑子才知道那是一坨有厚度的东西。
 * 2. **里面有东西**——不透明的内核（或者吞下去的一枚硬币）。没有参照物的话
 *    "透明"这件事根本无从被看见。
 * 3. **边缘比中心亮**（菲涅尔）——真实的半透介质在掠射角上散射更强。
 *    这一条是"湿润/弹性"的全部来源，也是 A 和 B 的差别。
 *
 * ## 描边必须关掉
 *
 * `Engine/Outline.ts` 的描边是**反相外壳**：复制网格、`side: BackSide`、
 * 放大 1.022，作为子节点挂在 mesh 下面，而且是**不透明**的。身体一旦半透，
 * 就是拿半透明的身体盖在那层深色壳上——看起来像吞了个黑气球。
 * 所以所有果冻部件都打 `userData.noOutline`，轮廓靠边缘光自己撑。
 * 龙的角和翼膜（`dragon.ts` 的 `glassy()`）早就是这么处理的。
 *
 * ## 三层的渲染顺序不是随便排的
 *
 * - **内核**不透明、写深度 → 走不透明队列，最先画
 * - **后壳**（BackSide）半透、**不写深度** → 它在内核后面，深度测试会把被
 *   内核挡住的部分剔掉，正好是我们要的
 * - **前壳**（FrontSide）半透、不写深度、`renderOrder` 更大 → 最后混上去
 *
 * 不能图省事用一个 `DoubleSide` 的网格：three 不给同一个网格里的三角形
 * 排序，球面的正背面会按缓冲区顺序乱混。拆成两个网格之后，凸形状的
 * 前后关系天然正确。
 */

export type JellyKind = "translucent" | "fresnel" | "transmission";

/**
 * 内核占外壳的比例。四成上下：小了看不见，大了就把壳顶满、
 * 整坨变回不透明（第一版踩过）。
 */
const CORE_RATIO = 0.42;

export type JellyOptions = {
  /** 主色 */
  color: ColorRepresentation;
  /** 前后壳的不透明度。0.7 上下最好——再低就成雾，再高看不见后壳 */
  opacity?: number;
  /** 边缘光的颜色。留空 = 比主色更亮更白的一档 */
  rimColor?: ColorRepresentation;
  /** 边缘光的收束程度。越大，亮边越细 */
  rimPower?: number;
  /** 边缘光的强度 */
  rimStrength?: number;
  /**
   * 竖向渐变（顶浅底深）。设计稿上写的"颜色从顶部浅到底部稍深"就是它。
   *
   * 走**顶点色**而不是着色器：Lambert 原生支持 `vertexColors`，一次烘进
   * 几何里，运行时零开销，而且前后两层壳共用同一份几何自动就一致。
   */
  gradient?: { top: ColorRepresentation; bottom: ColorRepresentation };
  /**
   * 内核占外壳的比例；`false` = 不要内核。
   *
   * 内核的作用是"给透明一个参照物"。如果调用方自己往肚子里塞了东西
   * （史莱姆塞的是气泡和眼睛），就不需要它了——多一颗实心球反而把
   * 气泡挡住。
   */
  core?: number | false;
  /**
   * 透射档的物理参数。留空走下面注释里那套默认。
   */
  physical?: { roughness?: number; thickness?: number; clearcoat?: number };
  /**
   * 每个三角形自成一面。
   *
   * 参考图里那些长条白光是表面的折痕把反射切碎造出来的；光滑的球只能
   * 得到一个圆点高光。切面是我们**在不换美术方向的前提下**最接近那种
   * 观感的手段——低模本来就吃这一套（宝石、冰块都是这么做的）。
   */
  flatShading?: boolean;
};

/**
 * 往 Lambert 里塞一圈菲涅尔边缘光。
 *
 * **改 Lambert 而不是自己写 ShaderMaterial**：裸的 ShaderMaterial 要把场景
 * 灯光、雾、色调映射全部重新实现一遍，而这个项目的 `Engine/Renderer.ts`
 * 开着 ACES 色调映射、`PostFX` 还挂着 bloom——自己那一份迟早和主管线走散
 * （白天对了晚上不对，是这类问题最常见的表现）。`onBeforeCompile` 是
 * 官方留的钩子，注进去的东西和内建光照走同一条链。
 *
 * 自己声明 varying 而不是蹭内建的 `vNormal` / `vViewPosition`：那两个的
 * 有无取决于 `flatShading`、法线贴图等一堆开关，跟着 three 版本变。
 * 自带两个名字带前缀的，编译期就不会撞。
 */
function withFresnel(
  material: MeshLambertMaterial,
  rimColor: ColorRepresentation,
  rimPower: number,
  rimStrength: number,
): MeshLambertMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimPower = { value: rimPower };
    shader.uniforms.uRimStrength = { value: rimStrength };
    shader.uniforms.uRimColor = { value: new Color(rimColor) };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vJellyN;
varying vec3 vJellyV;`,
      )
      /*
       * 挂在 `<begin_vertex>` 之后。这个位置**两样东西都已经就绪**（对着
       * r171 的 meshlambert.glsl.js 数过行号）：
       *
       * - `transformedNormal`：`<defaultnormal_vertex>`（第 32 行）产出的，
       *   **已经乘过 normalMatrix**，而且照顾了 instancing / batching / 蒙皮。
       *   自己写 `normalMatrix * objectNormal` 少了后面那些，实例化渲染时会歪。
       * - `transformed`：就是 `<begin_vertex>`（第 35 行）这一句定义的。
       */
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
  vJellyN = normalize(transformedNormal);
  vJellyV = normalize(-(modelViewMatrix * vec4(transformed, 1.0)).xyz);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vJellyN;
varying vec3 vJellyV;
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uRimStrength;`,
      )
      /*
       * 挂在 `<opaque_fragment>` **之后**，这一点很要紧。
       *
       * 那一句正是 `gl_FragColor = vec4(outgoingLight, diffuseColor.a)`，
       * 之后才轮到 `<tonemapping_fragment>` 和 `<colorspace_fragment>`。
       * 站在这儿加的边缘光会**跟着走一遍 ACES 色调映射和线性→sRGB**，
       * 和真实光照同一条链。
       *
       * 我第一版挂在最后的 `<dithering_fragment>` 上——那是**色彩空间转换
       * 之后**，等于把一个线性空间的数值加到 sRGB 结果上：亮边会发死、
       * 高光处直接削平，而且白天夜里的表现对不上。对着 r171 的
       * meshlambert.glsl.js 数了一遍 chunk 顺序才发现。
       *
       * （skill 文档里列的注入点是 `<output_fragment>`，那个名字在 r152
       * 就改成 `<opaque_fragment>` 了，我们这版没有。）
       *
       * 顺带把边缘的 alpha 也抬一点：真实的果冻边缘不只是更亮，也更"实"
       * ——只抬亮度的话，亮边会显得飘在物体外面。
       */
      .replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>
  float jellyRim = pow(1.0 - clamp(dot(normalize(vJellyN), normalize(vJellyV)), 0.0, 1.0), uRimPower);
  gl_FragColor.rgb += uRimColor * jellyRim * uRimStrength;
  gl_FragColor.a = clamp(gl_FragColor.a + jellyRim * uRimStrength * 0.45, 0.0, 1.0);`,
      );
  };

  /*
   * 改过 shader 的材质必须有自己的缓存键，否则 three 会把它和别的
   * Lambert 当成同一个程序复用，边缘光要么全场都有、要么全场都没有。
   */
  material.customProgramCacheKey = () =>
    `jelly-fresnel|${rimPower}|${rimStrength}|${material.flatShading ? "flat" : "smooth"}`;
  return material;
}

function shellMaterial(
  kind: JellyKind,
  options: Required<
    Pick<
      JellyOptions,
      "color" | "opacity" | "rimColor" | "rimPower" | "rimStrength" | "flatShading"
    >
  > &
    Pick<JellyOptions, "physical" | "gradient">,
  side: typeof FrontSide | typeof BackSide,
): Material {
  if (kind === "transmission") {
    /*
     * 真折射。**最像果冻，也最贵**：three 为了 transmission 每帧要把场景
     * 多渲一遍到一张后台缓冲，而这个项目的基准机是 iPhone SE，
     * 还挂着 bloom 后期。一只常驻在院子里溜达的生物用它，代价是持续的。
     * 摆在这里是为了让对照有个上限——看过真货才知道便宜方案差在哪。
     */
    /*
     * **不要打 `transparent` / `depthWrite: false`**（第一版打了，渲出来是
     * 一颗死绿的不透明球）。three 的透射走的是一遍独立的离屏渲染，
     * 材质一旦标成 transparent 就被丢进半透明队列，那一遍直接不跑，
     * `transmission` 变成一个没人读的数。
     *
     * ## 三个参数是照 Codrops 那篇玻璃/塑料的文章定的
     *
     * - **`roughness` 躲开 0.15~0.65 这一段**：中间地带会出现明显的
     *   像素化（透射缓冲的分辨率不够撑起半糊的模糊）。要清透就 ≤0.15，
     *   要磨砂就 ≥0.65。第一版我给了 0.18，正好踩在坏区间里。
     * - **`clearcoat`**：清漆层。"湿漉漉"这个观感基本全来自它，
     *   pmndrs 那只果冻方块也是 `clearcoat: 1`。
     * - **`thickness` 才是折射的开关**（不是 `transmission`）。给 0 的话
     *   透是透了但不折射，看着像块蒙的玻璃。
     *
     * 还有一条限制得记住：**透射的物体之间互相看不见**。我们场里有
     * 透明的窗户、雾场、摆放预览——史莱姆走到它们前面会穿帮。
     */
    const physical = options.physical ?? {};
    return new MeshPhysicalMaterial({
      color: options.color,
      transmission: 1,
      thickness: physical.thickness ?? 0.5,
      ior: 1.35,
      roughness: physical.roughness ?? 0.1,
      clearcoat: physical.clearcoat ?? 1,
      clearcoatRoughness: 0.08,
      metalness: 0,
      side,
      flatShading: options.flatShading,
    });
  }

  const material = new MeshLambertMaterial({
    /*
     * 用了渐变就把主色让给顶点色：Lambert 是 `材质色 × 顶点色`，
     * 两边都填等于把颜色乘暗一遍。
     */
    color: options.gradient ? "#ffffff" : options.color,
    vertexColors: Boolean(options.gradient),
    transparent: true,
    opacity: options.opacity,
    side,
    flatShading: options.flatShading,
    // 三层要按 renderOrder 混，谁都不写深度
    depthWrite: false,
  });

  return kind === "fresnel"
    ? withFresnel(material, options.rimColor, options.rimPower, options.rimStrength)
    : material;
}

/**
 * 造一坨果冻：后壳 + 内核 + 前壳。
 *
 * 返回一个 `Object3D`，调用方自己摆位置、加眼睛、接 `animate`。
 * 几何由调用方给——史莱姆是压扁的球，别的果冻可能是别的形状。
 */
export function buildJelly(
  geometry: BufferGeometry,
  kind: JellyKind,
  options: JellyOptions,
): Object3D {
  const opacity = options.opacity ?? 0.7;
  const settings = {
    color: options.color,
    opacity,
    rimColor: options.rimColor ?? "#ffffff",
    rimPower: options.rimPower ?? 2.4,
    rimStrength: options.rimStrength ?? 0.55,
    flatShading: options.flatShading ?? false,
    physical: options.physical,
    gradient: options.gradient,
  };

  /*
   * 内核比主色**深一档**。同色的话它和外壳糊在一起，等于没有内核——
   * 而内核的全部作用就是"给透明这件事一个参照物"。
   */
  const coreColor = new Color(options.color).multiplyScalar(0.62);

  /*
   * 渐变烘进顶点色。按几何自己的**包围盒高度**归一化，不假设半径 1——
   * 调用方给什么形状都对（史莱姆给的是个旋转成型的半球）。
   */
  if (options.gradient) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const low = box.min.y;
    const span = Math.max(1e-6, box.max.y - low);
    const bottom = new Color(options.gradient.bottom);
    const top = new Color(options.gradient.top);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const mixed = new Color();
    for (let i = 0; i < position.count; i += 1) {
      mixed.copy(bottom).lerp(top, (position.getY(i) - low) / span);
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
  }

  const root = new Object3D();
  root.name = "jelly";

  /*
   * ① 内核：不透明，走不透明队列先画。**没有它，半透明无从被看见**。
   *
   * 半径**从传进来的几何推**，不写死。第一版写死成 0.21，而史莱姆的壳
   * 半径是 0.22——内核几乎把壳填满了，渲出来是一颗结结实实的不透明球，
   * 我还以为是透明度没生效。核占壳的四成上下最好：小了看不见，
   * 大了就是这次的下场。
   */
  const coreRatio = options.core === false ? 0 : (options.core ?? CORE_RATIO);
  if (coreRatio > 0) {
    geometry.computeBoundingSphere();
    const shellRadius = geometry.boundingSphere?.radius ?? 0.5;
    const core = new Mesh(
      new SphereGeometry(shellRadius * coreRatio, 16, 12),
      new MeshLambertMaterial({ color: coreColor, flatShading: false }),
    );
    core.name = "jelly-core";
    core.castShadow = false;
    core.userData.noOutline = true;
    root.add(core);
  }

  // ② 后壳：深度测试会替我们剔掉被内核挡住的部分
  const back = new Mesh(geometry, shellMaterial(kind, settings, BackSide));
  back.name = "jelly-back";
  back.renderOrder = 1;
  back.castShadow = false;
  back.userData.noOutline = true;
  root.add(back);

  // ③ 前壳：最后混上去
  const front = new Mesh(geometry, shellMaterial(kind, settings, FrontSide));
  front.name = "jelly-front";
  front.renderOrder = 2;
  /*
   * 阴影**由前壳投**：半透的东西在这套低模里仍然该有影子（不投影会
   * 像贴在地上的画），而 three 的阴影贴图不认 alpha，前壳投出来的
   * 就是一个实心轮廓——正是想要的。
   */
  front.castShadow = true;
  front.userData.noOutline = true;
  root.add(front);

  return root;
}
