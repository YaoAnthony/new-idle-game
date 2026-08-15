import { authApi } from "../../Api/auth/authApi";
import { clearAuthToken, getAuthToken } from "../../Api/auth/tokenStore";
import { resetSaveRepository } from "../../Data/Save";
import { emit } from "../../Game/EventBus";
import { loggedOut, setGuest, setUser } from "../../Redux/features/userSlice";
import { store } from "../../Redux/store";

/**
 * Redux ↔ 游戏层的桥。**方向单一**：Redux（UI/账户态）的翻转经这里
 * 变成 EventBus 事件和存档仓库重建；游戏层永远不 import store。
 *
 * profileStore 当年的注释说"登录态下 getProfileStore() 返回远端实现"，
 * 云同步这套走的就是同一个思路——桥只负责在翻转的瞬间把两边对齐。
 */

let lastUserId: string | null = null;

function handleFlip(userId: string | null): void {
  if (userId === lastUserId) return;
  lastUserId = userId;
  // 先重建仓库再广播：听到 auth_changed 的人立刻 getSaveRepository()
  // 拿到的必须已经是新实现
  resetSaveRepository();
  emit("auth_changed", { userId });
}

/** main.tsx 挂 Provider 前调一次：订阅 store + 启动时校验 token */
export function initAuth(): void {
  store.subscribe(() => {
    const { user } = store.getState();
    handleFlip(user.status === "authed" && user.user ? user.user.id : null);
  });

  const token = getAuthToken();
  if (!token) {
    store.dispatch(setGuest());
    return;
  }

  // persist 会先恢复出"上次的样子"（status unknown），这里静默校验，
  // 不阻塞标题页：成了转 authed，401/网络挂了都转 guest——
  // 离线时按游客玩本地档，正是硬约束要的行为
  void store
    .dispatch(authApi.endpoints.me.initiate())
    .unwrap()
    .then((result) => {
      store.dispatch(setUser(result.user));
    })
    .catch((error: { status?: unknown }) => {
      // 只有明确 401 才清 token（token 真死了）；网络失败留着下次再验
      if (error?.status === 401) clearAuthToken();
      store.dispatch(setGuest());
    });
}

/**
 * 登出：先落本地盘 + 尽力推一次云端（3 秒内），再清 token、Redux 归位
 * （store.subscribe 顺带触发 handleFlip → 仓库换回纯本地）。
 * 本地存档**不清**——本地是主体，云端才是副本。
 */
export function logout(): void {
  void (async () => {
    try {
      const { saveNow } = await import("../../Data/Save/autosave");
      await saveNow();
      const { flushBeforeLogout } = await import("../CloudSave/syncController");
      await Promise.race([
        flushBeforeLogout(),
        new Promise((resolve) => setTimeout(resolve, 3_000)),
      ]);
    } finally {
      clearAuthToken();
      store.dispatch(loggedOut());
    }
  })();
}

export function isLoggedIn(): boolean {
  return store.getState().user.status === "authed";
}

export function currentUserId(): string | null {
  const { user } = store.getState();
  return user.status === "authed" && user.user ? user.user.id : null;
}
