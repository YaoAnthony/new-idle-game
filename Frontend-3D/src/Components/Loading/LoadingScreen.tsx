import { motion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import { t } from "../../i18n/t";
import "./LoadingScreen.css";

/**
 * 进世界之前的加载页。
 *
 * 文字用 clip-path 从左往右填满，底下压一层同样的字做"未填充"态——
 * 比进度条更省地方，而且填充的是**正在读的那句话**，视线不用在
 * "文案"和"条"之间来回跳。
 *
 * 进度是**真的**：`progress` 由调用方按已加载素材条数喂进来，不是定时器
 * 假装在动。假进度条在素材已经缓存时会硬等两秒，第二次进游戏尤其明显。
 *
 * 但中间套了一层 spring：真实进度是一跳一跳的（一条素材解码完跳一格），
 * 直接绑 clip-path 会看到台阶。spring 把台阶抹成连续的推进，
 * 同时保证"到了 1 就是真的加载完了"。
 */

type Props = {
  /** 0~1。由调用方按真实加载进度更新 */
  progress: number;
};

export function LoadingScreen({ progress }: Props) {
  /**
   * stiffness 偏低、damping 拉满：要的是"稳稳地推过去"，不是弹一下。
   * 加载页上任何回弹都会让人觉得进度倒退了。
   */
  const eased = useSpring(0, { stiffness: 90, damping: 30, restDelta: 0.001 });
  const clipPath = useTransform(
    eased,
    [0, 1],
    ["inset(0 100% 0 0)", "inset(0 0% 0 0)"],
  );

  useEffect(() => {
    eased.set(progress);
  }, [eased, progress]);

  const label = t("ui.loading.world");

  return (
    <motion.div
      className="loading-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="loading-text-container">
        {/* 未填充的底层。aria-hidden：同一句话读两遍对读屏器是噪音 */}
        <div className="loading-text loading-text--bg" aria-hidden>
          {label}
        </div>
        <motion.div
          className="loading-text loading-text--fill"
          style={{ clipPath }}
        >
          {label}
        </motion.div>
      </div>
    </motion.div>
  );
}
