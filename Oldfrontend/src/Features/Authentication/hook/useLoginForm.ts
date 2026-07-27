import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";

// rtk query
import { useLoginMutation } from "../../../api/authApi";

// redux
import { 
    setToken, 
} from "../../../Redux/Features/userSlice";

// types
import type { Credentials } from "../types";
import type { AxiosErrorWithData } from "../../../Types/Error";

type BtnState = "idle" | "processing" | "success" | "error";

interface UseLoginFormOptions {
  /** 登录成功后的回调，可选 */
    onSuccess?: (accessToken: string) => void;
}

export function useLoginForm(options?: UseLoginFormOptions) {
    const { onSuccess } = options ?? {};
    const dispatch = useDispatch();
    const [searchParams] = useSearchParams();

    const [login] = useLoginMutation();
    
    const [loginInfo, setLoginInfo] = useState<Credentials>({
        email: "",
        password: "",
    });
    const [btnState, setBtnState] = useState<BtnState>("idle");
    const [errorMess, setErrorMess] = useState<string>("");

    // 把 URL 的 query 参数转成对象，memo 避免重复计算
    const params = useMemo(() => {
        const q: Record<string, string> = {};
        for (const [k, v] of searchParams.entries()) q[k] = v;
        return q;
    }, [searchParams]);

    // 受控输入变更
    const onChanges = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const { name, value } = e.target;
            setLoginInfo((prev) => ({ ...prev, [name]: value }));
        },
        []
    );

    // 提交逻辑
    const onSubmit = useCallback(
        async (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setErrorMess("");
            setBtnState("processing");

            try {
                // 1) 登录：必须带上 credentials: 'include'（在 fetchBaseQuery 里全局设置）
                const resp = await login({
                    email: loginInfo.email,
                    password: loginInfo.password,
                    ...params, // 透传：state / redirect_uri 等
                }).unwrap();
                

                // 兼容两种返回：普通(login)仅 accessToken；应用(OAuth)还有 refreshToken
                const accessToken = resp?.accessToken;
                const expiresAt = resp?.expiresAt ?? (Date.now() + 15 * 60 * 1000); // 兜底 15min

                if (!accessToken) {
                    setBtnState("error");
                    setErrorMess("Server 404, please try again later.");
                    setTimeout(() => setBtnState("idle"), 2000);
                    return;
                }

                // 3) 本地站点登录：同步本地状态
                setLoginInfo({ email: "", password: "" });
                dispatch(setToken({ accessToken, expiresAt }));
                setBtnState("success");
                onSuccess?.(accessToken);
                setTimeout(() => setBtnState("idle"), 1500);
                return;
                
            } catch (error) {
                console.error(error);
                setBtnState("error");
                const err = error as AxiosErrorWithData;
                setErrorMess(err?.error?.message || "Login failed."); 
                setTimeout(() => setBtnState("idle"), 2000);
            }
        },
        [dispatch, login, loginInfo.email, loginInfo.password, onSuccess, params]
    );


    return {
        // state
        loginInfo,
        btnState,
        errorMess,
        // handlers
        onChanges,
        onSubmit,
        // 也暴露 params，万一组件想用
        params,
    };
}
