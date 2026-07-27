import React, { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../Redux/store";
import { useLazyGetSystemListQuery } from "../../api/systemRtkApi";
import { setSelectedSystemId } from "../../Redux/Features/systemSlice";
import { getMemberSystems } from "./utils/systemRelationship";

// component
import Navbar from "../../Component/Navigation/Navbar";
import { useAuthModal } from "../../Features/Authentication/component/ModalAuthContext";
import { useAuthGate } from "../../hook/useAuthGate";
import { useGetApiTokenStatusQuery } from "../../api/apiTokenApi";

const SELECTED_SYSTEM_STORAGE_KEY = "timeplan:selectedSystemId";

const readStoredSelectedSystemId = () => {
    try {
        return window.localStorage.getItem(SELECTED_SYSTEM_STORAGE_KEY);
    } catch {
        return null;
    }
};

const writeStoredSelectedSystemId = (systemId: string) => {
    try {
        window.localStorage.setItem(SELECTED_SYSTEM_STORAGE_KEY, systemId);
    } catch {
        // Ignore storage failures; Redux remains the source of truth for this session.
    }
};

const clearStoredSelectedSystemId = () => {
    try {
        window.localStorage.removeItem(SELECTED_SYSTEM_STORAGE_KEY);
    } catch {
        // Ignore storage failures; Redux remains the source of truth for this session.
    }
};

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { profile } = useSelector((state: RootState) => state.profile);
    const systems = useSelector((state: RootState) => state.system.systems);
    const selectedSystemId = useSelector((state: RootState) => state.system.selectedSystemId);
    const { authReady, isLoggedIn } = useAuthGate();
    const dispatch = useDispatch();
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const {
        data: apiTokenStatus,
        isLoading: isApiTokenStatusLoading,
        isFetching: isApiTokenStatusFetching,
    } = useGetApiTokenStatusQuery(undefined, {
        skip: !authReady || !isLoggedIn,
    });

    const openedRef = React.useRef(false);
    const requestedSystemListRef = React.useRef(false);
    const { showAuthModal } = useAuthModal();

    useEffect(() => {
        if (!authReady || !isLoggedIn) {
            requestedSystemListRef.current = false;
            return;
        }
        if (systems.length > 0) return;
        if (requestedSystemListRef.current) return;

        requestedSystemListRef.current = true;
        triggerGetSystemList()
            .unwrap()
            .catch(() => {
                requestedSystemListRef.current = false;
            });
    }, [authReady, isLoggedIn, systems.length, triggerGetSystemList]);

    useEffect(() => {
        if (!authReady || !isLoggedIn) return;
        if (systems.length === 0) {
            clearStoredSelectedSystemId();
            if (selectedSystemId) {
                dispatch(setSelectedSystemId(null));
            }
            return;
        }

        const joinedSystems = getMemberSystems(systems, profile?._id);

        const selectedStillExists = Boolean(
            selectedSystemId && joinedSystems.some((system) => system._id === selectedSystemId)
        );
        if (selectedStillExists) {
            writeStoredSelectedSystemId(selectedSystemId!);
            return;
        }

        const storedSystemId = readStoredSelectedSystemId();
        const storedStillExists = storedSystemId && joinedSystems.some((system) => system._id === storedSystemId);
        const nextSystemId = storedStillExists ? storedSystemId : joinedSystems[0]?._id || null;
        if (nextSystemId) {
            writeStoredSelectedSystemId(nextSystemId);
        } else {
            clearStoredSelectedSystemId();
        }
        dispatch(setSelectedSystemId(nextSystemId));
    }, [authReady, isLoggedIn, systems, selectedSystemId, profile?._id, dispatch]);

    useEffect(() => {
        if (authReady && !isLoggedIn && !openedRef.current) {
            showAuthModal();
            openedRef.current = true;
        }
    }, [authReady, isLoggedIn, showAuthModal]);

    useEffect(() => {
        if (profile) openedRef.current = false;
    }, [profile]);

    useEffect(() => {
        if (!authReady || !isLoggedIn) return;
        if (!apiTokenStatus || apiTokenStatus.configured) return;
        const next = `${location.pathname}${location.search}`;
        navigate(`/apiToken?next=${encodeURIComponent(next)}`, { replace: true });
    }, [apiTokenStatus, authReady, isLoggedIn, location.pathname, location.search, navigate]);

    const shellBackground = 'rgb(var(--system-bg))';
    const shellText = 'rgb(var(--system-text))';
    const hudBackground = 'linear-gradient(180deg, rgb(var(--system-bg)) 0%, rgb(var(--system-shell)) 100%)';
    const hudBorder = '1px solid rgb(var(--system-line) / 0.36)';

    // ── Full-screen pixel game shell ──────────────────────────────────────────
    const renderContent = (children: React.ReactNode) => (
        <div
            className="flex flex-col w-screen h-screen overflow-hidden px-grid-bg"
            style={{ background: shellBackground, color: shellText }}
        >
            {/* ── Top HUD bar (static, not fixed) ── */}
            <div
                className="shrink-0 z-50"
                style={{
                    height: '52px',
                    background: hudBackground,
                    borderBottom: hudBorder,
                }}
            >
                <Navbar />
            </div>

            {/* ── Sidebar + Main content ── */}
            <main className="flex flex-1 overflow-hidden">
                {children}
            </main>
        </div>
    );

    // Loading skeleton
    if (!authReady || (isLoggedIn && (isApiTokenStatusLoading || isApiTokenStatusFetching))) {
        return renderContent(
            <div className="flex-1" style={{ background: 'var(--px-bg)' }} />
        );
    }

    // Not logged in
    if (!isLoggedIn) {
        return renderContent(
            <div className="flex flex-1 items-center justify-center">
                <div
                    className="px-panel p-10 text-center"
                    style={{ borderColor: 'var(--px-border-gold)' }}
                >
                    <div
                        className="text-xl font-bold mb-3"
                        style={{ color: 'var(--px-gold)', fontFamily: '"Press Start 2P", monospace', fontSize: '14px' }}
                    >
                        幻星纪元
                    </div>
                    <p style={{ color: 'var(--px-muted)' }}>请登入以接入控制台</p>
                </div>
            </div>
        );
    }

    return renderContent(
        <div
            id="px-content"
            className="flex-1 overflow-auto"
            style={{ background: shellBackground }}
        >
            <Outlet />
        </div>
    );
};

export default Dashboard;
