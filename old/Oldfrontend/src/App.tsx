//react
import { lazy, Suspense, useEffect, useLayoutEffect } from 'react'

//react route dom
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'

//api
import { useGetProfileAndUserQuery } from "./api/profileApi";
import { useSelector } from 'react-redux';
import type { RootState } from './Redux/store';
import i18n, { resolveLanguage } from './i18n';
//motion
import { AnimatePresence } from 'motion/react';

const MainPage = lazy(() => import('./Pages/MainPage'));
const Dashboard = lazy(() => import('./Pages/Dashboard'));
const APIToken = lazy(() => import('./Pages/APIToken'));


const Setting = lazy(() => import('./Pages/Dashboard/component/Setting'));
const NPCData = lazy(() => import('./Pages/Dashboard/component/NPCData'));
const SystemRouter = lazy(() => import('./Pages/Dashboard/component/SystemRouter'));
const SystemLottery = lazy(() => import('./Pages/Dashboard/component/SystemLottery'));
const GameSettings = lazy(() => import('./Pages/Dashboard/component/GameSettings'));
const Billing = lazy(() => import('./Pages/Dashboard/component/Billing'));
const SystemIdleGame = lazy(() => import('./Pages/Dashboard/component/SystemIdleGame'));
const StorylineEditor = lazy(() => import('./Pages/Dashboard/component/StorylineEditor'));


const LoginRegisterPage = lazy(() => import('./Features/Authentication/pages/LoginRegisterPage'));
const GithubCallback = lazy(() => import('./Features/Authentication/pages/GithubCallback'));
const LoginCallBackPage = lazy(() => import('./Features/Authentication/pages/LoginCallBackPage'));

// theme
import { useThemeSync } from './hook/useThemeSync';

// Scroll to the top of the page when the location changes
function ScrollToTop() {
    const location = useLocation();

    useLayoutEffect(() => {
        // Scroll to the top of the page when the location changes
        window.scrollTo(0, 0);
    }, [location]);

  // Return null as this component doesn't render anything
  return null;
}

function I18nLanguageSync() {
    const uiLanguage = useSelector((state: RootState) => state.game.settings.uiLanguage);

    useEffect(() => {
        const nextLanguage = resolveLanguage(uiLanguage);
        if (i18n.language !== nextLanguage) {
            void i18n.changeLanguage(nextLanguage);
        }
    }, [uiLanguage]);

    return null;
}

const App = () => {
    const location = useLocation();

    // 处理主题
    useThemeSync();
    
    useGetProfileAndUserQuery();
    
    return (
        
        <div className="relative w-full min-h-screen">
            <I18nLanguageSync />
            <ScrollToTop />
            
            <AnimatePresence mode="wait">
                <Suspense fallback={null}>
                <Routes location={location} key={location.pathname}>
                    <Route path="/" element={<MainPage />} />
                    <Route path="/apiToken" element={<APIToken />} />

                    <Route path="/login-callback/*" element={<LoginCallBackPage />} />
                    <Route path="/login/*" element={<LoginRegisterPage />} />

                    <Route path="/github-callback" element={<GithubCallback />} />

                    {/* Dashborad */}
                    <Route path="/dashboard" element={<Dashboard />} >
                        <Route index element={<Navigate to="idle-game" />} />
                        <Route path="tasks" element={<Navigate to="/dashboard/idle-game" replace />} />
                        <Route path="daily-quests" element={<Navigate to="/dashboard/idle-game" replace />} />
                        <Route path="setting" element={<Navigate to="/dashboard/setting/my" replace />} />
                        <Route path="setting/my" element={<Setting />} />
                        <Route path="game-settings" element={<GameSettings />} />
                        <Route path="npc-data" element={<NPCData />} />
                        <Route path="idle-game" element={<SystemIdleGame />} />
                        <Route path="storyline-editor" element={<StorylineEditor />} />
                        <Route path="system/:systemId" element={<SystemRouter />}>
                            <Route index element={<Navigate to="/dashboard/idle-game" replace />} />
                            <Route path="lottery" element={<SystemLottery />} />
                        </Route>
                        
                        <Route path="overview" element={<Navigate to="/dashboard/idle-game" replace />} />
                        <Route path="billing" element={<Billing />} />
                        <Route path="teams" element={<Navigate to="/dashboard/idle-game" replace />} />
                    </Route>
                </Routes>
                </Suspense>
            </AnimatePresence>
        </div>
        
    );
}


export default App;
