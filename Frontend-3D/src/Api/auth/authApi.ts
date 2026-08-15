import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  AccountError,
  AuthOk,
  GoogleLoginRequest,
  LoginRequest,
  MeOk,
  RegisterRequest,
} from "core";

import { backendUrl } from "../http";
import { getAuthToken, setAuthToken } from "./tokenStore";

/**
 * /api/auth 的 RTK Query 客户端（协议见 contracts/account_protocol.md，
 * 形状在 Core/types/account）。
 *
 * token 的写入收口在这里：三个登录 mutation 成功的那一刻写 tokenStore，
 * 组件只 dispatch、只读 user，永远摸不到 token 本体。
 * logout 不打后端——JWT 无撤销（v1 契约），忘掉 token 就是登出。
 */

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${backendUrl()}/api/auth`,
    prepareHeaders: (headers) => {
      const token = getAuthToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return headers;
    },
  }),
  endpoints: (builder) => ({
    register: builder.mutation<AuthOk, RegisterRequest>({
      query: (body) => ({ url: "/register", method: "POST", body }),
      onQueryStarted: async (_arg, { queryFulfilled }) => {
        const { data } = await queryFulfilled;
        setAuthToken(data.token);
      },
    }),

    login: builder.mutation<AuthOk, LoginRequest>({
      query: (body) => ({ url: "/login", method: "POST", body }),
      onQueryStarted: async (_arg, { queryFulfilled }) => {
        const { data } = await queryFulfilled;
        setAuthToken(data.token);
      },
    }),

    googleLogin: builder.mutation<AuthOk, GoogleLoginRequest>({
      query: (body) => ({ url: "/google", method: "POST", body }),
      onQueryStarted: async (_arg, { queryFulfilled }) => {
        const { data } = await queryFulfilled;
        setAuthToken(data.token);
      },
    }),

    me: builder.query<MeOk, void>({
      query: () => ({ url: "/me" }),
    }),
  }),
});

/** RTK Query 错误体里的契约错误（fetchBaseQuery 把非 2xx 的 body 放在 error.data） */
export function accountErrorOf(error: unknown): AccountError | null {
  if (typeof error !== "object" || error === null) return null;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const maybe = data as Partial<AccountError>;
  return maybe.ok === false && typeof maybe.code === "string" ? (maybe as AccountError) : null;
}

export const {
  useRegisterMutation,
  useLoginMutation,
  useGoogleLoginMutation,
  useLazyMeQuery,
} = authApi;
