import {
  BoxGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";

/**
 * 小方块粒子池（种植系统 期 6）：挥锄飞的土块、倾壶落的水滴。
 *
 * 一个池一种颜色一个 `InstancedMesh`——全场的土块一个 draw call，水滴另一个。
 * 每颗只有位置 / 速度 / 寿命 / 尺寸 / 一个出生时定死的转角，`update` 推重力、
 * 落到 `floorY` 以下或寿终就回收（交换删除，不排序）。
 *
 * **不是通用粒子系统**：没有纹理、没有颜色渐变、没有发射器对象。够土块和
 * 水滴用就停在这里；要更花的效果时再抽，不预先抽象。
 */

export type Vec3 = { x: number; y: number; z: number };

export type BurstOptions = {
  /** 从哪撒 */
  at: Vec3;
  count: number;
  /** 基础速度（每颗都带）；配合 `speed` / `spread` 的随机量。缺省静止起步 */
  velocity?: Vec3;
  /** 横向随机速度的上限（米 / 秒） */
  speed: number;
  /** 横向随机量占 `speed` 的比例（0 = 全部朝 velocity 方向，1 = 四面八方） */
  spread: number;
  /** 竖直向上的初速（米 / 秒），每颗在 60%～100% 之间随机 */
  up: number;
  /** 重力（米 / 秒²） */
  gravity: number;
  /** 寿命（秒），每颗 ±25% */
  life: number;
  /** 边长（米），每颗 ±30% */
  size: number;
  /** 落到这个高度以下就消失（水滴落到土上、土块落回田里） */
  floorY?: number;
};

type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  gravity: number;
  floorY: number;
  rotation: Quaternion;
};

const SCRATCH_MATRIX = new Matrix4();
const SCRATCH_POSITION = new Vector3();
const SCRATCH_SCALE = new Vector3();

export class ParticleField {
  readonly mesh: InstancedMesh;
  private readonly alive: Particle[] = [];

  constructor(
    parent: Object3D,
    color: string,
    readonly capacity = 160,
  ) {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshLambertMaterial({ color });
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.name = `particles-${color}`;
    this.mesh.count = 0;
    // 粒子满场飞，包围盒算不准；数量小，干脆不剔除
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // 不进碰撞（模型即碰撞那套只看建筑模型，这里挂在场景根上，双保险）
    this.mesh.userData.noCollide = true;
    parent.add(this.mesh);
  }

  get count(): number {
    return this.alive.length;
  }

  /** 撒一把。池满了就不撒——粒子是装饰，缺几颗没人看得出 */
  burst(options: BurstOptions): void {
    const room = this.capacity - this.alive.length;
    const count = Math.min(options.count, room);
    const base = options.velocity ?? { x: 0, y: 0, z: 0 };
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const lateral = options.speed * options.spread * Math.random();
      const jitter = 0.75 + Math.random() * 0.5;
      this.alive.push({
        x: options.at.x,
        y: options.at.y,
        z: options.at.z,
        vx: base.x + Math.cos(angle) * lateral,
        vy: base.y + options.up * (0.6 + Math.random() * 0.4),
        vz: base.z + Math.sin(angle) * lateral,
        age: 0,
        life: options.life * jitter,
        size: options.size * (0.7 + Math.random() * 0.6),
        gravity: options.gravity,
        floorY: options.floorY ?? Number.NEGATIVE_INFINITY,
        rotation: new Quaternion().setFromEuler(
          new Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
        ),
      });
    }
  }

  update(dt: number): void {
    const alive = this.alive;
    let i = 0;
    while (i < alive.length) {
      const p = alive[i];
      p.age += dt;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.age >= p.life || p.y <= p.floorY) {
        // 交换删除：顺序无所谓，别 splice
        alive[i] = alive[alive.length - 1];
        alive.pop();
        continue;
      }
      // 寿终前那 30% 缩小，别啪地消失
      const fade = p.age > p.life * 0.7 ? 1 - (p.age - p.life * 0.7) / (p.life * 0.3) : 1;
      SCRATCH_POSITION.set(p.x, p.y, p.z);
      SCRATCH_SCALE.setScalar(p.size * Math.max(0.05, fade));
      SCRATCH_MATRIX.compose(SCRATCH_POSITION, p.rotation, SCRATCH_SCALE);
      this.mesh.setMatrixAt(i, SCRATCH_MATRIX);
      i += 1;
    }
    this.mesh.count = alive.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.alive.length = 0;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshLambertMaterial).dispose();
  }
}
