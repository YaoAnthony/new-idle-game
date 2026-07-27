// 导入 RTK Query 的核心功能和类型
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
    BaseQueryFn,
    FetchArgs,
    FetchBaseQueryError,
} from "@reduxjs/toolkit/query";
// 导入环境变量获取函数
import { getEnv } from "../config/env";
// 导入 Redux store 的类型，用于获取 state
import type { RootState } from "../Redux/store";
// 导入用户 slice 中的 action，用于更新 token 和登出
import { setToken, logout } from "../Redux/Features/userSlice";

// 从环境变量中获取后端 API 的 URL
const { backendUrl } = getEnv();

export type CouponVerifyParams = {
    code: string;
    productId?: string; // 可选，针对某个商品验证
};

export type CouponVerifyResponse = {
    valid: boolean;
    discountAmount: number; // 优惠金额（单位：元或分，视后端定义）
    message?: string; // 验证失败时的提示信息
};

export type RequestOptions = {
    signal?: AbortSignal;
    headers?: Record<string, string | number | boolean>;
};

// 创建一个基础的 fetchBaseQuery 实例
const rawBaseQuery = fetchBaseQuery({
    baseUrl: backendUrl, // 设置 API 的基础 URL
    credentials: "include", // 在跨域请求中携带凭证（如 cookie）
    // 在每个请求发送前准备请求头
    prepareHeaders: (headers, { getState }) => {
        // 从 Redux store 中获取 accessToken
        const token = (getState() as RootState).user.accessToken;
        // 如果 token 存在，则添加到 Authorization 请求头中
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return headers;
    },
});

// 创建一个带有自动重新认证功能的 baseQuery
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
    // 首先，尝试使用原始的 baseQuery 发送请求
    let result = await rawBaseQuery(args, api, extra);

    // 如果请求返回 401 未授权错误，说明 token 可能已过期
    if (result.error?.status === 401) {
        // 尝试调用刷新 token 的接口
        const refresh = await rawBaseQuery("/auth/refresh", api, extra);
        // 如果刷新成功并返回了数据
        if (refresh.data) {
            // 从刷新接口的响应中获取新的 accessToken 和过期时间
            const { accessToken, expiresAt } = refresh.data as { accessToken: string; expiresAt: number };
            // 使用新的 token 更新 Redux store
            api.dispatch(setToken({ accessToken, expiresAt }));
            // 使用新的 token 重新发送原始请求
            result = await rawBaseQuery(args, api, extra);
        } else {
            // 如果刷新 token 失败，则派发登出 action，清除用户信息
            api.dispatch(logout());
        }
    }

    // 返回最终的请求结果
    return result;
};



// 使用 createApi 创建一个 API slice
export const couponApi = createApi({
    reducerPath: "couponApi", // 在 Redux store 中的 reducer 路径
    baseQuery: baseQueryWithReauth, // 使用带有自动重新认证功能的 baseQuery
    tagTypes: ["Posts", "Post", "SearchResults"], // 定义用于缓存失效的标签类型
    endpoints: (builder) => ({
        // 定义一个 mutation 用于创建新帖子
        verifyCoupon: builder.mutation<CouponVerifyResponse, CouponVerifyParams>({
            query: (body) => ({
                url: "/coupon/verify",
                method: "POST",
                body,
            }),
            // 成功后，使 "Posts" 列表的缓存失效，以便重新获取最新列表
            invalidatesTags: [{ type: "Posts", id: "LIST" }],
        }),

    }),
});

// 自动生成对应的 React Hooks，用于在组件中使用
export const {
    useVerifyCouponMutation,
} = couponApi;
