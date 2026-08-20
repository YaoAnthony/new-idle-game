import { useDispatch, useSelector, useStore } from "react-redux";

import type { AppDispatch, AppStore, RootState } from "./store";

/**
 * 带类型的 useDispatch / useSelector。
 *
 * 裸 `useDispatch()` 的返回类型是基础 Dispatch，thunk 传进去 TS 不认；
 * 裸 `useSelector` 每处都要手写 `(state: RootState) => ...` 的注解。
 * RTK 官方就是让在这里各包一层，全项目引这两个。
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/**
 * 给"在 window 监听器里读当前状态"用。
 *
 * 那种地方不能用 useAppSelector：监听器只在挂载时注册一次，闭包里抓到的是
 * 那一刻的值，之后状态变了它还念着旧的。把 deps 写全能躲过去，代价是每次
 * 状态变化都要摘挂一遍监听器。拿 store 现读最直接。
 */
export const useAppStore = useStore.withTypes<AppStore>();
