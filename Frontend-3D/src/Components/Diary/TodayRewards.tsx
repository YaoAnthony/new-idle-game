import { motion } from "motion/react";
import { Star } from "lucide-react";
import { useDiaryData } from "./useDiaryData";

/**
 * 「TODAY'S REWARDS」——今天的**奖励名额**条。
 *
 * ---- 为什么单独一个组件 ----
 *
 * 数的是 `rewardedPerDay`（一天几件有奖励），不是"一天能做几件"——
 * 做多少件不封顶，名额满了照做不照给。
 *
 * 它原来长在 `BookPlanner` 的根节点里，于是跟着书一起被绽开转场撑开——
 * 读起来像"这条也是书的一部分"。可它讲的不是这一页的事，是**今天**的事：
 * 翻到上周三那页它照样报今天还剩几格。既然它不属于任何一页，就不该和
 * 书共用一次入场。
 *
 * 拆出来之后它有自己的入场：**书先绽开，它再从上方落下来淡入**。
 * 顺序本身就是一句话——先有本子，才谈得上今天还能记几笔。
 *
 * 标记语句从原稿逐字搬来，一个类名没改。
 */

/**
 * 等书绽开完再进场。
 *
 * `Modal` 的仪式是 entry 130ms + spin 330ms + expand 550ms ≈ 1.01 秒。
 * 取 1.05 秒是**等书完全打开之后**才开始——它不是书的一部分，抢在书
 * 落定之前出现会让人以为它也是从那枚印章里长出来的。
 */
const ENTER_DELAY = 1.05;

export function TodayRewards() {
  const diary = useDiaryData();
  const maxTasks = diary.rewardedPerDay;

  const todayTasks = diary.tasks.filter((task) => task.date === diary.todayId);
  /*
   * 格子数的是**发过奖的**（gained 有值），不是"做完的"。
   * 名额条的题目就是 rewardedPerDay；休息类（不开箱）和超出名额之后
   * 做完的都不占格——数 completed 的话玩家会看着格子满了、箱子却还在开。
   */
  const todayCompletedTasks = todayTasks.filter(
    (task) => task.gained !== undefined,
  );

  return (
    <motion.div
      className="w-full max-w-[800px] z-10 mb-8 bg-[#FFF8E1] border-4 border-[#FFE082] p-4 rounded-[32px] shadow-[0_8px_0_#FFE082,0_20px_30px_rgba(0,0,0,0.1)] relative"
      /*
        **只淡入，不位移。** 试过从上方弹下来（spring + y:-28），书刚绽开
        完它又弹一下，两段动作叠在一起画面太吵；而且位移会让它读成"从书里
        飞出来的"，可它讲的是今天而不是这一页。就地淡出来最安静。
      */
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: ENTER_DELAY, duration: 0.35, ease: "easeOut" }}
    >
      {/*
        **一行：格子 + Left。**

        原稿这儿是两行——上面一行 "TODAY'S REWARDS" 标题 + Left 徽章，
        下面一行格子。牌子收到书宽一半之后（约 205px）那行 18px 的英文缩到
        4px，糊成一条；而它本来也不提供信息，格子和数字才是内容。去掉标题
        之后牌子从两行变一行，高度跟着减半，书又拿回一截。
      */}
      <div className="flex items-center gap-4 relative z-10">
        <div className="flex flex-1 justify-between gap-2">
        {[...Array(maxTasks)].map((_, i) => {
          const isCompleted = i < todayCompletedTasks.length;
          const isPlanned = !isCompleted && i < todayTasks.length;
          return (
            <div
              key={i}
              className={`flex-1 aspect-square max-w-[48px] rounded-full border-4 ${isCompleted ? "border-[#F57F17] bg-[#FFF3E0]" : isPlanned ? "border-dashed border-[#FFB74D] bg-transparent" : "border-[#FFECB3] bg-white"} shadow-[inset_0_-3px_0_rgba(0,0,0,0.05)] flex items-center justify-center relative`}
            >
              {isCompleted && (
                <motion.div
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", bounce: 0.6 }}
                >
                  <Star className="w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] fill-[#F57F17] text-[#F57F17]" />
                </motion.div>
              )}
              {isPlanned && (
                <div className="w-[12px] h-[12px] rounded-full bg-[#FFB74D]/50" />
              )}
            </div>
          );
        })}
        </div>
        <span className="shrink-0 text-white text-[15px] font-black bg-[#F57F17] px-4 py-1.5 rounded-full shadow-[0_3px_0_#E65100]">
          Left: {maxTasks - todayCompletedTasks.length}
        </span>
      </div>
    </motion.div>
  );
}
