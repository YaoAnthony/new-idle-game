import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import Navbar from "../../../Component/Navigation/Navbar";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../../Redux/store";
import { setToken } from "../../../Redux/Features/userSlice";
import { getEnv } from "../../../config/env";

const OAUTH_CTX_KEY = "defuze.oauth.loginContext";

const LoginCallBackPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch();
    const [count, setCount] = useState(3);
    const [isRecovering, setIsRecovering] = useState(false);
    const [recoveredAccessToken, setRecoveredAccessToken] = useState<string | null>(null);
    const [hasTriedRecover, setHasTriedRecover] = useState(false);
    const reduxAccessToken = useSelector((state: RootState) => state.user.accessToken);
    const { backendUrl } = getEnv();

    const { redirectUri, state, routeAccessToken } = useMemo(() => {
        const raw = location.state as { redirectUri?: string; state?: string; accessToken?: string } | null;

        let storedRedirectUri: string | undefined;
        let storedState: string | undefined;
        try {
            const storedRaw = sessionStorage.getItem(OAUTH_CTX_KEY);
            if (storedRaw) {
                const stored = JSON.parse(storedRaw) as { redirectUri?: string; state?: string };
                storedRedirectUri = stored.redirectUri;
                storedState = stored.state;
            }
        } catch {
            storedRedirectUri = undefined;
            storedState = undefined;
        }

        return {
            redirectUri: raw?.redirectUri ?? storedRedirectUri,
            state: raw?.state ?? storedState,
            routeAccessToken: raw?.accessToken,
        };
    }, [location.state]);

    const accessToken = routeAccessToken ?? reduxAccessToken ?? recoveredAccessToken;

    useEffect(() => {
        const shouldRecover =
            typeof redirectUri === "string" &&
            redirectUri.length > 0 &&
            !accessToken &&
            !isRecovering &&
            !hasTriedRecover;

        if (!shouldRecover) return;

        const recover = async () => {
            try {
                setIsRecovering(true);
                setHasTriedRecover(true);

                const response = await fetch(`${backendUrl}/auth/refresh`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                });

                if (!response.ok) return;

                const data = (await response.json()) as { accessToken?: string; expiresAt?: number };
                if (!data.accessToken) return;

                setRecoveredAccessToken(data.accessToken);
                dispatch(
                    setToken({
                        accessToken: data.accessToken,
                        expiresAt: data.expiresAt ?? Date.now() + 15 * 60 * 1000,
                    }),
                );
            } finally {
                setIsRecovering(false);
            }
        };

        void recover();
    }, [redirectUri, accessToken, isRecovering, hasTriedRecover, backendUrl, dispatch]);

    useEffect(() => {
        if (typeof redirectUri === "string" && accessToken) {
            // 把 accessToken 作为 code 回传给 application
            if (redirectUri.startsWith("vscode://") || redirectUri.startsWith("http://localhost:4000/callback")) {
                const separator = redirectUri.includes("?") ? "&" : "?";
                const target = `${redirectUri}${separator}code=${encodeURIComponent(accessToken)}&state=${encodeURIComponent(state ?? "")}`;

                window.location.href = target;

                sessionStorage.removeItem(OAUTH_CTX_KEY);
                return;
            }
        }
    }, [redirectUri, state, accessToken]);

    useEffect(() => {
        if (typeof redirectUri === "string" && redirectUri.length > 0) {
            return;
        }

        const timer = setInterval(() => {
            setCount((prev) => prev - 1);
        }, 1000);

        const redirect = setTimeout(() => {
            navigate("/dashboard/idle-game");
        }, 3000);

        return () => {
            clearInterval(timer);
            clearTimeout(redirect);
        };
    }, [navigate, redirectUri]);

    return (
        <main className="relative min-h-screen w-full bg-white dark:bg-dark-background overflow-hidden">
            <Navbar />
            
            {/* Background Gradient Effect from Docs */}
            <div className="pointer-events-none absolute inset-x-0 top-16 mx-auto h-80 max-w-5xl rounded-full bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.18),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_top,rgba(129,140,248,0.28),transparent_70%)]" />

            <div className="flex min-h-screen items-center justify-center pt-24">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="relative z-10 mx-auto max-w-md w-full px-6"
                >
                    <div className="rounded-3xl border border-zinc-200 bg-white/80 p-8 shadow-[0_24px_30px_rgba(15,23,42,0.12)] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80 dark:shadow-[0_24px_30px_rgba(0,0,0,0.2)]">
                        <div className="flex flex-col items-center text-center">
                            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                    className="h-8 w-8"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M4.5 12.75l6 6 9-13.5"
                                    />
                                </svg>
                            </div>
                            
                            <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-white">
                                Login Successful
                            </h1>
                            
                            <p className="mb-8 text-zinc-500 dark:text-zinc-400">
                                {typeof redirectUri === "string" && redirectUri.length > 0
                                    ? (accessToken
                                        ? "Login successful. Returning to VS Code..."
                                        : (isRecovering
                                            ? "Recovering session and preparing redirect..."
                                            : "Waiting for session token to complete redirect..."))
                                    : `You have successfully logged in. Redirecting you to idle cultivation in ${count} seconds...`}
                            </p>

                            <button
                                onClick={() => navigate("/dashboard/idle-game")}
                                className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                            >
                                Go to Idle Game Now
                            </button>

                            {typeof redirectUri === "string" && redirectUri.length > 0 && accessToken ? (
                                <button
                                    onClick={() => {
                                        const separator = redirectUri.includes("?") ? "&" : "?";
                                        const target = `${redirectUri}${separator}code=${encodeURIComponent(accessToken)}&state=${encodeURIComponent(state ?? "")}`;
                                        window.location.href = target;
                                    }}
                                    className="mt-3 rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                >
                                    Open VS Code Manually
                                </button>
                            ) : null}
                        </div>
                    </div>
                </motion.div>
            </div>
        </main>
    );
};

export default LoginCallBackPage;
