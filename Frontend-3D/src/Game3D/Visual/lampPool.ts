import { Object3D, PointLight, type Camera, type Scene, type WebGLRenderer } from "three";

/**
 * 灯具点光源的池子（2026-09-19）。
 *
 * ---- 为什么需要它 ----
 *
 * 用户报："落地灯、花园灯这类带光照的家具放到地上时会卡一下；手上只剩一个时
 * 放下去不卡，超过一个就卡。"
 *
 * three.js 把**场上有几盏点光**编进每个材质的着色器（`NUM_POINT_LIGHTS`），
 * 数一变，全场材质的程序缓存键就全变了，下一帧要把它们重编一遍。实测这台 M4：
 *
 *     摆下第 1 盏灯：点光 5→6，着色器程序 40→50，最卡的一帧 103 ms
 *     摆下第 2 盏灯：点光 6→7，程序 50→60，最卡的一帧 227 ms
 *
 * "最后一个不卡"正是这条规律的旁证：手上只剩一个时，落地的同时布置模式退出、
 * 虚影连同它内嵌的那盏灯一起撤掉——一加一减，总数没变，于是不用重编。
 *
 * ---- 做法 ----
 *
 * 灯不再各自 `new PointLight`，而是**从池子里借**：借 = 把池子里那盏光换个父节点
 * 挂到灯具上，还 = 挂回池子。换父节点不改变"场上有几盏"，所以不触发重编。
 *
 * 池子按 `CHUNK` 成批扩容。为什么不一次开一大池：常驻的点光源即使
 * 强度为 0 也要每个材质每像素算一遍，实测这台机器上约 **0.25 ms/盏/帧**
 * （8 盏 20.7 ms、12 盏 21.6 ms、16 盏 24.4 ms、24 盏 25.5 ms）。所以空位是有成本的，
 * 4 个一批是个折中：最多 3 盏白养着（≈0.75 ms）。
 *
 * ---- 扩容本身也会卡，所以要提前、要后台 ----
 *
 * 扩容改的还是"场上有几盏"，一样要重编全场——第一版就是等到借不着了才扩，
 * 结果四次里有一次卡 839 ms，比原来更难受。所以现在是**借走最后一个空位就立刻补货**：
 * 补在放下那一刻之后（玩家正把鼠标挪向下一个位置），而且用 `compileAsync` 让
 * 编译在后台走（three 走 KHR_parallel_shader_compile，不阻塞主线程）。
 * 真到了一个空位都没有还要借的地步，才当场扩一次——那是第一次摆灯之前没来得及
 * 备货的边界情况。
 *
 * ---- 拆得多了也要缩回去 ----
 *
 * 一口气收走十几盏灯之后，空位就有十几个白养着（实测 ≈0.25 ms/盏/帧，十九个空位
 * 就是 5 ms，够把 60 帧压下去）。所以空位多到两批以上时排一次**延迟回收**：
 * 等玩家停手几秒再缩回一批。缩也要重编一次，所以宁可晚、宁可少，
 * 绝不在他还在摆的时候动手。
 *
 * ---- 停在池子里的灯不许发光 ----
 *
 * `Lighting` 每次换时段都扫全场、把名字是 `lamp-light` 的点光按昼夜拨亮。
 * 所以停在池子里的那些**改名** `lamp-slot`，借出去时才改回来——否则一池子灯
 * 会在同一个坐标上一起亮，屋里凭空多一盏太阳。
 */

/** 灯具内嵌点光的名字。Lighting / FogField / 开关都按它扫场景，别改 */
export const LAMP_LIGHT_NAME = "lamp-light";
/** 停在池子里时的名字：换个名字就不会被 Lighting 点亮 */
const PARKED_NAME = "lamp-slot";

/** 扩容的批大小。见文件头的取舍：空位越多越不卡，但每盏空灯每帧都要钱 */
const CHUNK = 4;
/** 停手多久之后才回收多余的空位（回收也要重编一次，宁可晚） */
const TRIM_DELAY_MS = 5_000;

let home: Object3D | null = null;
/** 后台编译要用：扩容改了灯数，得把全场材质按新灯数重编一遍 */
let warm: { renderer: WebGLRenderer; scene: Scene; camera: Camera } | null = null;
let growScheduled = false;
let trimTimer: ReturnType<typeof setTimeout> | null = null;
const free: PointLight[] = [];
/** 一共造了几盏（借出去的也算）。场上的点光总数就是它，扩容才会变 */
let created = 0;

