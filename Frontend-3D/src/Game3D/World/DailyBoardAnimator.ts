import type { Object3D } from "three";
import { on } from "../../Game/EventBus";

/**
 * 每日任务机吐奖励时的那一下（V0.11）。
 *
 * 满格发奖时机器要"活一下"：蹲下、弹起、余震两下，吐口同时往前推出去
 * 又缩回来。番茄本身由 `throwItem` 抛出（物理和联机同步都是现成的），
 * 这个类只负责**机器自己的形变**。
 *
 * 为什么单独一个类而不是塞进 FurnitureView：那边管的是"屋里有哪些家具"
 * 的增删对账，是个纯同步器；这里管的是**一段有时间轴的表演**，
 * 每帧要推进。两件事的生命周期完全不同——机器被收走时动画要跟着停，
 * 但动画播完机器还在。
 *
 * 找节点靠名字（`daily-board-body` / `daily-board-spout`，见
 * Visual/recipes/dailyBoard）。造型改了但名字还在，动画就不用动。
 */

/** 整段表演多久。0.9 秒：够看清三次弹跳，又不至于让人等 */
const DURATION = 0.9;

/**
 * 弹跳曲线：一次深蹲 + 三次递减的回弹。
 *
 * 返回**竖直缩放的偏移量**（0 = 原样，负数 = 压扁，正数 = 拉长）。
 * 用 `sin(t·3π) · e^(-3t)` 而不是分段的关键帧：一个衰减正弦天然带出
 * "弹一下、再弹小一点、停住"的手感，改参数就能调软硬，
 * 而关键帧要手摆五六个点还容易在接缝处顿一下。
 */
function bounce(t: number): number {
  // 开头那 12% 先压下去（蓄力），之后才弹——直接弹起来会像被顶了一下
  if (t < 0.12) return -(t / 0.12) * 0.18;
  const u = (t - 0.12) / 0.88;
  return Math.sin(u * Math.PI * 3) * 0.26 * Math.exp(-3 * u);
}

type Playing = {
  body: Object3D;
  spout: Object3D | null;
  /** 出口的原始 z，收工时要还回去 */
  spoutZ: number;
  elapsed: number;
};

export class DailyBoardAnimator {
  private playing: Playing[] = [];
  private readonly unsubscribe: () => void;

  /**
   * @param findMachines 每次要播时现查屋里的机器根节点。
   *   **不缓存**：机器可能被收走、被摆第二台，缓存一份迟早指向
   *   已经 dispose 掉的节点。
   */
  constructor(private readonly findMachines: () => Object3D[]) {
    // 本地领奖和收到别人领奖的广播都该演——所以听的是"状态变了"
    // 那条（daily_board_changed），不是只有本地才发的 _locally
    this.unsubscribe = on("daily_board_changed", ({ reason }) => {
      if (reason === "claimed") this.play();
    });
  }

  private play(): void {
    for (const machine of this.findMachines()) {
      const body = machine.getObjectByName("daily-board-body");
      if (!body) continue;

      // 已经在演的同一台不重复入队：两条 claimed（本地置位 + 网络回声）
      // 撞在一起会让形变叠加，机器当场被拉成面条
      if (this.playing.some((entry) => entry.body === body)) continue;

      const spout = machine.getObjectByName("daily-board-spout") ?? null;
      this.playing.push({
        body,
        spout,
        spoutZ: spout?.position.z ?? 0,
        elapsed: 0,
      });
    }
  }

  update(deltaSeconds: number): void {
    if (this.playing.length === 0) return;

    for (const entry of this.playing) {
      entry.elapsed += deltaSeconds;
      const t = Math.min(1, entry.elapsed / DURATION);

      const offset = bounce(t);
      /*
       * 竖直拉长时横向要收窄（反之亦然）——体积守恒是 squash & stretch
       * 读起来"有弹性"的关键。只改 y 的话看着像被拉伸的贴图，不像橡胶。
       * 0.55 而不是严格的 1/√(1+offset)：真实体积守恒在低多边形上过于
       * 明显，会显得机器在漏气。
       */
      entry.body.scale.set(1 - offset * 0.55, 1 + offset, 1 - offset * 0.55);

      if (entry.spout) {
        // 出口跟着往前吐一下。只在前半段推出去，后半段缩回
        const push = Math.max(0, Math.sin(t * Math.PI)) * 0.05;
        entry.spout.position.z = entry.spoutZ + push;
      }
    }

    // 播完的收工：**把形变归位**。留着 0.999 的缩放不还原，
    // 演几十次之后机器会肉眼可见地矮一截
    this.playing = this.playing.filter((entry) => {
      if (entry.elapsed < DURATION) return true;
      entry.body.scale.set(1, 1, 1);
      if (entry.spout) entry.spout.position.z = entry.spoutZ;
      return false;
    });
  }

  dispose(): void {
    this.unsubscribe();
    for (const entry of this.playing) {
      entry.body.scale.set(1, 1, 1);
      if (entry.spout) entry.spout.position.z = entry.spoutZ;
    }
    this.playing = [];
  }
}
