import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AccountUser } from "core";

/**
 * 账户状态。**只放用户信息，不放 token**——token 在 Api/auth/tokenStore
 * （netBoundary 看门），Redux 这份是给 UI 显示和 persist 秒显登录态用的。
 *
 * status 三态：
 * - unknown：启动时还没跑完 /me 校验（persist 恢复出的 user 只是"上次的样子"）
 * - guest：没登录或 token 失效
 * - authed：/me 校验过，user 可信
 */

export type UserState = {
  status: "unknown" | "guest" | "authed";
  isLoggedIn: boolean;
  user: AccountUser | null;
};

const initialState: UserState = {
  status: "unknown",
  isLoggedIn: false,
  user: null,
};

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AccountUser>) {
      state.status = "authed";
      state.isLoggedIn = true;
      state.user = action.payload;
    },
    setGuest(state) {
      state.status = "guest";
      state.isLoggedIn = false;
      state.user = null;
    },
    loggedOut(state) {
      state.status = "guest";
      state.isLoggedIn = false;
      state.user = null;
    },
  },
});

export const { setUser, setGuest, loggedOut } = userSlice.actions;
export default userSlice.reducer;
