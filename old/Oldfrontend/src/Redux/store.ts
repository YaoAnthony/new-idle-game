// store.ts
import {
  configureStore,
  combineReducers,
  ThunkAction,
  Action,
  Reducer,
} from "@reduxjs/toolkit";
import {
  persistReducer,
  persistStore,
  FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER,
} from "redux-persist";

// reducers
import userReducer from "./Features/userSlice";
import themeReducer from "./Features/themeSlice";
import profileReducer from "./Features/profileSlice";
import systemReducer from "./Features/systemSlice";
import profileStateReducer from "./Features/profileStateSlice";
import gameReducer from "./Features/gameSlice";

// RTK Query apis
import { authApi } from "../api/authApi";
import { profileApi } from "../api/profileApi";
import { couponApi } from "../api/couponApi";
import { systemRtkApi } from "../api/systemRtkApi";
import { profileStateRtkApi } from "../api/profileStateRtkApi";
import { apiTokenApi } from "../api/apiTokenApi";

// persist config 工厂
import { makePersistConfig } from "./persist";

// 1) 组合根 reducer（这是强类型的 reducer 函数）
const rootReducer = combineReducers({
    theme: themeReducer,
    user: userReducer,
    profile: profileReducer,
    system: systemReducer,
    profileState: profileStateReducer,
    game: gameReducer,

    // RTK Query
    [authApi.reducerPath]: authApi.reducer,
    [profileApi.reducerPath]: profileApi.reducer,
    [couponApi.reducerPath]: couponApi.reducer,
    [systemRtkApi.reducerPath]: systemRtkApi.reducer,
    [profileStateRtkApi.reducerPath]: profileStateRtkApi.reducer,
    [apiTokenApi.reducerPath]: apiTokenApi.reducer,
});

// 2) 用根 reducer 的返回类型，作为 “持久化前的 RootState”
type RootStatePrePersist = ReturnType<typeof rootReducer>;

// 3) 生成带泛型的 persistConfig（锁定为你的 RootState 形状）
const persistConfig = makePersistConfig<RootStatePrePersist>();

// 4) 包装成 persistedReducer
//    注意：这一步返回的类型会包含 PersistPartial，但我们不需要它出现在 RootState 上，
//    所以仅在 reducer 位置使用，不把它用于 RootState 的推导。
const persistedReducer = persistReducer<RootStatePrePersist>(persistConfig, rootReducer);

// 5) 创建 store
export const store = configureStore({
    reducer: persistedReducer as unknown as Reducer<RootStatePrePersist>, // 收敛类型
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
        serializableCheck: {
            ignoredActions: [
                FLUSH, 
                REHYDRATE, 
                PAUSE, 
                PERSIST, 
                PURGE, 
                REGISTER
            ],
        },
        }).concat(
            authApi.middleware,
            profileApi.middleware,
            couponApi.middleware,
            systemRtkApi.middleware,
            profileStateRtkApi.middleware,
            apiTokenApi.middleware,
        ),
});

// 6) 导出 persistor（React 里用 <PersistGate>）
export const persistor = persistStore(store);

// 7) 类型导出
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export type AppThunk<ReturnType = void> = ThunkAction<
    ReturnType,
    RootState,
    unknown,
    Action<string>
>;
