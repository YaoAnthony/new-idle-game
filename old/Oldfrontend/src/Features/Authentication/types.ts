import { User } from "../../Types/User";
import { AuthToken } from "../../Types/Auth";

/**
 * 用户登录/注册时提交的基础凭证
 */
export type Credentials = {
    email: string;
    password: string;
    [key: string]: string | undefined; // 扩展参数（state, redirect_uri 等）
};

/**
 * 登录/注册通用响应
 */
export interface AuthResponse extends AuthToken {
    accessToken: string;
    expiresAt: number; // token 过期时间（秒）
}

/** Login/ Register 都返回 AuthResponse */
export type LoginResponse = AuthResponse;
export type RegisterResponse = AuthResponse;

/**
 * Google 登录
 */
export interface GoogleLoginRequest {
    id_token: string;
}
export interface GoogleLoginResponse extends Omit<AuthResponse, "refreshToken"> {
    user: User;
}

/**
 * Github 登录
 */
export interface GithubLoginRequest {
    code: string;
}
export interface GithubLoginResponse extends Omit<AuthResponse, "refreshToken"> {
    user: User;
}

/** 公共状态枚举 */
export const STATES = {
    idle: "Start",
    processing: "Processing",
    success: "Done",
    error: "Something went wrong",
} as const;

export type { User };
