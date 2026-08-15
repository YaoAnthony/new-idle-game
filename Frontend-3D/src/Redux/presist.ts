import storage from "redux-persist/lib/storage";
import autoMergeLevel2 from "redux-persist/es/stateReconciler/autoMergeLevel2";
import { createFilter } from "redux-persist-transform-filter";
import type { PersistConfig } from "redux-persist";

/**
 * persist 只留 user 一个子集：让标题页刷新后**秒显**上次的登录态，
 * 不用等 /me 网络往返。它是缓存不是真相——启动时 authBridge 一定会
 * 跑一次 /me 校验，401 就 setGuest 把这份缓存推翻。
 *
 * （参考 old/Oldfrontend/src/Redux/persist.ts 的工厂 + 白名单写法，
 * 这边没有历史包袱，不需要 migrate 链。）
 */

const saveSubsetFilters = [createFilter("user", ["user", "isLoggedIn"])];

export const makePersistConfig = <S>(): PersistConfig<S> => ({
  key: "root",
  version: 1,
  storage,
  whitelist: ["user"],
  transforms: saveSubsetFilters,
  stateReconciler: autoMergeLevel2,
});