export function installLampPool(scene: Scene): void {
  disposeLampPool();
  home = new Object3D();
  home.name = "lamp-pool";
  scene.add(home);
}

/**
 * 把渲染器交给池子，扩容之后才能在后台把材质编好。
 * RoomScene 在渲染器建好之后调（场景构造时渲染器还不存在，所以和 install 分两步）。
 */
export function warmLampPoolWith(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
  warm = { renderer, scene, camera };
  scheduleGrow();
}

export function disposeLampPool(): void {
  for (const light of free) light.removeFromParent();
  free.length = 0;
  created = 0;
  home?.removeFromParent();
  home = null;
  warm = null;
  growScheduled = false;
  if (trimTimer) clearTimeout(trimTimer);
  trimTimer = null;
}

function grow(): void {
  if (!home) return;
  for (let i = 0; i < CHUNK; i += 1) {
    const light = new PointLight(0xffffff, 0, 1, 2);
    light.name = PARKED_NAME;
    light.castShadow = false;
    light.userData.pooled = true;
    home.add(light);
    free.push(light);
    created += 1;
  }
}

/**
 * 补货：下一个宏任务里扩一批，然后让 three 在后台把新灯数下的材质编出来。
 * 放在异步里是为了**不和"刚放下一盏灯"挤在同一帧**。
 */
function scheduleGrow(): void {
  if (growScheduled || !home) return;
  growScheduled = true;
  setTimeout(() => {
    growScheduled = false;
    if (!home || free.length > 0) return;
    grow();
    // compileAsync 走并行编译扩展，编不动的浏览器上它退化成同步——
    // 那也只是回到"扩容时卡一下"，不会更差
    void warm?.renderer.compileAsync(warm.scene, warm.camera);
  }, 0);
}

/**
 * 借一盏。池子没装（headless 用例、图标渲染那些没有场景的路径）就返回 null，
 * 调用方自己 `new` 一盏——那条路本来也没有"重编全场"的问题。
 */
export function acquireLampLight(): PointLight | null {
  if (!home) return null;
  // 一个空位都没有还要借：只能当场扩（会卡一下）。正常情况下轮不到这里，
  // 上一次借走最后一个空位时就已经排了补货
  if (free.length === 0) grow();
  const light = free.pop();
  if (!light) return null;
  light.name = LAMP_LIGHT_NAME;
  if (free.length === 0) scheduleGrow();
  return light;
}

/**
 * 空位多到两批以上：等玩家停手 `TRIM_DELAY_MS` 再缩回一批。
 * 每次释放都重排，所以连着拆二十件只会在最后触发一次。
 */
function scheduleTrim(): void {
  if (trimTimer) clearTimeout(trimTimer);
  trimTimer = setTimeout(() => {
    trimTimer = null;
    if (free.length <= CHUNK) return;
    while (free.length > CHUNK) {
      const light = free.pop();
      if (!light) break;
      light.removeFromParent();
      created -= 1;
    }
    void warm?.renderer.compileAsync(warm.scene, warm.camera);
  }, TRIM_DELAY_MS);
}

/** 还一盏：重置成出厂状态、改回停车名、挂回池子 */
function release(light: PointLight): void {
  light.intensity = 0;
  light.userData.lampStrength = 1;
  light.userData.switchedOff = false;
  light.name = PARKED_NAME;
  light.position.set(0, 0, 0);
  if (home) home.add(light);
  else light.removeFromParent();
  if (!free.includes(light)) free.push(light);
  if (free.length > CHUNK * 2) scheduleTrim();
}

/**
 * 把一棵树上借来的灯全还回去。
 *
 * **每个丢弃视觉对象的地方都要叫它**（家具被拿走、手上换了东西、虚影重建）——
 * 漏一处的后果不是泄漏内存，是那盏光跟着死对象一起离开场景，
 * 点光总数又变了，重编照样发生。
 */
export function releaseLampLightsIn(root: Object3D): void {
  const borrowed: PointLight[] = [];
  root.traverse((node) => {
    if (node instanceof PointLight && node.userData.pooled === true) borrowed.push(node);
  });
  for (const light of borrowed) release(light);
}

/** 用例 / 调试用：池子装没装、造了几盏、还剩几盏没借出去 */
export function lampPoolStats(): { installed: boolean; free: number; created: number } {
  return { installed: home !== null, free: free.length, created };
}
