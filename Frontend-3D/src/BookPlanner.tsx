import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Trash2, Plus, Play, CalendarDays, Star, Leaf } from 'lucide-react';
import HTMLFlipBook from 'react-pageflip';
import { useDiaryData } from './Components/Diary/useDiaryData';

/**
 * 原稿从 `../types` 引 Task，这个项目里没有那个文件。
 * **原样搬过来当本地类型**，一个字段不改——接进游戏那一步再映射到
 * `PlayerActionEntry` / `dayRecord`，现在照抄就是照抄。
 */
type Task = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  durationMinutes: number;
  reward: number;
  date: string;
};

const getLocalYYYYMMDD = (d: Date) => {
  return d.toLocaleDateString('en-CA');
};

/*
 * 一天最多几件。**从 Core 的注册表读，不写死 10**——它同时是补记额度的
 * 分母，两处各写一个数迟早对不上（`actionLogTuning` 的注释里记着这笔账）。
 */
/*
 * 原稿有一个 `MAX_TASKS`，左右两页共用，数的是 `plans + completed`。
 * 两个毛病：
 *   1. **计划不该封顶。** 想写十五条就写十五条——做不做得完是玩家自己的
 *      事，本子不该替他管。原稿封顶之后左页会写"口袋已满！"。
 *   2. 它把两边加在一起数，于是左页排了 5 条计划，右页就报"配额已满！"
 *      ——而右页那道闸是**补录额度**，跟你排了几条计划毫无关系。
 * 所以这个常量整个去掉：左页不设限，右页问 `diary.logQuotaLeft`（真额度）。
 */

// ------------------------------------------------------------------
// Interactive Area (Blocks native events for pageflip)
// ------------------------------------------------------------------

/**
 * 书页里"能操作的那一块"：挡住 page-flip，别让它把这儿的按下当成翻页拖拽。
 *
 * ---- 改了原稿一行，必须说清楚 ----
 *
 * 原稿掐的事件是
 *   `['pointerdown','mousedown','touchstart','pointerup','mouseup','touchend','click']`
 * ——**`click` 不能掐**。React 19 的事件是委托在根容器上的：在中间这一层
 * `stopPropagation()`，事件就到不了根容器，里面所有 `onClick` 一个都不会跑。
 * 书里的播放键、删除键、天气选择、TODAY! 跳转因此全是死的，点了没反应也
 * 不报错。
 *
 * 「添加」看着能用是个巧合：它在 `<form>` 里，点按钮触发的是原生提交，
 * 走的是 `submit` 事件——不在这张名单上，所以照常冒泡到根容器。正是这个
 * 巧合让整件事看起来"书是能用的"，查了好几轮才落到这儿。
 *
 * 留下 down/start 三个就够了：page-flip 的拖拽是从按下开始算的，起不来
 * 就不会有拖拽。抬起和 click 放行，React 才收得到。
 */
const InteractiveArea = ({ children, className }: any) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    const events = ['pointerdown', 'mousedown', 'touchstart'];
    events.forEach(ev => el.addEventListener(ev, stop));
    return () => {
      events.forEach(ev => el.removeEventListener(ev, stop));
    };
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
};

// ------------------------------------------------------------------
// Page Content Components
// ------------------------------------------------------------------

