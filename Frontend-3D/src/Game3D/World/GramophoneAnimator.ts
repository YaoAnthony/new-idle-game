import {
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Object3D,
} from "three";
import { isMusicActive } from "../Engine/AudioEngine";
import { recordCoverUrl } from "../../Data/music/albums";
import { recordIn } from "../../Game/State/gramophones";

/**
 * 唱片机的常驻动画：音乐在放，唱片就转，摇把跟着慢慢摇。
 *
 * 和 DailyBoardAnimator 不是一类东西：那边是**事件触发的一段表演**
 * （领奖弹一下就完），这边是**跟着状态走的持续状态**——音乐响着就一直转。
 * 所以它不听事件，每帧问一句 `isMusicActive()`；转速用一阶趋近做
 * 起转/停转的缓动，音乐停了唱片是"慢下来"的，不是急刹。
 *
 * 找节点靠名字（`gramophone-record` / `gramophone-crank`，见
 * Visual/recipes/gramophone）。每帧现查不缓存，理由同 DailyBoardAnimator：
 * 机器可能被收走、被摆第二台。
 */

/** 78 转黑胶 ≈ 8.2 rad/s，看着太狂；45 转的视觉速度刚好"在认真放歌" */
const SPIN_RAD_PER_SEC = 4.7;
/** 摇把是发条的减速端，转得慢才像机械 */
const CRANK_RATIO = 0.22;
/** 一阶趋近的时间常数（秒）。约 0.6s 起转、1s 停稳 */
const EASE = 2.2;

const textureLoader = new TextureLoader();

export class GramophoneAnimator {
  private speed = 0;

  constructor(
    private readonly findMachines: () => Array<{
      instanceId: string;
      root: Object3D;
    }>,
  ) {}

  update(deltaSeconds: number): void {
    const target = isMusicActive() ? SPIN_RAD_PER_SEC : 0;
    this.speed += (target - this.speed) * Math.min(1, EASE * deltaSeconds);
    if (this.speed < 0.01 && target === 0) this.speed = 0;

    for (const { instanceId, root } of this.findMachines()) {
      this.syncLabel(instanceId, root);
      if (this.speed === 0) continue;
      const record = root.getObjectByName("gramophone-record");
      if (record) record.rotation.y += this.speed * deltaSeconds;
      const crank = root.getObjectByName("gramophone-crank");
      if (crank) crank.rotation.x += this.speed * CRANK_RATIO * deltaSeconds;
    }
  }

  /**
   * 把转盘上那张标贴换成**装着的唱片**的专辑封面（curver.png）。
   *
   * 挂在这个每帧走机器的循环里而不是听事件：机器的模型是 FurnitureView
   * 对账时整棵重建的，听 gramophone_changed 拿到的节点可能下一帧就被
   * 换掉；每帧对一次"贴的 vs 该贴的"，重建后自然会补贴（Map 里记的
   * 是 instanceId，不是节点引用，所以不怕重建）。
   */
  private syncLabel(instanceId: string, root: Object3D): void {
    const loaded = recordIn(instanceId) ?? "";
    const labelNode = root.getObjectByName("gramophone-record-label");
    if (!(labelNode instanceof Mesh)) return;

    // 模型重建会带着出厂红标回来，所以还要核对材质上有没有我们贴过的标记
    const material = labelNode.material as MeshLambertMaterial;
    const applied = (material.userData as { record?: string }).record;
    if (applied === loaded) return;

    const coverUrl = recordCoverUrl(loaded);
    if (!coverUrl) {
      // 没封面的唱片：保持出厂红标（flatMaterial 是共享缓存，别去改它）。
      // 在共享材质的 userData 上打标会污染缓存，所以这里干脆不打——
      // 每帧会重查一次 recordCoverUrl，null 直接短路，代价是一次 Map 查找
      return;
    }

    // 换成**自己的**材质再贴图——原材质来自 flatMaterial 缓存，
    // 直接改会把全屋所有同色的东西一起贴上封面
    const own = new MeshLambertMaterial({ color: "#ffffff" });
    (own.userData as { record?: string }).record = loaded;
    labelNode.material = own;

    textureLoader.load(coverUrl, (texture) => {
      texture.colorSpace = SRGBColorSpace;
      own.map = texture;
      own.needsUpdate = true;
    });
  }
}
