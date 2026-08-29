import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import BookPlanner from "./BookPlanner";
import "./index.css";

/**
 * 观察台：**原样跑用户的设计稿**（`gpt设计稿/系列任务Ui/BookPlanner.tsx`）。
 *
 * `src/BookPlanner.tsx` 是原稿的逐字拷贝，只动了两处编译必需的：补上本地
 * `Task` 类型（原稿从不存在的 `../types` 引），去掉几个声明了从没用到的变量。
 * **一个像素的设计都没改。**
 */

/** 原稿的设计尺寸。奖励条 max-w-800 + 书 max-w-1040/h-760，加上间距取整 */
const DESIGN_W = 1120;
const DESIGN_H = 980;

/**
 * 等比缩放塞进视口。
 *
 * 原稿是按桌面写死的（`text-[28px]`、`p-8`、书 `h-[760px]`、书签
 * `w-[80px] h-[120px]`）。这游戏只做横屏、基准机 iPhone SE 是 667×375——
 * 直接放上去只有奖励条和"Daily Plan"四个字露在屏幕里，书整个在下面。
 *
 * **用 transform 缩放而不是改版式**：所有比例、圆角、投影、字重原样保留，
 * 只是整体变小。这样"设计稿长什么样"和"设备上长什么样"是同一件东西，
 * 不会缩着缩着变成另一版设计。
 *
 * 代价说清楚：667×375 上缩放比约 0.38，28px 的标题落到 11px 左右。
 * 要在手机上读得舒服，得给小屏做一版真正的版式（那是设计决定，不是缩放）。
 */
function Fit({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  /*
   * 两个坑，都踩过了：
   *
   * 1. **`transform` 不改布局盒。** 用 `place-items-center` 居中一个
   *    1120×980 的盒子，在 667×375 的视口里它先溢出、再缩小，居中算的是
   *    溢出前的位置——内容被甩到右下角。改成绝对定位 + translate(-50%,-50%)。
   * 2. **原稿根节点是 `min-h-screen`。** 在这个盒子里它等于视口的 375px，
   *    于是内容按 375 居中而不是按 980。下面那条 CSS 把它拧回 100%。
   */
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#E8F5E9]">
      <style>{`.fit-stage .min-h-screen { min-height: 100% !important; }`}</style>
      <div
        className="fit-stage absolute left-1/2 top-1/2"
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <Fit>
    <BookPlanner />
  </Fit>,
);