const LeftPageContent = ({ date, dateStr, isToday, tasks, diary, onEnterFocus, jumpToToday, weather, setWeather }) => {
  const [planTitle, setPlanTitle] = useState('');
  const [planDuration, setPlanDuration] = useState('30');
  /** 被游戏拒了的原因（精力不够、额度满了…）。原稿没有这个——它不会失败 */
  const [error, setError] = useState<string | null>(null);
  
  /*
   * **"今天"必须用游戏的 worldDayId，不能用 `new Date()`。**
   *
   * 世界日有分界时刻（不是午夜）。凌晨那一段两者会差一天：日历已经翻页、
   * 游戏还在"昨天"。用挂钟的话，玩家在那个窗口里翻到的是新一页，而记下
   * 的那笔会写进 dayFacts 的**上一天**——写完就看不见了，还找不出原因。
   */
  const todayStr = diary.todayId;
  const isPast = dateStr < todayStr;
  
  const currentDayTasks = tasks.filter(t => t.date === dateStr);
  const activeTasks = currentDayTasks.filter((t) => !t.completed).sort((a, b) => b.createdAt - a.createdAt);
  
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = weekdays[date.getDay()];
  const dateDisplay = `${month}月${day}日 ${weekday}`;

  /*
   * 三个动作全部转给游戏（`useDiaryData`）。
   *
   * 原稿在这儿直接改 `tasks` 数组，那是它自带的本地状态。接进游戏之后
   * 每一个都对应一次真实结算：加计划 → `addActionEntry`，打勾 →
   * `logCompletedAction`（扣精力、开箱、写进 dayFacts）再删模板，
   * 开始 → `startActionEntry` 跑真的计时器。
   */
  const handleAddPlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planTitle.trim()) return;
    diary.addPlan(planTitle.trim(), parseInt(planDuration) || 30);
    setPlanTitle('');
  };

  /**
   * 按播放键 = **进专注模式**：角色走过去用家具，书本合上，
   * 屏幕交给 `Components/ActionHub/FocusCard`（倒计时卡 + 全屏暗角）。
   *
   * 原稿在这儿自己跑一个 `setInterval` 倒计时，显示在任务行上。删掉了：
   * 真正的行动按**绝对 UTC** 推进（关掉游戏也照常完成），书里再数一遍
   * 就是两处各算一份，迟早对不上；而且书都合上了，那个数字没人看得见。
   */
  const startFocus = (task: Task) => {
    // 起不来的原因由 `diary.startTimer` 报回来（手上有事 / 精力不够 / …）。
    // 原来这儿写死一句"精力不够或者家具还没摆"，把几种原因糊在一起，
    // 而家具那半句在门槛取消之后已经是假话了
    const why = diary.startTimer(task.id);
    if (why) {
      setError(why);
      return;
    }
    onEnterFocus?.();
  };

  const deleteTask = (id: string) => {
    diary.remove(id);
  };


  /*
   * 容器原来写死 `font-['Nunito',sans-serif]`。标题改成中文之后不能留：
   * Nunito 不含汉字，栈里又没有中文兜底，"今日任务"会掉到系统默认无衬线，
   * 和整本书的手写体对不上。去掉之后继承 `DiaryPanel` 那一层的完整字体栈
   * （Nunito → 霞鹜文楷 → 楷体），英文照样还是 Nunito。
   */
  return (
    <div className="flex-1 relative pt-12 pb-10 px-8 flex flex-col h-full">
      <InteractiveArea className="mb-4 flex flex-col border-b-[4px] border-[#FFE082]/60 border-dashed pb-4 relative">
        <div className="flex justify-between items-baseline w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FFE082] flex items-center justify-center shadow-[0_4px_0_#FFCA28]">
               <CalendarDays className="w-5 h-5 text-[#5D4037]" strokeWidth={3} />
            </div>
            {/*
              标题跟着这一页是不是今天走。原稿两边都是死的英文（Daily Plan /
              Memories），换成中文之后"今日""今天"就带上了时间，往回翻到
              8月26 那页还写着"今日任务"是错的——那页讲的不是今天。
            */}
            <h1 className="text-[28px] font-black text-[#795548] tracking-wide">
              {isToday ? '今日任务' : '当天任务'}
            </h1>
          </div>
        </div>
        
        {/*
          这一行原来是 `justify-between`：日期+天气靠左，「回到今天」被顶到
          左页最右边——而那儿正好是书签垂下来的落点，两个珊瑚色的东西叠在
          一起。改成顺着排，右边空出来留给书签。
        */}
        <div className="flex items-center gap-2 mt-3 pl-2">
          <div className="flex items-center gap-2">
            <span className="text-[#8D6E63] text-[16px] font-bold tracking-wider flex items-center bg-[#F5F5F5] px-3 py-1 rounded-full shadow-[inset_0_-2px_0_#E0E0E0]">
              {dateDisplay}
            </span>
            <div className="flex gap-1 bg-[#F5F5F5] p-1 rounded-full shadow-[inset_0_-2px_0_#E0E0E0]">
               {['☀️','☁️','🌧️','❄️'].map(w => (
                  <button
                     key={w}
                     type="button"
                     disabled={isPast}
                     onClick={() => !isPast && setWeather(w)}
                     className={`w-7 h-7 rounded-full flex items-center justify-center text-[15px] transition-colors ${weather === w ? 'bg-white shadow-[0_2px_4px_rgba(0,0,0,0.1)] ring-1 ring-white' : 'hover:bg-[#E0E0E0] opacity-50'} ${isPast ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'}`}
                  >
                     {w}
                  </button>
               ))}
            </div>
          </div>
          
          {/*
            **「回到今天」是个按钮，不是这一页的标签。**

            原稿写的是 `Today!`（还带 `uppercase`）。它只在**不是**今天的页上
            出现，本意是"点我跳回今天"；但一个孤零零的 TODAY! 贴在日期旁边，
            读起来就是"这一页是今天"——翻回上周三，那儿写着 8月26 又写着
            TODAY!，看的人只会觉得日期算错了。改成动词短语，歧义就没了。
          */}
          {!isToday && (
            <button
              onClick={jumpToToday}
              className="text-white bg-[#FF8A65] hover:bg-[#FF7043] px-3 py-1 rounded-full text-[13px] font-black tracking-wide transition-transform active:scale-95 shadow-[0_3px_0_#F4511E]"
            >
              回到今天
            </button>
          )}
        </div>
      </InteractiveArea>

      <InteractiveArea 
        className="flex-1 overflow-y-auto relative -mx-2 px-2 scrollbar-hide"
      >
        {isPast ? (
          <div className="flex items-center justify-center h-[64px] bg-[#F5F5F5] rounded-[20px] mb-3 border-2 border-[#EEEEEE] px-3 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
            <span className="text-[#BCAAA4] font-bold text-[16px] tracking-wide">时光机无法倒流哦 ~ 🕰️</span>
          </div>
        ) : (
          <form onSubmit={handleAddPlan} className={`flex items-center h-[64px] bg-white rounded-[20px] mb-3 border-2 border-[#EEEEEE] px-3 shadow-[0_4px_12px_rgba(0,0,0,0.03)] group`}>
            <div className="w-8 h-8 rounded-full bg-[#E0F2E9] flex items-center justify-center mr-2 text-[#4DB6AC]">
              <Plus className="w-[20px] h-[20px]" strokeWidth={3.5} />
            </div>
            <input
              type="text"
              placeholder="今天要去做什么呢？"
              className="flex-1 bg-transparent border-none outline-none text-[17px] font-bold text-[#5D4037] placeholder:text-[#BCAAA4]"
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
            />
            
            <div className="flex items-center bg-[#FFF8E1] rounded-full px-3 py-1.5 mr-2 border-2 border-[#FFE082]">
              <input
                type="number"
                className="w-8 bg-transparent text-center outline-none text-[#F57F17] font-black text-[15px] hide-number-arrows"
                value={planDuration}
                onChange={(e) => setPlanDuration(e.target.value)}
                min="1"
                max="999"
              />
              <span className="text-[#F57F17] text-[13px] font-bold ml-1">分</span>
            </div>

            <button 
              type="submit"
              disabled={!planTitle.trim()}
              className="px-4 py-[8px] bg-[#4DB6AC] text-white rounded-full text-[15px] font-black tracking-widest disabled:opacity-30 hover:bg-[#26A69A] shadow-[0_4px_0_#00897B] active:shadow-[0_0px_0_#00897B] active:translate-y-[4px] transition-all cursor-pointer relative z-50"
            >
              添加
            </button>
          </form>
        )}

        {/*
          被游戏拒了的原因。原稿没有这一块——它的添加永远成功，而接进
          游戏之后有五道门槛（精力、家具、额度、时长、进行中），
          **拒绝必须说得出理由**，否则玩家点了没反应只会以为坏了。
        */}
        {error && (
          <div className="mb-2 px-3 py-2 rounded-[16px] bg-[#FFEBEE] border-2 border-[#EF9A9A] text-[#C62828] text-[14px] font-bold">
            {error}
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {activeTasks.map((task) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", bounce: 0.4, duration: 0.4 }}
              key={task.id}
              className="flex items-center h-[64px] bg-white rounded-[20px] mb-2 border-2 border-[#EEEEEE] group px-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:border-[#81C784] transition-colors"
            >
              {/*
                左边那个打钩圈**去掉了**。

                它原来是"直接把这条标成完成"，也就是不做就能领奖。现在计划
                只有一条出口：按播放键进专注，跑完由 `Systems/actions` 结算。
                已经做完的事走右页「补录」，那条有自己的额度和门槛。
                两条路各管各的，中间不留一个绕过去的口子。
              */}
              <span className="flex-1 text-[17px] font-bold text-[#5D4037] truncate pt-[2px] pl-1">{task.title}</span>
              
              <span className="text-[#8D6E63] font-bold text-[14px] mr-3 bg-[#F5F5F5] px-3 py-1 rounded-full shadow-[inset_0_-2px_0_#E0E0E0]">
                {task.durationMinutes} min
              </span>

              {!isPast && (
                <button
                  onClick={() => startFocus(task)}
                  aria-label="开始专注"
                  className="w-[36px] h-[36px] rounded-full flex items-center justify-center transition-all mr-2 flex-shrink-0 cursor-pointer z-50 bg-[#FFCA28] hover:bg-[#FFB300] text-white shadow-[0_4px_0_#FF8F00] active:shadow-none active:translate-y-[4px]"
                >
                  <Play className="w-[16px] h-[16px] ml-[3px] fill-current" strokeWidth={3} />
                </button>
              )}

              {!isPast && (
                <button
                  onClick={() => deleteTask(task.id)}
                  className="w-[36px] h-[36px] bg-[#F5F5F5] text-[#BCAAA4] hover:text-white hover:bg-[#EF5350] transition-colors rounded-full flex items-center justify-center cursor-pointer z-50 shadow-[0_4px_0_#E0E0E0] hover:shadow-[0_4px_0_#C62828] active:shadow-none active:translate-y-[4px]"
                >
                  <Trash2 className="w-[18px] h-[18px]" strokeWidth={2.5} />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </InteractiveArea>
    </div>
  );
};

const RightPageContent = ({ dateStr, tasks, diary }) => {
  const [logTitle, setLogTitle] = useState('');
  const [logDuration, setLogDuration] = useState('30');
  const [error, setError] = useState<string | null>(null);
  
  // 同左页：今天走 worldDayId，不走挂钟
  const todayStr = diary.todayId;
  const isPast = dateStr < todayStr;
  
  const currentDayTasks = tasks.filter(t => t.date === dateStr);
  const completedTasks = currentDayTasks.filter((t) => t.completed).sort((a, b) => b.createdAt - a.createdAt);
  /*
   * 补录额度问的是**游戏**，不是这一页上有几条。原稿拿"计划+已完成"的
   * 条数当额度，于是左页排满计划、右页就说"配额已满"——两件不相干的事。
   */
  const quotaUsedUp = diary.logQuotaLeft <= 0;

  const handleAddLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!logTitle.trim() || quotaUsedUp) return;
    const why = diary.addLog(logTitle.trim(), parseInt(logDuration) || 30);
    if (why) {
      setError(why);
      return;
    }
    setLogTitle('');
    setError(null);
  };

  /*
   * 右页的条目**删不掉**。
   *
   * 原稿这儿有个垃圾桶。但右页现在是 `dayFacts`——已经发生过的事实：
   * 精力扣了、箱开了、东西进包了。删掉那一行不会把这些退回来，只会让
   * 日记和背包对不上。已经发生的事不能从日记里抹掉。
   */
  const deleteTask = (_id: string) => {};

  /*
   * 容器原来写死 `font-['Nunito',sans-serif]`。标题改成中文之后不能留：
   * Nunito 不含汉字，栈里又没有中文兜底，"今日任务"会掉到系统默认无衬线，
   * 和整本书的手写体对不上。去掉之后继承 `DiaryPanel` 那一层的完整字体栈
   * （Nunito → 霞鹜文楷 → 楷体），英文照样还是 Nunito。
   */
  return (
    <div className="flex-1 relative pt-12 pb-10 px-8 flex flex-col h-full">
      <InteractiveArea className="mb-4 flex flex-col pb-4 border-b-[4px] border-[#FFE082]/60 border-dashed">
        <div className="flex items-center gap-3 w-full">
          <div className="w-10 h-10 rounded-full bg-[#A5D6A7] flex items-center justify-center shadow-[0_4px_0_#81C784]">
             <Star className="w-5 h-5 text-white fill-white" strokeWidth={2} />
          </div>
          {/* 同左页：往回翻的那些天不该写"今天"。isPast 就是"不是今天" */}
          <h1 className="text-[28px] font-black text-[#795548] tracking-wide">
            {isPast ? '当天做完了' : '今天做完了'}
          </h1>
        </div>

        {/*
          **撑高用的影子行**：让右页那道黄虚线和左页齐平。

          左页标题下面还有一行（日期胶囊 + 四个天气按钮），右页没有，于是
          两道虚线差了那一行的高度，摊开看是歪的。

          用 `invisible`（保留占位的隐藏）克隆同一套尺寸类，而不是写一个
          `h-[36px]` 的数：那一行的高度是天气按钮 `w-7 h-7` 加外圈 `p-1`
          算出来的，哪天字号或按钮改了，写死的数就悄悄错开——而"两页虚线
          差三个像素"正好是那种看着别扭、又没人想得起来去查的毛病。
          克隆同构的话它自己会跟着变。
        */}
        <div
          aria-hidden
          className="invisible pointer-events-none flex items-center gap-2 mt-3 pl-2"
        >
          <span className="text-[16px] font-bold px-3 py-1 rounded-full">占位</span>
          <div className="flex gap-1 p-1 rounded-full">
            <span className="block w-7 h-7" />
          </div>
        </div>
      </InteractiveArea>

      <InteractiveArea 
        className="flex-1 overflow-y-auto relative -mx-2 px-2 scrollbar-hide"
      >
        {isPast ? (
          <div className="flex items-center justify-center h-[64px] bg-[#F5F5F5] rounded-[20px] mb-3 border-2 border-[#EEEEEE] px-3 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
            <span className="text-[#BCAAA4] font-bold text-[16px] tracking-wide">昨日的回忆已封存 ~ 🌟</span>
          </div>
        ) : (
          <form onSubmit={handleAddLog} className={`flex items-center h-[64px] bg-white rounded-[20px] mb-3 border-2 border-[#EEEEEE] px-3 shadow-[0_4px_12px_rgba(0,0,0,0.03)] group ${quotaUsedUp ? 'opacity-50' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-[#FFF3E0] flex items-center justify-center mr-2 text-[#FF8A65]">
              <Check className="w-[20px] h-[20px]" strokeWidth={3.5} />
            </div>
            <input
              type="text"
              placeholder={quotaUsedUp ? "今天的补录额度用完了" : "记录已完成的成就..."}
              disabled={quotaUsedUp}
              className="flex-1 bg-transparent border-none outline-none text-[17px] font-bold text-[#5D4037] placeholder:text-[#BCAAA4]"
              value={logTitle}
              onChange={(e) => setLogTitle(e.target.value)}
            />
            
            <div className="flex items-center bg-[#FFF8E1] rounded-full px-3 py-1.5 mr-2 border-2 border-[#FFE082]">
              <input
                type="number"
                disabled={quotaUsedUp}
                className="w-8 bg-transparent text-center outline-none text-[#F57F17] font-black text-[15px] hide-number-arrows"
                value={logDuration}
                onChange={(e) => setLogDuration(e.target.value)}
                min="1"
                max="999"
              />
              <span className="text-[#F57F17] text-[13px] font-bold ml-1">分</span>
            </div>

            <button 
              type="submit"
              disabled={!logTitle.trim() || quotaUsedUp}
              className="px-4 py-[8px] bg-[#FF8A65] text-white rounded-full text-[15px] font-black tracking-widest disabled:opacity-30 hover:bg-[#FF7043] shadow-[0_4px_0_#F4511E] active:shadow-[0_0px_0_#F4511E] active:translate-y-[4px] transition-all cursor-pointer relative z-50"
            >
              补录
            </button>
          </form>
        )}

        {error && (
          <div className="mb-2 px-3 py-2 rounded-[16px] bg-[#FFEBEE] border-2 border-[#EF9A9A] text-[#C62828] text-[14px] font-bold">
            {error}
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {completedTasks.map((task) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", bounce: 0.4, duration: 0.4 }}
              key={task.id}
              className="flex items-center h-[64px] bg-[#F5F5F5] rounded-[20px] mb-2 border-2 border-[#E0E0E0] group px-3"
            >
              <div className="w-[28px] h-[28px] bg-[#A5D6A7] rounded-full mr-3 flex-shrink-0 flex items-center justify-center shadow-[inset_0_-2px_0_rgba(0,0,0,0.1)] border-2 border-[#81C784]">
                <Check className="w-[16px] h-[16px] text-white" strokeWidth={4} />
              </div>
              <span className="flex-1 text-[17px] font-bold text-[#9E9E9E] line-through decoration-[#BDBDBD] decoration-2 truncate pt-[2px]">{task.title}</span>
              
              <span className="text-[#9E9E9E] font-bold text-[14px] mr-3 bg-white px-3 py-1 rounded-full shadow-[inset_0_-2px_0_#EEEEEE]">
                {task.durationMinutes} min
              </span>
              
              {/*
                这颗星有两个状态。

                **领过了**（`gained` 有值）：一枚不能按的琥珀色徽章，就是
                "这件事换到过东西"的记号。原稿这儿写的是 `+{task.reward}`，
                而游戏里没有分数这回事——那个字段根本不存在，屏幕上一直印着
                一个光秃秃的 "+"。

                **没领**（`gained` 为空）：一颗**能按**的星。行动按绝对 UTC
                推进，断线、关机、换设备的时候它照常完成，但那台机器上没人
                给它结算；读档时的补结算救得了"存档里还挂着那个行动"的情况，
                救不了存档没写下去的。这颗星是那条链路的兜底——点一下补发。
                按不动的原因（休息类不开箱、名额满了、太老的记录）由
                `claim()` 回一句人话，不在这儿判。
              */}
              {task.gained !== undefined ? (
                <div className="flex items-center bg-[#FFF8E1] border-2 border-[#FFE082] px-3 py-1 rounded-full mr-2 shadow-[inset_0_-2px_0_rgba(255,202,40,0.5)]">
                  <Star className="w-4 h-4 fill-[#F57F17] text-[#F57F17]" />
                </div>
              ) : isPast ? null : (
                <button
                  type="button"
                  aria-label="补领奖励"
                  onClick={() => {
                    const why = diary.claim(task.id);
                    if (why) setError(why);
                  }}
                  className="flex items-center bg-[#FFCA28] hover:bg-[#FFB300] text-white px-3 py-1 rounded-full mr-2 cursor-pointer z-50 shadow-[0_4px_0_#FF8F00] active:shadow-none active:translate-y-[4px] transition-all"
                >
                  <Star className="w-4 h-4 fill-white text-white mr-1" />
                  <span className="font-black text-[13px] tracking-wide">领取</span>
                </button>
              )}

              {!isPast && (
                <button
                  onClick={() => deleteTask(task.id)}
                  className="w-[36px] h-[36px] bg-white text-[#BCAAA4] hover:text-white hover:bg-[#EF5350] transition-colors rounded-full flex items-center justify-center cursor-pointer z-50 shadow-[0_4px_0_#E0E0E0] hover:shadow-[0_4px_0_#C62828] active:shadow-none active:translate-y-[4px]"
                >
                  <Trash2 className="w-[18px] h-[18px]" strokeWidth={2.5} />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </InteractiveArea>
    </div>
  );
};

const Page = React.forwardRef<HTMLDivElement, any>((props, ref) => {
  return (
    <div ref={ref} className={`page bg-[#FFFFFF] h-full shadow-inner relative flex flex-col overflow-hidden ${props.isRight ? 'rounded-r-[24px]' : 'rounded-l-[24px]'}`}>
      {/* Cute Grid Pattern for Pages */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-40" 
           style={{ backgroundImage: 'radial-gradient(#E0E0E0 2px, transparent 2px)', backgroundSize: '24px 24px' }} />
      
      {/* Soft spine shadow */}
      <div className={`absolute top-0 bottom-0 ${props.isRight ? 'left-0 w-12 bg-gradient-to-r' : 'right-0 w-12 bg-gradient-to-l'} from-[#E0E0E0]/60 to-transparent z-10 pointer-events-none`} />
      
      <div className="relative z-20 flex-1 flex flex-col h-full cursor-default">
        {props.children}
      </div>
    </div>
  );
});

const InsideCoverPage = React.forwardRef<HTMLDivElement, any>((_props, ref) => {
  return (
    <div ref={ref} className="page bg-[#66BB6A] h-full shadow-[inset_-10px_0_20px_rgba(0,0,0,0.15)] relative flex flex-col items-center justify-center overflow-hidden rounded-l-[24px] border-r-2 border-[#4CAF50]">
      <div className="absolute inset-0 pointer-events-none opacity-20" 
           style={{ backgroundImage: 'radial-gradient(#FFF 3px, transparent 3px)', backgroundSize: '24px 24px' }} />
      <div className="w-[160px] h-[200px] bg-[#FFF8E1] rounded-[16px] shadow-lg transform -rotate-6 p-3 flex flex-col border-4 border-[#FFE082] relative z-10">
        <div className="flex-1 bg-[#A5D6A7] rounded-[8px] mb-3 flex items-center justify-center border-4 border-[#81C784] shadow-inner">
          <span className="text-[64px]">🏝️</span>
        </div>
        <span className="text-center font-['Nunito'] text-[#795548] font-black text-[20px] tracking-widest">PASSPORT</span>
      </div>
      <div className="absolute top-0 bottom-0 right-0 w-12 bg-gradient-to-l from-[#388E3C]/40 to-transparent z-10 pointer-events-none" />
    </div>
  );
});

const TitlePage = React.forwardRef<HTMLDivElement, any>((_props, ref) => {
  return (
    <div ref={ref} className="page bg-[#FFFFFF] h-full shadow-[inset_10px_0_20px_rgba(0,0,0,0.05)] relative flex flex-col items-center justify-center overflow-hidden rounded-r-[24px] border-l border-[#E0E0E0]">
      <div className="absolute inset-0 pointer-events-none z-0 opacity-40"
           style={{ backgroundImage: 'radial-gradient(#E0E0E0 2px, transparent 2px)', backgroundSize: '24px 24px' }} />
      <div className="bg-[#FFF8E1] p-8 rounded-[32px] border-4 border-[#FFE082] shadow-[0_8px_0_#FFE082] relative z-10 text-center transform rotate-2">
        <div className="w-20 h-20 bg-[#81C784] rounded-full mx-auto mb-6 flex items-center justify-center border-4 border-white shadow-md">
          <Leaf className="w-10 h-10 text-white fill-white" />
        </div>
        <h1 className="text-[36px] font-black text-[#5D4037] mb-2 tracking-wide font-['Nunito']">Island Journal</h1>
        <p className="text-[#8D6E63] font-bold text-[18px]">Since Aug 27, 2026</p>
      </div>
      <div className="absolute top-0 bottom-0 left-0 w-12 bg-gradient-to-r from-[#E0E0E0]/60 to-transparent z-10 pointer-events-none" />
    </div>
  );
});

// ------------------------------------------------------------------
// Main BookPlanner Component
// ------------------------------------------------------------------

/**
 * 一次最多往回翻多少天。
 *
 * 日期范围本身是**从开启日记那天排到今天**（`diary.startedOn`，v35——
 * 历史多长由玩了多久决定），这个数只是页数的安全阀：page-flip 为每一页
 * 建 DOM，玩上一年就是 700+ 页，挂载会肉眼可见地卡。60 天 = 120 页，
 * 实测还稳。翻更早的历史要做"跳到某月"的导航，那是下一轮的事——
 * 到时候拆的是这个安全阀，不是日期逻辑。
 */
const MAX_PAST_DAYS = 60;

export type BookNavApi = { prev: () => void; next: () => void };

export default function BookPlanner({
  navApi,
  onNavChange,
  onEnterFocus,
}: {
  /** 装两个翻页函数给外面用。箭头画在书旁边，见 JSX 里那段注释 */
  navApi?: React.MutableRefObject<BookNavApi | null>;
  /** 还能不能往前/往后翻。翻到头的那一侧箭头就不该渲染 */
  onNavChange?: (state: { canPrev: boolean; canNext: boolean }) => void;
  /** 按下播放键、行动真的起来了。外面用它把书合上，让位给专注模式 */
  onEnterFocus?: () => void;
} = {}) {
  /*
   * 数据全部来自游戏（`useDiaryData`）：左页是 `actionEntries`，
   * 右页是 `dayFacts`。原稿自带的 INITIAL_TASKS 只在观察台里还有用。
   */
  const diary = useDiaryData();
  const tasks = diary.tasks;
  const [weathers, setWeathers] = useState<Record<string, string>>({});
  /**
   * 翻过之后停在第几页（左页的序号）。`null` = 还没翻过。
   *
   * 不初始化成 0：书是从今天那一跨页打开的（`initialStartPage`），而今天
   * 是最后一跨，右边本来就没有下一页了。初值给 0 的话，第一眼会看到一枚
   * 点了没反应的右箭头，直到你翻一次它才想起来自己在末页。
   */
  const [flippedTo, setFlippedTo] = useState<number | null>(null);
  /** 鼠标正压在哪个页角上（null = 不在角上）。只用来切光标和判定点击 */
  const [corner, setCorner] = useState<'prev' | 'next' | null>(null);
  const bookRef = useRef<any>(null);

  /*
   * 书签上那个数字：原稿是 `reward` 累加出来的分数。游戏里**没有分数**
   * ——回报是开箱开出来的东西。改成显示**今天做完了几件**：那是这本
   * 日记真正在数的东西，而且和上面奖励条的圆点是同一个数。
   */
  const score = tasks.filter((t) => t.completed && t.date === diary.todayId).length;

  /*
   * 日期序列**锚在游戏的世界日上**（`YYYY-MM-DD` 直接解析），不是挂钟。
   * 理由同上：分界时刻之前挂钟已经翻页，游戏还没有。
   */
  const [ty, tm, td] = diary.todayId.split('-').map(Number);
  /*
   * 日期序列：开启日记那天 → 今天（原稿是写死的"过去 7 天"）。
   * `startedOn` 在未来（时钟倒拨过）时退化成只有今天——max(0) 兜底。
   */
  const [oy, om, od] = diary.startedOn.split('-').map(Number);
  const startDate = new Date(oy, om - 1, od);
  const todayDate = new Date(ty, tm - 1, td);
  const spanDays = Math.min(
    MAX_PAST_DAYS,
    Math.max(0, Math.round((todayDate.getTime() - startDate.getTime()) / 86_400_000)),
  );
  const dates = Array.from({ length: spanDays + 1 }, (_, i) => {
    const d = new Date(ty, tm - 1, td);
    d.setDate(d.getDate() - (spanDays - i));
    return d;
  });

  const jumpToToday = () => {
    if (bookRef.current && bookRef.current.pageFlip()) {
      let todayIdx = dates.findIndex(d => getLocalYYYYMMDD(d) === diary.todayId);
      if (todayIdx === -1) todayIdx = 0;
      bookRef.current.pageFlip().turnToPage(todayIdx * 2 + 2);
    }
  };

  const pages = [
    <InsideCoverPage key="inside-cover" />,
    <TitlePage key="title-page" />
  ];
  
  dates.forEach((date, i) => {
    const dateStr = getLocalYYYYMMDD(date);
    const isToday = dateStr === diary.todayId;

    pages.push(
      <Page key={`plan-${i}`} isRight={false}>
        <LeftPageContent 
          date={date} 
          dateStr={dateStr} 
          isToday={isToday} 
          tasks={tasks} 
          diary={diary} 
          onEnterFocus={onEnterFocus}
          jumpToToday={jumpToToday}
          weather={weathers[dateStr] || '☀️'}
          setWeather={(w) => setWeathers({ ...weathers, [dateStr]: w })}
        />
      </Page>
    );
    pages.push(
      <Page key={`log-${i}`} isRight={true}>
        <RightPageContent 
          dateStr={dateStr} 
          tasks={tasks} 
          diary={diary} 
        />
      </Page>
    );
  });

  /*
   * **打开时永远停在今天那一跨页。**
   *
   * 历史照样记着（往回翻就是），但每次翻开落在今天——日记本被打开的
   * 目的十有八九是"记今天这一笔"，不是"看上周三"。`startPage` 只在挂载
   * 那一刻读，而这块面板关掉就卸载（Modal 播完 exit 才收），所以下次
   * 打开会重新算一次：即使上次翻到了三天前，也是从今天重新开始。
   */
  let initialTodayIndex = dates.findIndex(d => getLocalYYYYMMDD(d) === diary.todayId);
  if (initialTodayIndex === -1) initialTodayIndex = dates.length - 1;
  const initialStartPage = (initialTodayIndex * 2) + 2;
  const pageIndex = flippedTo ?? initialStartPage;

  /*
   * 把"翻页"这件事交给外面。
   *
   * 箭头画在书旁边（见上面那段），但只有这儿拿得到 `bookRef`。给一个
   * ref 装两个函数、再回调一次"还能往哪边翻"，比把 `bookRef` 整个漏出去
   * 好：外面只能翻页，翻不了别的。
   */
  useEffect(() => {
    if (!navApi) return;
    navApi.current = {
      prev: () => bookRef.current?.pageFlip()?.flipPrev(),
      next: () => bookRef.current?.pageFlip()?.flipNext(),
    };
    return () => {
      navApi.current = null;
    };
  }, [navApi]);

  const pageCount = pages.length;
  useEffect(() => {
    onNavChange?.({ canPrev: pageIndex > 0, canNext: pageIndex < pageCount - 2 });
  }, [onNavChange, pageIndex, pageCount]);

  return (
    /*
     * 根节点原来带一块 `bg-[#E8F5E9]` 的绿桌面 + 圆点纹理——那是它作为
     * 独立 app 时的桌布。装进游戏的 modal 里要去掉：底下是玩家的屋子，
     * 铺一层不透明绿等于把游戏整个盖住（上一版就是那样）。
     * 圆点纹理跟着一起去掉，它是那块桌布的一部分。
     */
    <div className="h-full w-full flex flex-col items-center justify-center font-sans selection:bg-[#FFD54F]/40 relative">

      {/*
        奖励条**搬到 `Components/Diary/TodayRewards` 去了**。
        它讲的不是这一页的事而是"今天"的事（翻到上周三那页它照样报今天
        还剩几格），所以不该和书共用一次入场——现在书先绽开，它再从
        上方落下来淡入。
      */}

      {/*
        原来这儿是 Book Cover Container：一块 `bg-[#81C784]` +
        `border-[8px] border-[#A5D6A7]` + `rounded-[36px]` 的绿封面。

        **它整个搬到 `Modal` 上去了。** 装进游戏之后外面已经有一层面板
        外壳，书再自带一层封面，屏幕上就是**两圈边框套着**——一圈是"面板"
        一圈是"书"，读起来像给书又配了个相框。

        修法不是把外面那圈调细，是让**外面那圈就是封面**：Modal 的同心
        三层（窄边 / 中间色 / 内胆）正好对上书的三层（#A5D6A7 描边 /
        #81C784 封面 / 封面里那片绿），配色和 36px 圆角由 `DiaryPanel`
        传进去。于是绽开转场撑开的那个东西本身就是这本书的封面——
        书页直接落在里面，中间不再隔一层。

        代价：原来那道 `shadow-[0_24px_0_#4CAF50]` 的硬投影没了。它是
        "一本书摆在桌上"的立体感，而现在书铺满整屏，底下没有桌子可投，
        投影只会变成一条贴着屏幕边的绿杠。
      */}
      <div className="w-full h-full relative flex items-center justify-center z-10">
        
        {/*
          翻页控件**不在这儿**，在 `DiaryPanel` 里、书的旁边（`Modal` 的
          `overlay` 层）。

          原稿是左右上角两个 15%×20% 的隐形方块：鼠标扫过整本书都变不成
          手型，`disableFlipByClick` 又是 true，"这本书怎么翻"没有任何提示。
          改成两侧整条边当热区试过一版，翻页是好用了，但热区 10% 宽正好
          压住左页的勾选框和右页的删除键——而书页容器自带 stacking context，
          里面标 `z-50` 的按钮也出不去，箭头永远赢。数据一填满，"点完成"
          就会变成"翻页"，还不报错。

          这个尺寸下没有两全的宽度：躲开内容要窄到 27px，那又跌破命中区
          下限。所以让它离开书页——书是高度受限的，左右本来就空着近百像素，
          箭头站那儿既不抢点击，也不用跟着 0.42 的缩放一起变小。
        */}
        
        {/* Cute Bookmark */}
        <div 
          /*
            原稿是 `top-[-24px]`——有 24px 探出封面外沿，像一条夹在书里
            露出头的书签带。现在封面就是屏幕边，探出去的部分会被裁掉，
            剩下一截平口反而看着像断了。改成 `top-0`：从书页区顶端垂下来，
            落在书脊左边一点，不夹在正中——夹在正中时它一半压着左页一半压着
            右页，还正好挤住右页标题那枚圆图标，看着像卡在缝里。整条挪到
            左页那侧，就是"从左页里探出来的一条书签带"。

            **z 要压过书页（`z-20`）**。原稿是 `z-10`，那时它露在封面外面，
            谁在上面无所谓；挪进来之后书页会把它盖掉，只剩顶上那几像素
            露头——看着像块没渲染完的色块。真书签本来就是搭在纸面上的。

            宽度 80 收到 60：书签居中骑在书脊上，右边缘原来落在 x=560，而
            右页 "Memories" 那枚圆图标从 x=552 起（书脊 520 + `px-8`），
            压着图标左边那道弧 8px。原稿封面宽、书签探在封面外面，这 8px
            看不出来；现在书签整个落在纸面上，就成了两个圆挤在一起。
            收到 60 之后右边缘 550，比图标左沿还退进去 2px——留一点余量，
            收到 68（右边缘 554）其实还压着 2px，只是小到看不出来而已。
          */
          className="absolute top-0 left-[50%] -translate-x-[135%] w-[60px] h-[120px] bg-[#FF8A65] z-30 shadow-[0_8px_0_#F4511E] rounded-b-[40px] border-4 border-white flex flex-col items-center justify-end pb-5 text-white overflow-hidden"
        >
          {/* Bookmark polka dots */}
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(white 3px, transparent 3px)', backgroundSize: '16px 16px' }} />
          <Star className="w-8 h-8 fill-white text-white mb-1 relative z-20 drop-shadow-md" />
          <AnimatePresence mode="popLayout">
            <motion.span 
              key={score}
              initial={{ scale: 0.5, opacity: 0, y: -10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="text-[20px] font-black font-['Nunito'] tracking-tight relative z-20 drop-shadow-md"
            >
              {score}
            </motion.span>
          </AnimatePresence>
        </div>

        {/*
          书脊阴影。

          `top-5 bottom-5` 不是 `top-0 bottom-0`：书页那层是 `h-[95%]` 而且被
          `max-h-[720px]` 卡住，在 760 高的画布里上下各让出 20px。书脊照满高
          铺的话，两端的 `rounded-full` 圆头会探到书页外面的封面上——原稿里
          封面又厚又有落地投影，这一截看不出来；封面收窄到贴着书页之后，
          它就成了书底下冒出来的一个深绿色圆疙瘩。

          `top-6` 而不是刚好齐平的 `top-5`：齐平时亚像素舍入还会漏出一两个
          像素的圆头。这条本来就在书页**后面**（`z-0`），整条藏进去正好——
          它对画面的贡献只有"漏出来的那截"，而那截现在是负贡献。
        */}
        <div className="absolute top-6 bottom-6 left-1/2 -translate-x-1/2 w-12 bg-[#4CAF50] shadow-[inset_0_0_20px_rgba(0,0,0,0.2)] z-0 rounded-full" />

        {/*
          React PageFlip Book

          `onMouseMove` 那一段是给**页角**用的：page-flip 自己在四个角支持
          拖拽翻页（鼠标移过去会卷起一个角），但它不改光标，所以没人知道
          那儿能动——只有先看见卷角的人才会去试。

          光标不能用一层透明 div 盖上去解决：盖上去 page-flip 就收不到
          mousemove，卷角预览跟着没了。所以在外层监听、算出在不在角上，
          只改 `cursor`——事件照常往下走，卷角还在。顺手让点一下也能翻，
          不然光标说"能点"、点了没反应，等于换一种方式骗人。

          角的尺寸（宽 10% / 高 14%）是量过的：设计坐标下最靠上的可点元素
          在 y=126（天气图标 x≥199），右上角的「补录」在 x=908,y=159，
          四个角 100×106 的方块里一个可点元素都没有。
        */}
        <div
          className="w-[96%] h-[95%] max-w-[1000px] max-h-[720px] relative z-20"
          style={{ perspective: '2000px', cursor: corner ? 'pointer' : undefined }}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            const nearSide = x < r.width * 0.10 || x > r.width * 0.90;
            const nearEnd = y < r.height * 0.14 || y > r.height * 0.86;
            setCorner(nearSide && nearEnd ? (x < r.width / 2 ? 'prev' : 'next') : null);
          }}
          onMouseLeave={() => setCorner(null)}
          onClick={() => {
            if (corner === 'prev') bookRef.current?.pageFlip()?.flipPrev();
            else if (corner === 'next') bookRef.current?.pageFlip()?.flipNext();
          }}
        >
          {/* @ts-ignore */}
          <HTMLFlipBook
            width={500}
            height={720}
            size="stretch"
            minWidth={300}
            maxWidth={500}
            minHeight={400}
            maxHeight={720}
            maxShadowOpacity={0.2}
            showCover={false}
            mobileScrollSupport={true}
            useMouseEvents={true}
            clickEventForward={true}
            disableFlipByClick={true}
            className="flip-book"
            ref={bookRef}
            startPage={initialStartPage}
            onFlip={(e: { data: number }) => setFlippedTo(e.data)}
          >
            {pages}
          </HTMLFlipBook>
        </div>
      </div>
    </div>
  );
}
