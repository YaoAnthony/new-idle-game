import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";

// rtk query
import { useRegisterMutation } from "../../../api/authApi"; // 确保在 authApi 里有对应的 register endpoint

// redux
import { setToken } from "../../../Redux/Features/userSlice";

// types
import type { AxiosErrorWithData } from "../../../Types/Error";

type BtnState = "idle" | "processing" | "success" | "error";

/** 注册表单字段 */
export interface RegisterFormValues {
    email: string;
    password: string;
    confirmPassword?: string;
    // 其他可选字段（例如用户名、邀请码等）
    [k: string]: unknown;
}

interface UseRegisterFormOptions {
    /** 成功后的回调 */
    onSuccess?: (accessToken: string) => void;
    /** 自定义校验：返回字符串表示错误（会显示到 errorMess），返回空串或 undefined 表示通过 */
    validate?: (values: RegisterFormValues) => string | undefined;
    /** 初始值 */
    initialValues?: Partial<RegisterFormValues>;
}

export function useRegisterForm(options?: UseRegisterFormOptions) {
    const { onSuccess, validate, initialValues } = options ?? {};
    const dispatch = useDispatch();
    const [searchParams] = useSearchParams();

    const [registerReq] = useRegisterMutation();

    const [values, setValues] = useState<RegisterFormValues>({
        email: "",
        password: "",
        confirmPassword: "",
        ...initialValues,
    });

    const [btnState, setBtnState] = useState<BtnState>("idle");
    const [errorMess, setErrorMess] = useState<string>("");

    // URL query → 对象
    const params = useMemo(() => {
        const q: Record<string, string> = {};
        for (const [k, v] of searchParams.entries()) q[k] = v;
        return q;
    }, [searchParams]);

    const onChanges = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setValues((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
        },
        []
    );

    const onSubmit = useCallback(
        async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setErrorMess("");

        // 可选的前端校验
        if (validate) {
            const msg = validate(values);
            if (msg) {
            setBtnState("error");
            setErrorMess(msg);
            setTimeout(() => setBtnState("idle"), 2000);
            return;
            }
        } else if (
            typeof values.confirmPassword === "string" &&
            values.confirmPassword !== "" &&
            values.confirmPassword !== values.password
        ) {
            setBtnState("error");
            setErrorMess("Passwords do not match.");
            setTimeout(() => setBtnState("idle"), 2000);
            return;
        }

        setBtnState("processing");

        try {
            // 允许透传 query 中的扩展参数（state、redirect_uri 等）
            const resp = await registerReq({
                email: String(values.email || ""),
                password: String(values.password || ""),
                ...params,
                // 如果后端需要更多字段（例如 username），一并传入：
                // username: values.username, inviteCode: values.inviteCode, ...
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

            // reset form when login is successful
            setValues((prev) => ({
                ...prev,
                email: "",
                password: "",
                confirmPassword: "",
            }));
            dispatch(setToken({ accessToken, expiresAt }));
            setBtnState("success");
            onSuccess?.(accessToken);
            setTimeout(() => setBtnState("idle"), 1500);
            return;
        } catch (error) {
            console.error(error);
            setBtnState("error");
            const err = error as AxiosErrorWithData;
            setErrorMess(err?.error?.message || "Register failed.");
            setTimeout(() => setBtnState("idle"), 2000);
        }
        },
        [params, values, validate, registerReq, dispatch, onSuccess]
    );

    return {
        // state
        values,
        btnState,
        errorMess,
        // handlers
        onChanges,
        onSubmit,
        // 附带 query 参数（有时组件会需要）
        params,
        // 便捷方法
        setValues,
        setErrorMess,
        setBtnState,
    };
}
