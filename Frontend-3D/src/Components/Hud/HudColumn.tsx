import { NeedsHud } from "../NeedsHud/NeedsHud";
import { NoiseMixer } from "../NoiseMixer/NoiseMixer";
import { WorldClock } from "../WorldClock/WorldClock";

/**
 * 左上角那一列：时钟 → 需求条 → 白噪音台（V0.13 抽出来的）。
 *
 * **每一块都不自己定位、不自己定宽**，全交给这里的 flex 和 HudPanel。
 * 各自 absolute 的老写法要求每块都猜"上面那堆有多高"，而时钟的天气行
 * 长短不一、需求条的条目数会随解锁增加、白噪音台的行数跟着周围响几条
 * 声音变——三个会变的高度叠在一起，魔数必然对不上。
 *
 * 这一列**上下都钉住**（top-4 / bottom 见 .hud-column）：有了确定的高度，
 * 末尾那块（行数浮动的白噪音台）才知道自己最多能长多高，不会压到快捷栏。
 *
 * 白噪音台"被控制唤醒"是它自己的事——它订阅 action_changed，没在专注
 * 就返回 null，这一列不需要知道。加一块新面板同理：塞进来就行。
 */
export function HudColumn({ touchMode }: { touchMode: boolean }) {
  return (
    <div
      className={[
        "hud-column pointer-events-none absolute left-4 top-4 z-10 flex flex-col items-start gap-2 [&>*]:pointer-events-auto",
        // 触摸端的快捷栏会整条抬起来（见 Mobile.css），让位距离跟着变
        touchMode ? "hud-column--touch" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <WorldClock />
      <NeedsHud />
      <NoiseMixer />
    </div>
  );
}
