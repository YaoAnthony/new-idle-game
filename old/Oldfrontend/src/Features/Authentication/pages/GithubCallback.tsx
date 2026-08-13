import { useEffect, useState } from 'react';
import { motion } from "motion/react";
import { Spin } from 'antd';
import { useGithubLoginMutation } from '../../../api/authApi';

// redux
import { useDispatch } from 'react-redux';
import { setToken, setUser } from '../../../Redux/Features/userSlice';

export default function GithubCallback() {
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('Authenticating with GitHub...');
    const [githubLogin] = useGithubLoginMutation();

    const dispatch = useDispatch();

    useEffect(() => {
        const runGithubLogin = async () => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (!code) {
            setStatus('error');
            setMessage('Missing GitHub code.');
            window.opener?.postMessage('github-login-fail', window.location.origin);
            return setTimeout(() => window.close(), 1500);
        }

        try {
            const data = await githubLogin({ code }).unwrap();

            if (data?.accessToken) {
                dispatch(setToken({ accessToken: data.accessToken, expiresAt: data.expiresAt }));
                dispatch(setUser(data.user));
                setStatus('success');
                setMessage('Login successful. Welcome back!');
                window.opener?.postMessage('github-login-success', window.location.origin);
            } else {
                setStatus('error');
                setMessage('Login failed. No token received.');
                window.opener?.postMessage('github-login-fail', window.location.origin);
            }
        } catch (err) {
            console.error('GitHub login failed:', err);
            setStatus('error');
            setMessage('Error during GitHub login.');
            window.opener?.postMessage('github-login-fail', window.location.origin);
        }

        setTimeout(() => window.close(), 1500);
        };

        runGithubLogin();
    }, [githubLogin]);

    return (
        <div className="bg-[#0f1115] text-white min-h-screen flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 text-center"
            >
                {status === 'loading' && <Spin size="large" />}
                <p className="text-lg font-medium">{message}</p>
            </motion.div>
        </div>
    );
}