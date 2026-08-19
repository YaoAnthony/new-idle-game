import { Material, ShaderChunk, Vector3 } from "three";

/**
 * 雾的**庇护盒**：屋里没有雾，从屋里看窗外有雾，从屋外看窗户里也没有雾。
 *
 * 物理（Beer–Lambert / Koschmieder）：雾是水滴散射，透过率
 * T = exp(−β·L)，**L 是光线在雾里走过的距离**，不是"离相机多远"。
 * 屋里的空气是干净的，光线从窗外的树到眼睛，只有窗外那一段在衰减。
 *
 * three 自带的雾按 vFogDepth（相机到片元的视距）算，屋里屋外一视同仁
 * ——大雾天 far 24 米，站在 24 米长的客厅里看另一头就是白墙。上一版
 * 的修法是"人在屋里就把雾距推远"，那等于**一进屋院子的雾就散了**：
 * 用户从窗户看出去，树是清的，只有地上的雾毯白着。
 *
 * 这里改成引擎里"体积雾 + 排除盒"的一维简化：每个像素拿相机→片元的
 * 射线和庇护盒（房子的 AABB）做 slab 求交，**雾距 = 射线全长 − 落在盒里
 * 那一段**。四种情形自动对：
 *   相机屋里·片元屋里 → 0（干净）
 *   相机屋里·片元屋外 → 只算窗外那一段（越远越白，樱花树在雾里）
 *   相机屋外·片元屋外 → 全程
 *   相机屋外·片元屋里 → 只算到窗户为止（透过窗屋里是清的）
 *
 * 接进 three 的方式：**替换 fog 那四个 ShaderChunk** + 在 Material 原型上
 * 挂 onBeforeCompile 把两个盒角 uniform 塞进每个材质。塞的是同一个
 * `{ value: Vector3 }` 对象——改一次全场景的材质都看见，不用逐个刷。
 * 不用 material.fog=false 那条土路：材质是按颜色共享缓存的，屋里屋外
 * 同色的东西是同一份材质，关一个全关。
 *
 * fogDistanceThroughShelter() 是着色器那段数学的 TS 镜像，headless 拿它
 * 守四种情形的数值——GL 跑不了 node，数学得有一份跑得了的。
 */

const shelterMin = new Vector3(0, 0, 0);
const shelterMax = new Vector3(0, 0, 0);
/** 0 = 没有庇护盒（露天地图/店铺以外的图），1 = 有 */
const shelterEnabled = { value: 0 };

const SHELTER_MIN_UNIFORM = { value: shelterMin };
const SHELTER_MAX_UNIFORM = { value: shelterMax };

/**
 * 声明这张图的庇护盒（世界坐标）。传 null 关掉。
 * RoomScene 建好房子后调：x/z 按房子占地，y 从院子地面到屋脊。
 */
export function setFogShelter(
  box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } | null,
): void {
  if (!box) {
    shelterEnabled.value = 0;
    return;
  }
  shelterMin.set(box.minX, box.minY, box.minZ);
  shelterMax.set(box.maxX, box.maxY, box.maxZ);
  shelterEnabled.value = 1;
}

/**
 * 相机 → 片元这条线里**在雾里走的长度**。着色器里那段的 TS 镜像。
 * 盒子不存在（enabled 0）就是全长。
 */
export function fogDistanceThroughShelter(
  camera: { x: number; y: number; z: number },
  point: { x: number; y: number; z: number },
  box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } | null,
): number {
  const dx = point.x - camera.x;
  const dy = point.y - camera.y;
  const dz = point.z - camera.z;
  const length = Math.hypot(dx, dy, dz);
  if (!box || length < 1e-6) return length;

  // slab：每个轴上射线进/出盒子的参数 t（0 = 相机，1 = 片元）
  const axis = (o: number, d: number, lo: number, hi: number): [number, number] => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi ? [-Infinity, Infinity] : [Infinity, -Infinity];
    const a = (lo - o) / d;
    const b = (hi - o) / d;
    return a < b ? [a, b] : [b, a];
  };
  const [x0, x1] = axis(camera.x, dx, box.minX, box.maxX);
  const [y0, y1] = axis(camera.y, dy, box.minY, box.maxY);
  const [z0, z1] = axis(camera.z, dz, box.minZ, box.maxZ);
  const tEnter = Math.max(x0, y0, z0, 0);
  const tExit = Math.min(x1, y1, z1, 1);
  const inside = Math.max(0, tExit - tEnter);
  return length * (1 - inside);
}

