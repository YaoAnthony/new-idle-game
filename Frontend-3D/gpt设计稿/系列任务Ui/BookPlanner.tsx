import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Trash2, Plus, Play, Square, CalendarDays, BookOpen, Star, Leaf } from 'lucide-react';
import HTMLFlipBook from 'react-pageflip';
import type { Task } from '../types';

const getLocalYYYYMMDD = (d: Date) => {
  return d.toLocaleDateString('en-CA');
};

const INITIAL_TASKS: Task[] = [
  { id: '1', title: '散步抓虫子 🦋', completed: false, createdAt: Date.now(), durationMinutes: 30, reward: 300, date: getLocalYYYYMMDD(new Date()) },
  { id: '2', title: '浇花除草 🌷', completed: false, createdAt: Date.now() - 10000, durationMinutes: 45, reward: 450, date: getLocalYYYYMMDD(new Date()) },
  { id: '3', title: '和岛民打招呼 🐻', completed: true, createdAt: Date.now() - 20000, durationMinutes: 15, reward: 150, date: getLocalYYYYMMDD(new Date()) },
];

const MAX_TASKS = 10;

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// ------------------------------------------------------------------
// Interactive Area (Blocks native events for pageflip)
// ------------------------------------------------------------------

const InteractiveArea = ({ children, className }: any) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    const events = ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click'];
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

