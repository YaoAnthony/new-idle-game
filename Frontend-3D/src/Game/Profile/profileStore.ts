import { auditAvatarConfig, type AvatarConfig } from "core";

/**
 * "我的形象"的归属层。
 *
 * 玩家点名的规则：没注册跟着玩家（本机）走，注册了跟着账户走。
 * 账户系统还不存在，所以先只有本地实现；**接口按"将来换远端"设计**——
 * 异步签名不是装样子，远端实现天生是网络请求，现在把同步的 localStorage
 * 包成 async，将来换实现时调用方一行不改。标题页那个"游客游玩 / 用户登录"
 * 的会话选择就是将来的切换点：登录态下 getProfileStore() 返回远端实现。
 *
 * 和存档里的 avatar 是两回事：PlayerSave.avatar 是**这个世界里的真身**
 * （联机时带着走、跟着档案存取），profile 是"下次开新档时的默认形象"。
 * 分开的原因：删档重开不该把捏好的形象也删了——动森重开岛也会记得你的脸。
 */
export type AvatarProfileStore = {
  load(): Promise<AvatarConfig | null>;
  save(config: AvatarConfig): Promise<void>;
};

/** 键沿用本项目 localStorage 的 idle-home: 前缀 */
const STORAGE_KEY = "idle-home:profile-avatar";

const localStore: AvatarProfileStore = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Promise.resolve(null);
      const parsed = JSON.parse(raw) as AvatarConfig;
      /*
       * 读出来先过一遍校验：上个版本存的形象可能引用了这个版本已删掉的
       * 零件。校验不过就当没有——捏脸页会从默认开始，比带着坏配置进
       * 捏脸页（选中态指向不存在的格子）强。
       */
      if (auditAvatarConfig(parsed, "本地形象").length > 0) {
        return Promise.resolve(null);
      }
      return Promise.resolve(parsed);
    } catch {
      // localStorage 被禁用或内容损坏，都按"还没捏过"处理
      return Promise.resolve(null);
    }
  },

  save(config) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // 存不上只影响"下次默认"，不值得打断开局流程
    }
    return Promise.resolve();
  },
};

export function getProfileStore(): AvatarProfileStore {
  return localStore;
}