let installed = false;

/**
 * 装一次。**必须在任何材质编译之前**（RoomScene 构造之前）调——
 * ShaderChunk 是编译时读的，装晚了先编好的材质还是老雾。
 */
export function installFogShelter(): void {
  if (installed) return;
  installed = true;

  /*
   * 顶点：多带一个世界坐标出去。**从 mvPosition 反推**，不从 transformed
   * 乘 modelMatrix：三家内置顶点着色器（mesh/points/sprite）在
   * fog_vertex 这一行都有 mvPosition，但 sprite 没有 transformed、实例
   * 化的还得多乘 instanceMatrix——按 mvPosition 走一条路全覆盖。
   * viewMatrix 是刚体变换，旋转部分的逆就是转置。
   */
  ShaderChunk.fog_pars_vertex = /* glsl */ `
    #ifdef USE_FOG
      varying float vFogDepth;
      varying vec3 vFogWorldPos;
    #endif
  `;
  ShaderChunk.fog_vertex = /* glsl */ `
    #ifdef USE_FOG
      vFogDepth = - mvPosition.z;
      vFogWorldPos = cameraPosition + transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
    #endif
  `;
  ShaderChunk.fog_pars_fragment = /* glsl */ `
    #ifdef USE_FOG
      uniform vec3 fogColor;
      varying float vFogDepth;
      varying vec3 vFogWorldPos;
      uniform vec3 fogShelterMin;
      uniform vec3 fogShelterMax;
      uniform float fogShelterOn;
      #ifdef FOG_EXP2
        uniform float fogDensity;
      #else
        uniform float fogNear;
        uniform float fogFar;
      #endif

      // 相机→片元这条线里落在庇护盒外的长度（slab 求交）
      float fogShelteredDistance() {
        vec3 rd = vFogWorldPos - cameraPosition;
        float len = length( rd );
        if ( fogShelterOn < 0.5 || len < 1e-4 ) return len;
        // 分母趋零的轴：sign 保号、幅值兜底，避免除零出 NaN
        vec3 safe = sign( rd ) * max( abs( rd ), vec3( 1e-6 ) );
        vec3 t1 = ( fogShelterMin - cameraPosition ) / safe;
        vec3 t2 = ( fogShelterMax - cameraPosition ) / safe;
        vec3 tmin3 = min( t1, t2 );
        vec3 tmax3 = max( t1, t2 );
        float tEnter = max( max( tmin3.x, tmin3.y ), max( tmin3.z, 0.0 ) );
        float tExit  = min( min( tmax3.x, tmax3.y ), min( tmax3.z, 1.0 ) );
        float inside = max( 0.0, tExit - tEnter );
        return len * ( 1.0 - inside );
      }
    #endif
  `;
  ShaderChunk.fog_fragment = /* glsl */ `
    #ifdef USE_FOG
      float fogDist = fogShelteredDistance();
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDist * fogDist );
      #else
        float fogFactor = smoothstep( fogNear, fogFar, fogDist );
      #endif
      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
    #endif
  `;

  /*
   * 把三个 uniform 塞进每个材质。挂在 Material 原型上：所有没自己写
   * onBeforeCompile 的材质都走这里（项目里就是全部）。塞的是共享对象，
   * 改 shelterMin/Max 一次，全场景生效——不用逐个材质 needsUpdate。
   */
  const proto = Material.prototype as unknown as {
    onBeforeCompile: (shader: { uniforms: Record<string, unknown> }) => void;
    customProgramCacheKey: () => string;
  };
  proto.onBeforeCompile = function (shader) {
    shader.uniforms.fogShelterMin = SHELTER_MIN_UNIFORM;
    shader.uniforms.fogShelterMax = SHELTER_MAX_UNIFORM;
    shader.uniforms.fogShelterOn = shelterEnabled;
  };
  // 所有材质共用同一份钩子 → 同一把程序缓存钥匙，别让每个材质各编一遍
  proto.customProgramCacheKey = () => "fog-shelter-v1";
}