const LeftPageContent = ({ date, dateStr, isToday, tasks, setTasks, activeTimer, setActiveTimer, jumpToToday, weather, setWeather }) => {
  const [planTitle, setPlanTitle] = useState('');
  const [planDuration, setPlanDuration] = useState('30');
  
  const todayStr = getLocalYYYYMMDD(new Date());
  const isPast = dateStr < todayStr;
  
  const currentDayTasks = tasks.filter(t => t.date === dateStr);
  const activeTasks = currentDayTasks.filter((t) => !t.completed).sort((a, b) => b.createdAt - a.createdAt);
  
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = weekdays[date.getDay()];
  const dateDisplay = `${month}月${day}日 ${weekday}`;

  const handleAddPlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planTitle.trim() || currentDayTasks.length >= MAX_TASKS) return;
    const duration = parseInt(planDuration) || 30;
    
    setTasks((prev: Task[]) => [{
      id: crypto.randomUUID(),
      title: planTitle.trim(),
      completed: false,
      createdAt: Date.now(),
      durationMinutes: duration,
      reward: duration * 10,
      date: dateStr
    }, ...prev]);
    setPlanTitle('');
  };

  const completeTask = (id: string) => {
    setTasks((prev: Task[]) =>
      prev.map((t) =>
        t.id === id ? { ...t, completed: true, createdAt: Date.now() } : t
      )
    );
    setActiveTimer((prev: any) => (prev?.id === id ? null : prev));
  };

  const toggleTimer = (task: Task) => {
    if (activeTimer?.id === task.id) {
      setActiveTimer(null);
    } else {
      setActiveTimer({ id: task.id, remaining: task.durationMinutes * 60 });
    }
  };

  const deleteTask = (id: string) => {
    setTasks((prev: Task[]) => prev.filter((t) => t.id !== id));
    setActiveTimer((prev: any) => (prev?.id === id ? null : prev));
  };

  const maxRows = 7;

  return (
    <div className="flex-1 relative pt-12 pb-10 px-8 flex flex-col h-full font-['Nunito',sans-serif]">
      <InteractiveArea className="mb-4 flex flex-col border-b-[4px] border-[#FFE082]/60 border-dashed pb-4 relative">
        <div className="flex justify-between items-baseline w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FFE082] flex items-center justify-center shadow-[0_4px_0_#FFCA28]">
               <CalendarDays className="w-5 h-5 text-[#5D4037]" strokeWidth={3} />
            </div>
            <h1 className="text-[28px] font-black text-[#795548] tracking-wide">Daily Plan</h1>
          </div>
        </div>
        
        <div className="flex justify-between items-center mt-3 pl-2">
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
          
          {!isToday && (
            <button
              onClick={jumpToToday}
              className="text-white bg-[#FF8A65] hover:bg-[#FF7043] px-3 py-1 rounded-full text-[13px] font-black tracking-wide uppercase transition-transform active:scale-95 shadow-[0_3px_0_#F4511E]"
            >
              Today!
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
          <form onSubmit={handleAddPlan} className={`flex items-center h-[64px] bg-white rounded-[20px] mb-3 border-2 border-[#EEEEEE] px-3 shadow-[0_4px_12px_rgba(0,0,0,0.03)] group ${currentDayTasks.length >= MAX_TASKS ? 'opacity-50' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-[#E0F2E9] flex items-center justify-center mr-2 text-[#4DB6AC]">
              <Plus className="w-[20px] h-[20px]" strokeWidth={3.5} />
            </div>
            <input
              type="text"
              placeholder={currentDayTasks.length >= MAX_TASKS ? "口袋已满！" : "今天要去做什么呢？"}
              disabled={currentDayTasks.length >= MAX_TASKS}
              className="flex-1 bg-transparent border-none outline-none text-[17px] font-bold text-[#5D4037] placeholder:text-[#BCAAA4]"
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
            />
            
            <div className="flex items-center bg-[#FFF8E1] rounded-full px-3 py-1.5 mr-2 border-2 border-[#FFE082]">
              <input
                type="number"
                disabled={currentDayTasks.length >= MAX_TASKS}
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
              disabled={!planTitle.trim() || currentDayTasks.length >= MAX_TASKS}
              className="px-4 py-[8px] bg-[#4DB6AC] text-white rounded-full text-[15px] font-black tracking-widest disabled:opacity-30 hover:bg-[#26A69A] shadow-[0_4px_0_#00897B] active:shadow-[0_0px_0_#00897B] active:translate-y-[4px] transition-all cursor-pointer relative z-50"
            >
              添加
            </button>
          </form>
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
              <button
                onClick={() => !isPast && completeTask(task.id)}
                className={`w-[28px] h-[28px] rounded-full border-4 border-[#BCAAA4] mr-3 flex-shrink-0 flex items-center justify-center shadow-sm relative overflow-hidden z-50 ${isPast ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#4DB6AC] hover:bg-[#E0F2E9] cursor-pointer transition-colors'}`}
              >
              </button>
              <span className="flex-1 text-[17px] font-bold text-[#5D4037] truncate pt-[2px]">{task.title}</span>
              
              {activeTimer?.id === task.id ? (
                <div className="px-3 py-1 rounded-full bg-[#FFEBEE] border-2 border-[#EF9A9A] mr-3 shadow-[inset_0_-2px_0_rgba(0,0,0,0.05)]">
                  <span className="text-[#D32F2F] font-black text-[15px] tracking-tight">
                    {formatTime(activeTimer.remaining)}
                  </span>
                </div>
              ) : (
                <span className="text-[#8D6E63] font-bold text-[14px] mr-3 bg-[#F5F5F5] px-3 py-1 rounded-full shadow-[inset_0_-2px_0_#E0E0E0]">
                  {task.durationMinutes} min
                </span>
              )}

              {!isPast && (
                <button 
                  onClick={() => toggleTimer(task)}
                  className={`w-[36px] h-[36px] rounded-full flex items-center justify-center transition-all mr-2 flex-shrink-0 cursor-pointer z-50 ${
                    activeTimer?.id === task.id 
                      ? 'bg-[#E53935] hover:bg-[#C62828] text-white shadow-[0_4px_0_#B71C1C] active:shadow-none active:translate-y-[4px]' 
                      : 'bg-[#FFCA28] hover:bg-[#FFB300] text-white shadow-[0_4px_0_#FF8F00] active:shadow-none active:translate-y-[4px]'
                  }`}
                >
                  {activeTimer?.id === task.id ? (
                    <Square className="w-[16px] h-[16px] fill-current" strokeWidth={3} />
                  ) : (
                    <Play className="w-[16px] h-[16px] ml-[3px] fill-current" strokeWidth={3} />
                  )}
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

const RightPageContent = ({ date, dateStr, tasks, setTasks }) => {
  const [logTitle, setLogTitle] = useState('');
  const [logDuration, setLogDuration] = useState('30');
  
  const todayStr = getLocalYYYYMMDD(new Date());
  const isPast = dateStr < todayStr;
  
  const currentDayTasks = tasks.filter(t => t.date === dateStr);
  const completedTasks = currentDayTasks.filter((t) => t.completed).sort((a, b) => b.createdAt - a.createdAt);

  const handleAddLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!logTitle.trim() || currentDayTasks.length >= MAX_TASKS) return;
    const duration = parseInt(logDuration) || 30;
    
    setTasks((prev: Task[]) => [{
      id: crypto.randomUUID(),
      title: logTitle.trim(),
      completed: true,
      createdAt: Date.now(),
      durationMinutes: duration,
      reward: duration * 10,
      date: dateStr
    }, ...prev]);
    setLogTitle('');
  };

  const deleteTask = (id: string) => {
    setTasks((prev: Task[]) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="flex-1 relative pt-12 pb-10 px-8 flex flex-col h-full font-['Nunito',sans-serif]">
      <InteractiveArea className="mb-4 flex flex-col pb-4 border-b-[4px] border-[#FFE082]/60 border-dashed">
        <div className="flex items-center gap-3 w-full">
          <div className="w-10 h-10 rounded-full bg-[#A5D6A7] flex items-center justify-center shadow-[0_4px_0_#81C784]">
             <Star className="w-5 h-5 text-white fill-white" strokeWidth={2} />
          </div>
          <h1 className="text-[28px] font-black text-[#795548] tracking-wide">Memories</h1>
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
          <form onSubmit={handleAddLog} className={`flex items-center h-[64px] bg-white rounded-[20px] mb-3 border-2 border-[#EEEEEE] px-3 shadow-[0_4px_12px_rgba(0,0,0,0.03)] group ${currentDayTasks.length >= MAX_TASKS ? 'opacity-50' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-[#FFF3E0] flex items-center justify-center mr-2 text-[#FF8A65]">
              <Check className="w-[20px] h-[20px]" strokeWidth={3.5} />
            </div>
            <input
              type="text"
              placeholder={currentDayTasks.length >= MAX_TASKS ? "配额已满！" : "记录已完成的成就..."}
              disabled={currentDayTasks.length >= MAX_TASKS}
              className="flex-1 bg-transparent border-none outline-none text-[17px] font-bold text-[#5D4037] placeholder:text-[#BCAAA4]"
              value={logTitle}
              onChange={(e) => setLogTitle(e.target.value)}
            />
            
            <div className="flex items-center bg-[#FFF8E1] rounded-full px-3 py-1.5 mr-2 border-2 border-[#FFE082]">
              <input
                type="number"
                disabled={currentDayTasks.length >= MAX_TASKS}
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
              disabled={!logTitle.trim() || currentDayTasks.length >= MAX_TASKS}
              className="px-4 py-[8px] bg-[#FF8A65] text-white rounded-full text-[15px] font-black tracking-widest disabled:opacity-30 hover:bg-[#FF7043] shadow-[0_4px_0_#F4511E] active:shadow-[0_0px_0_#F4511E] active:translate-y-[4px] transition-all cursor-pointer relative z-50"
            >
              补录
            </button>
          </form>
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
              
              <div className="flex items-center bg-[#FFF8E1] border-2 border-[#FFE082] px-3 py-1 rounded-full mr-2 shadow-[inset_0_-2px_0_rgba(255,202,40,0.5)]">
                <span className="text-[#F57F17] font-black text-[14px] mr-1">
                  +{task.reward}
                </span>
                <Star className="w-4 h-4 fill-[#F57F17] text-[#F57F17]" />
              </div>

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

const InsideCoverPage = React.forwardRef<HTMLDivElement, any>((props, ref) => {
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

const TitlePage = React.forwardRef<HTMLDivElement, any>((props, ref) => {
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

const APP_START_DATE = new Date('2026-08-27T00:00:00');

export default function BookPlanner() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [weathers, setWeathers] = useState<Record<string, string>>({});
  const [activeTimer, setActiveTimer] = useState<{ id: string, remaining: number } | null>(null);
  const bookRef = useRef<any>(null);

  const score = tasks.reduce((acc, t) => t.completed ? acc + t.reward : acc, 0);

  useEffect(() => {
    let interval: number;
    if (activeTimer && activeTimer.remaining > 0) {
      interval = window.setInterval(() => {
        setActiveTimer((prev) => {
          if (!prev) return null;
          if (prev.remaining <= 1) {
            setTasks((prevTasks) =>
              prevTasks.map((t) =>
                t.id === prev.id ? { ...t, completed: true, createdAt: Date.now() } : t
              )
            );
            return null;
          }
          return { ...prev, remaining: prev.remaining - 1 };
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeTimer]);

  const NUM_DAYS = 31;
  
  const dates = Array.from({ length: NUM_DAYS }, (_, i) => {
    const d = new Date(APP_START_DATE);
    d.setDate(d.getDate() + i);
    return d;
  });

  const jumpToToday = () => {
    if (bookRef.current && bookRef.current.pageFlip()) {
      const todayStr = getLocalYYYYMMDD(new Date());
      let todayIdx = dates.findIndex(d => getLocalYYYYMMDD(d) === todayStr);
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
    const isToday = dateStr === getLocalYYYYMMDD(new Date());

    pages.push(
      <Page key={`plan-${i}`} isRight={false}>
        <LeftPageContent 
          date={date} 
          dateStr={dateStr} 
          isToday={isToday} 
          tasks={tasks} 
          setTasks={setTasks} 
          activeTimer={activeTimer} 
          setActiveTimer={setActiveTimer}
          jumpToToday={jumpToToday}
          weather={weathers[dateStr] || '☀️'}
          setWeather={(w) => setWeathers({ ...weathers, [dateStr]: w })}
        />
      </Page>
    );
    pages.push(
      <Page key={`log-${i}`} isRight={true}>
        <RightPageContent 
          date={date} 
          dateStr={dateStr} 
          tasks={tasks} 
          setTasks={setTasks} 
        />
      </Page>
    );
  });

  const todayStr = getLocalYYYYMMDD(new Date());
  let initialTodayIndex = dates.findIndex(d => getLocalYYYYMMDD(d) === todayStr);
  if (initialTodayIndex === -1) initialTodayIndex = 0;
  const initialStartPage = (initialTodayIndex * 2) + 2;

  const todayTasks = tasks.filter(t => t.date === todayStr);
  const todayCompletedTasks = todayTasks.filter(t => t.completed).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 font-sans selection:bg-[#FFD54F]/40 relative overflow-hidden bg-[#E8F5E9]">
      {/* Background cute pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-50"
           style={{ backgroundImage: 'radial-gradient(#C8E6C9 4px, transparent 4px)', backgroundSize: '40px 40px' }} />

      {/* Today's Rewards Top Bar */}
      <div className="w-full max-w-[800px] z-10 mb-8 bg-[#FFF8E1] border-4 border-[#FFE082] p-4 rounded-[32px] shadow-[0_8px_0_#FFE082,0_20px_30px_rgba(0,0,0,0.1)] relative">
        <div className="flex justify-between items-center mb-2 px-2 relative z-10">
          <span className="text-[#F57F17] text-[18px] font-black tracking-widest flex items-center gap-2">
            <Star className="w-6 h-6 fill-[#F57F17] text-[#F57F17]" />
            TODAY'S REWARDS
          </span>
          <span className="text-white text-[15px] font-black bg-[#F57F17] px-4 py-1.5 rounded-full shadow-[0_3px_0_#E65100]">
            Left: {MAX_TASKS - todayCompletedTasks.length}
          </span>
        </div>
        <div className="flex justify-between px-3 relative z-10 mt-4 mb-1 gap-2">
          {[...Array(MAX_TASKS)].map((_, i) => {
            const isCompleted = i < todayCompletedTasks.length;
            const isPlanned = !isCompleted && i < todayTasks.length;
            return (
              <div key={i} className={`flex-1 aspect-square max-w-[48px] rounded-full border-4 ${isCompleted ? 'border-[#F57F17] bg-[#FFF3E0]' : isPlanned ? 'border-dashed border-[#FFB74D] bg-transparent' : 'border-[#FFECB3] bg-white'} shadow-[inset_0_-3px_0_rgba(0,0,0,0.05)] flex items-center justify-center relative`}>
                {isCompleted && (
                  <motion.div 
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', bounce: 0.6 }}
                  >
                    <Star className="w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] fill-[#F57F17] text-[#F57F17]" />
                  </motion.div>
                )}
                {isPlanned && (
                  <div className="w-[12px] h-[12px] rounded-full bg-[#FFB74D]/50" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Book Cover Container */}
      <div className="w-full max-w-[1040px] aspect-[1.38] md:h-[760px] md:aspect-auto bg-[#81C784] rounded-[36px] shadow-[0_24px_0_#4CAF50,0_40px_60px_rgba(0,0,0,0.15)] border-[8px] border-[#A5D6A7] relative flex items-center justify-center z-10">
        
        {/* Invisible Click Zones for Navigation */}
        <button 
          onClick={() => bookRef.current?.pageFlip()?.flipPrev()}
          className="absolute top-0 left-0 w-[15%] h-[20%] z-50 cursor-pointer outline-none"
          aria-label="Previous Page"
        />

        <button 
          onClick={() => bookRef.current?.pageFlip()?.flipNext()}
          className="absolute top-0 right-0 w-[15%] h-[20%] z-50 cursor-pointer outline-none"
          aria-label="Next Page"
        />
        
        {/* Cute Bookmark */}
        <div 
          className="absolute top-[-24px] left-[50%] -translate-x-1/2 w-[80px] h-[120px] bg-[#FF8A65] z-10 shadow-[0_8px_0_#F4511E] rounded-b-[40px] border-4 border-white flex flex-col items-center justify-end pb-5 text-white overflow-hidden"
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

        {/* Inner book spine shadow */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-12 bg-[#4CAF50] shadow-[inset_0_0_20px_rgba(0,0,0,0.2)] z-0 rounded-full" />

        {/* React PageFlip Book */}
        <div className="w-[96%] h-[95%] max-w-[1000px] max-h-[720px] relative z-20" style={{ perspective: '2000px' }}>
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
          >
            {pages}
          </HTMLFlipBook>
        </div>
      </div>
    </div>
  );
}
