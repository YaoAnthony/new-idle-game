import { useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

// rtk query
import { useLazyGetProfileAndUserQuery } from "../api/profileApi";

// redux
import { RootState } from "../Redux/store";
import { setUser } from "../Redux/Features/userSlice";
import {
  setProfile,
  setError,
  setStatus,
  type AuthStatus,
} from "../Redux/Features/profileSlice";

/**
 * options:
 *  - autoOpenLogin: 是否在鉴权完成且未登录时自动弹出登录框
 *  - openLogin: 触发登录弹窗的方法（例如 useAuthModal().showAuthModal）
 */
export interface UseAuthGateOptions {
  autoOpenLogin?: boolean;
  openLogin?: () => void;
}

/**
 * 基于 profileSlice 四态：
 *   checking | authenticated | unauthenticated | error
 * 流程：
 *   1) 初始 checking
 *   2) 若存在 token → 拉取 profile → authenticated / error
 *      若无 token → unauthenticated
 *   3) 鉴权完成后（authReady）再做 UI 决策（弹窗/渲染受保护内容）
 */
export function useAuthGate(options?: UseAuthGateOptions) {
  const dispatch = useDispatch();
  const { autoOpenLogin = false, openLogin } = options ?? {};

  const accessToken = useSelector((s: RootState) => s.user.accessToken);
  const authStatus = useSelector((s: RootState) => s.profile.status);
  const profile = useSelector((s: RootState) => s.profile.profile);

  const [triggerGetProfileAndUser] = useLazyGetProfileAndUserQuery();

  // 在 checking 期间决定如何推进鉴权：
  // - 有 token → 拉取 profile
  // - 无 token → 标记 unauthenticated
  useEffect(() => {
    if (authStatus !== "checking") return;

    if (accessToken) {
      dispatch(setStatus("checking"));
      triggerGetProfileAndUser()
        .unwrap()
        .then(({ profile, user }) => {
          dispatch(setUser(user));
          dispatch(setProfile(profile)); // 内部会把 status 设为 "authenticated"
        })
        .catch((err: unknown) => {
          console.error("getProfile failed:", err);
          dispatch(setError(typeof err === "string" ? err : "Profile fetch error"));
        });
    } else {
      // 没有 token，直接置为未登录，结束 checking
      dispatch(setProfile(null)); // 会把 status 设为 "unauthenticated"
    }
  }, [authStatus, accessToken, triggerGetProfileAndUser, dispatch]);

  // 鉴权是否已判定完成（不是 checking）
  const authReady = useMemo<boolean>(() => authStatus !== "checking", [authStatus]);
  const isLoggedIn = authStatus === "authenticated";

  // 防止重复弹窗
  const openedRef = useRef(false);

  // 可选：鉴权完成且未登录时，自动打开登录框
  useEffect(() => {
    if (!autoOpenLogin || !openLogin) return;
    if (!authReady) return;

    if (!isLoggedIn && !openedRef.current) {
      openLogin();
      openedRef.current = true;
    }
  }, [autoOpenLogin, openLogin, authReady, isLoggedIn]);

  // 登录成功（拿到 profile）后，允许未来再次弹窗（例如之后登出）
  useEffect(() => {
    if (profile) openedRef.current = false;
  }, [profile]);

  return {
    authReady,                   // 鉴权判定完成
    isLoggedIn,                  // 是否已登录
    status: authStatus as AuthStatus,
    profile,                     // 当前 profile（可能为 null）
  };
}
