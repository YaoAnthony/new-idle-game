import {
  combineReducers,
  configureStore,
  type Reducer,
} from "@reduxjs/toolkit";
import {
  FLUSH,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  REHYDRATE,
  persistReducer,
  persistStore,
} from "redux-persist";

import { authApi } from "../Api/auth/authApi";
import { makePersistConfig } from "./presist";
import userReducer from "./features/userSlice";

/**
 * Redux 只管**账户与 UI 态**。游戏运行时状态在 Game/State（模块单例 +
 * EventBus），不进 Redux——两边的桥是 Features/Auth/authBridge。
 */

const rootReducer = combineReducers({
  user: userReducer,
  [authApi.reducerPath]: authApi.reducer,
});

type RootStatePrePersist = ReturnType<typeof rootReducer>;

const persistedReducer = persistReducer<RootStatePrePersist>(
  makePersistConfig<RootStatePrePersist>(),
  rootReducer,
);

export const store = configureStore({
  reducer: persistedReducer as unknown as Reducer<RootStatePrePersist>,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // redux-persist 的生命周期 action 带不可序列化载荷，是官方认可的豁免
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }).concat(authApi.middleware),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
