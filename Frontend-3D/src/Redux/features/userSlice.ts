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
 *
 * **"已登录"的判断只有一个：`status === "authed"`。**
 * 这里原来还有一个 isLoggedIn 布尔——它被 persist 恢复、status 却不被恢复
 * （REHYDRATE 是异步的，会盖掉 initAuth 刚 dispatch 的 setGuest），
 * 于是出现过"token 已清、UI 却显示已登录"的幽灵态：两个真相源必然打架。
 * 冗余字段已删，persist 恢复的 user 只用于秒显 email，不授予任何行为。
 */

export type UserState = {
  status: "unknown" | "guest" | "authed";
  user: AccountUser | null;
};

const initialState: UserState = {
  status: "unknown",
  user: null,
};

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AccountUser>) {
      state.status = "authed";
      state.user = action.payload;
    },
    setGuest(state) {
      state.status = "guest";
      state.user = null;
    },
    loggedOut(state) {
      state.status = "guest";
      state.user = null;
    },
  },
});

export const { setUser, setGuest, loggedOut } = userSlice.actions;
export default userSlice.reducer;
