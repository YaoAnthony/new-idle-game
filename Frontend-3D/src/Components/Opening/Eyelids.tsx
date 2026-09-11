import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";

/**
 * 开场的眼皮（2026-09-09）：一整层黑，中间挖一个**透镜形**的洞——中间最宽、
 * 两头收成尖，就是眼睛的形状。洞的高度由 Game3D/World/OpeningIntro 每帧发
 * `opening_eyelids` 来定，这里只画，不管节奏。−1 = 演完了，整层撤掉。
 *
 * 第一版用两片圆角黑块，画出来是两边宽中间窄（用户："睁眼遮罩反了"）：
 * 圆角是把**黑块**的角磨圆，而眼睛要的是把**洞**磨成梭子形。所以改成
 * SVG evenodd 挖洞：外框全屏，内框是两条二次曲线夹出的透镜。
 *
 * **新档一挂载就是全黑**（`initiallyShut`）：场景第一帧还没轮到开场类
 * 发事件，不先黑着会闪一下第三人称画面。读档进来不挂。
 *
 * 压在所有 HUD 之上（z-[60]），不吃指针：底下什么都没法点，也不该能点。
 */
export function Eyelids({ initiallyShut }: { initiallyShut: boolean }) {
  const [open, setOpen] = useState<number>(initiallyShut ? 0 : -1);

  useEffect(() => on("opening_eyelids", ({ open: next }) => setOpen(next)), []);

  if (open < 0) return null;

  /*
   * viewBox 100×100、不保持比例，洞随屏幕拉伸。透镜两端放在屏外（−35 / 135），
   * 屏幕边缘处洞才有高度；控制点离中线 140×open，全开时洞已经盖过整屏，
   * 最后 15% 再把整层淡掉，四个角不会剩黑。
   */
  const bulge = open * 140;
  const lens = `M-35 50 Q50 ${50 - bulge} 135 50 Q50 ${50 + bulge} -35 50 Z`;
  const opacity = open > 0.85 ? 1 - (open - 0.85) / 0.15 : 1;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[60] h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={`M0 0 H100 V100 H0 Z ${lens}`} fill="#000" fillRule="evenodd" style={{ opacity }} />
    </svg>
  );
}
