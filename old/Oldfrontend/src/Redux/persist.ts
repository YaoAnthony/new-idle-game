// persist.ts
import storage from "redux-persist/lib/storage";
import {
  createMigrate,
  MigrationManifest,
} from "redux-persist";
import autoMergeLevel2 from "redux-persist/es/stateReconciler/autoMergeLevel2";
import { createFilter } from "redux-persist-transform-filter";
import type { PersistConfig } from "redux-persist";

// 只保存子集
const saveSubsetFilters = [
  createFilter("user", ["accessToken", "expiresAt", "user"]),
  createFilter("theme", ["mode"]),
  createFilter("profile", ["profile", "status"]),
  createFilter("game", ["settings"]),
];

// 迁移：不要动 _persist，不要从 oldState.state 取
const migrations: MigrationManifest = {
    "1" : (state) => {

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const oldState = state as any;

        // migration to clear out device state
        return {
            ...state,
            user: {
                isLoggedIn: oldState?.isLoggedIn ?? false,
                accessToken: oldState?.user?.accessToken ?? null,  // ← 修正字段名
                expiresAt: oldState?.user?.expiresAt ?? null,
                user: oldState?.user?.user ?? null,
            },
            theme: {
                mode: 'light',
            },
            profile: {
                profile: oldState?.profile?.profile ?? null,
                status: oldState?.profile?.status ?? 'unauthenticated',
            },
            _persist: oldState?._persist,
        };
    },
    "2" : (state) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const oldState = state as any;
        return {
            ...oldState,
            theme: {
                mode: 'light',
            },
            _persist: oldState?._persist,
        };
    },
}

// 用工厂函数把 PersistConfig 泛型交给调用方指定（避免循环依赖）
export const makePersistConfig = <S>(): PersistConfig<S> => ({
  key: "root",
  version: 2,
  storage,
  whitelist: ["theme", "profile", "user", "game"],
  transforms: saveSubsetFilters,
  stateReconciler: autoMergeLevel2,
  migrate: createMigrate(migrations, { debug: false }),
});

