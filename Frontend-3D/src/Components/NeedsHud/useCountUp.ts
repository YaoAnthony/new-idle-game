import { useEffect, useRef } from "react";

/**
 * 数字**滚上去**，不是啪地跳过去。
 *
 * ## 为什么值得单独做一个
 *
 * 进账那一刻只改一个数字，玩家很容易错过——尤其是挂机类游戏，收益是
 * 一小笔一小笔来的。数字滚一下是"刚才发生了一件事"最便宜的说法，
 * 而且滚的**长短本身携带信息**：进账 3 和进账 300 滚的时间不一样。
 *
 * ## 每帧写 DOM，不走 setState
 *
 * 一个 600 毫秒的滚动是 ~36 帧。走 React state 的话这 36 帧每一帧都要
 * 重渲染整棵 HUD 子树，只为改一串文本。这里直接往 ref 上写
 * `textContent`——和进度条那边"位置每帧变就直接写 style"是同一条纪律。
 *
 * 代价：这个 span 的内容 React 管不着，所以**格式化函数要一起传进来**，
 * 不能在外面拼好字符串再传值。
 */
export function useCountUp(
  value: number,
  format: (value: number) => string,
  options: { minMs?: number; maxMs?: number } = {},
) {
  const ref = useRef<HTMLSpanElement>(null);
  /** 当前显示到哪儿了。**不是 state**：它每帧都变，进不了渲染 */
  const shown = useRef(value);
  const frame = useRef(0);
  // 格式化函数几乎必然是每次渲染新建的，放进依赖会让动画每帧重启
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const from = shown.current;
    const to = value;
    if (from === to) {
      if (ref.current) ref.current.textContent = formatRef.current(to);
      return;
    }

    /*
     * 时长跟着**变化量**走，但压在 [min, max] 里：
     * 进账 3 和进账 300 滚的时间该不一样（这是信息），
     * 可 3000 也不能滚十秒（那是折磨）。
     */
    const { minMs = 260, maxMs = 900 } = options;
    const span = Math.abs(to - from);
    const duration = Math.min(maxMs, minMs + Math.sqrt(span) * 60);
    const start = performance.now();

    cancelAnimationFrame(frame.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic：起步快、收尾稳，读起来像"数上去"而不是匀速跑表
      const eased = 1 - (1 - t) ** 3;
      shown.current = from + (to - from) * eased;
      if (ref.current) {
        ref.current.textContent = formatRef.current(Math.round(shown.current));
      }
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else shown.current = to;
    };
    frame.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame.current);
    // options 是字面量，进依赖会每次渲染重启动画——它的两个数是常量
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return ref;
}
