import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useState } from "react";
import { ACCOUNT_LIMITS } from "core";

import {
  accountErrorOf,
  useGoogleLoginMutation,
  useLoginMutation,
  useRegisterMutation,
} from "../../Api/auth/authApi";
import { setUser } from "../../Redux/features/userSlice";
import { store } from "../../Redux/store";
import { GameBtn } from "../../Components/GameBtn";

/**
 * 登录/注册表单。挂在标题页"开始游戏"弹窗里（TitleScreen 负责开关和
 * 外面那层 soft-panel 壳），这里只有表单本身。
 *
 * 成功路径：mutation 成功（authApi 已顺手写了 tokenStore）→ dispatch
 * setUser → authBridge 察觉翻转 → auth_changed + 仓库重建 → onDone。
 */

type Mode = "login" | "register";

const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";

const ERROR_COPY: Record<string, string> = {
  email_taken: "这个邮箱已经注册过了，试试直接登录",
  email_uses_google: "这个邮箱是用 Google 注册的，请点下面的 Google 登录",
  invalid_credentials: "邮箱或密码不对",
  invalid_google_token: "Google 登录没通过，再试一次",
  not_configured: "服务器暂未开放 Google 登录",
  rate_limited: "试得太频繁了，休息一分钟再来",
  bad_request: "邮箱或密码的格式不对",
};

function messageFor(error: unknown): string {
  const parsed = accountErrorOf(error);
  if (parsed) return ERROR_COPY[parsed.code] ?? parsed.message;
  return "连不上服务器，稍后再试（离线也可以先游客游玩）";
}

export function LoginDialog({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const [login, loginState] = useLoginMutation();
  const [register, registerState] = useRegisterMutation();
  const [googleLogin] = useGoogleLoginMutation();
  const busy = loginState.isLoading || registerState.isLoading;

  const submit = async () => {
    setNotice(null);

    const trimmed = email.trim();
    if (!trimmed.includes("@")) return setNotice("邮箱格式不对");
    const passwordBytes = new Blob([password]).size;
    if (passwordBytes < ACCOUNT_LIMITS.minPasswordLength) {
      return setNotice(`密码至少 ${ACCOUNT_LIMITS.minPasswordLength} 个字符`);
    }
    if (passwordBytes > ACCOUNT_LIMITS.maxPasswordLength) {
      return setNotice("密码太长了");
    }
    if (mode === "register" && password !== confirm) {
      return setNotice("两次输入的密码不一样");
    }

    try {
      const action = mode === "login" ? login : register;
      const result = await action({ email: trimmed, password }).unwrap();
      store.dispatch(setUser(result.user));
      onDone();
    } catch (error) {
      setNotice(messageFor(error));
    }
  };

  /*
   * 输入框跟着标题层一起换成日记本那套（2026-09-07）：白底、圆角 16、
   * 细灰边，聚焦时描一圈薄荷。原来是米黄底 + 深棕直角边，在奶油纸面板
   * 里像一块补丁。
   */
  const inputClass =
    "w-full rounded-2xl border-2 border-[#eeeeee] bg-white px-4 py-2.5 text-[14px] font-bold text-[#5d4037] outline-none placeholder:text-[#bcaaa4] focus:border-[#4db6ac]";

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="grid w-full grid-cols-2 gap-1 rounded-full bg-[#f5f5f5] p-1 shadow-[inset_0_-2px_0_#e0e0e0]">
        {(["login", "register"] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={[
              "min-h-9 cursor-pointer rounded-full border-0 text-[13px] font-black transition-colors",
              mode === candidate
                ? "bg-white text-[#5d4037] shadow-[0_2px_4px_rgb(0_0_0_/_0.1)]"
                : "bg-transparent text-[#8d6e63]",
            ].join(" ")}
            onClick={() => {
              setMode(candidate);
              setNotice(null);
            }}
          >
            {candidate === "login" ? "登录" : "注册"}
          </button>
        ))}
      </div>

      <form
        className="flex w-full flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <input
          className={inputClass}
          type="email"
          placeholder="邮箱"
          autoComplete="email"
          value={email}
          maxLength={ACCOUNT_LIMITS.maxEmailLength}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          className={inputClass}
          type="password"
          placeholder="密码"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {mode === "register" ? (
          <input
            className={inputClass}
            type="password"
            placeholder="再输一次密码"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        ) : null}

        <GameBtn size="md" tone="mint" fullWidth type="submit" disabled={busy}>
          {busy ? "……" : mode === "login" ? "登录" : "注册并登录"}
        </GameBtn>
      </form>

      {GOOGLE_CLIENT_ID ? (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <GoogleLogin
            onSuccess={async (response) => {
              if (!response.credential) return setNotice(ERROR_COPY.invalid_google_token);
              try {
                const result = await googleLogin({ idToken: response.credential }).unwrap();
                store.dispatch(setUser(result.user));
                onDone();
              } catch (error) {
                setNotice(messageFor(error));
              }
            }}
            onError={() => setNotice(ERROR_COPY.invalid_google_token)}
          />
        </GoogleOAuthProvider>
      ) : null}

      {notice ? (
        <p
          className="m-0 w-full rounded-2xl border-2 border-[#ef9a9a] bg-[#ffebee] px-3 py-1.5 text-xs font-extrabold leading-normal text-[#c62828]"
          role="status"
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}
