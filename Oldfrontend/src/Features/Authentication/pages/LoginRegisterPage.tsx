// state
import { useEffect, useMemo, useState } from 'react';
import {  useSearchParams } from 'react-router-dom';
import { motion } from "motion/react";

// component
import { Login, Register, GoogleLoginButton } from '../component';
import Navbar from '../../../Component/Navigation/Navbar';
import { useSelector } from 'react-redux';
import { RootState } from '../../../Redux/store';

import { APPNAME } from '../../../Constant';

const OAUTH_CTX_KEY = "defuze.oauth.loginContext";

export default function LoginRegisterPage() {

    const [isLogin, setIsLogin] = useState(true);
    const [searchParams] = useSearchParams();
    const accessToken = useSelector((state: RootState) => state.user.accessToken);

    const params = useMemo(() => {
        const q: Record<string, string> = {};
        for (const [k, v] of searchParams.entries()) q[k] = v;
        return q;
    }, [searchParams]);

    useEffect(() => {
        const redirectUri = params?.redirect_uri;
        const state = params?.state;
        if (typeof redirectUri !== "string" || !redirectUri) {
            return;
        }

        const payload = {
            redirectUri,
            state: typeof state === "string" ? state : undefined,
        };

        sessionStorage.setItem(OAUTH_CTX_KEY, JSON.stringify(payload));
    }, [params]);

    // 因为这里一般是 OAuth2 登录回调，所以需要处理 redirect_uri 和 state 参数
    // 把实际跳转逻辑下放到 callback 页面统一处理
    const onSuccess = (nextAccessToken?: string) => {
        const tokenForCallback = nextAccessToken ?? accessToken ?? undefined;
        console.log("Login/Register Success:", { accessToken: tokenForCallback });

        // navigate('/login-callback', {
        //     state: tokenForCallback
        //         ? { accessToken: tokenForCallback }
        //         : undefined,
        // });
        window.location.replace("/login-callback");
    }

    const OauthLogin = () => {
        return (
            <div className='w-full max-w-xs'>
                <GoogleLoginButton onSuccess={onSuccess} />
            </div>
        )
    }

    return (
        <main className="relative min-h-screen w-full bg-white dark:bg-dark-background overflow-hidden">
            <Navbar />
            
            {/* Background Gradient Effect */}
            <div className="pointer-events-none absolute inset-x-0 top-16 mx-auto h-80 max-w-5xl rounded-full bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.18),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_top,rgba(129,140,248,0.28),transparent_70%)]" />

            <div className="flex min-h-screen items-center justify-center pt-24 px-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="relative z-10 mx-auto w-full max-w-lg"
                >
                    <div className="rounded-3xl border border-zinc-200 bg-white/80 p-8 shadow-[0_24px_30px_rgba(15,23,42,0.12)] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80 dark:shadow-[0_24px_30px_rgba(0,0,0,0.2)]">
                        
                        <div className="flex flex-col items-center gap-8">
                            <div className="text-center">
                                <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                                    {isLogin ? `Sign in to ${APPNAME}` : `Join ${APPNAME}`}
                                </h1>
                                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                                    {isLogin ? "Welcome back! Please enter your details." : "Create an account to start managing your code."}
                                </p>
                            </div>

                            <div className="w-full flex flex-col items-center gap-6">
                                {isLogin ? (
                                    <Login onSuccess={onSuccess}/>
                                ) : (
                                    <Register onSuccess={onSuccess}/>
                                )}
                            </div>

                            <div className="relative w-full">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white px-2 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                                        Or continue with
                                    </span>
                                </div>
                            </div>

                            <OauthLogin />

                            <div className="flex gap-2 text-sm">
                                <span className="text-zinc-500 dark:text-zinc-400">
                                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                                </span>
                                <button
                                    onClick={() => setIsLogin(!isLogin)}
                                    className="font-medium text-zinc-900 hover:underline dark:text-white"
                                >
                                    {isLogin ? "Sign up" : "Log in"}
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
