export type TitleLocale = "zh" | "ja";

export type TitleScreenCopy = {
  titleAlt: string;
  start: string;
  settings: string;
  localeLabel: string;
  startDialogTitle: string;
  login: string;
  guest: string;
  back: string;
  loginUnavailable: string;
  settingsTitle: string;
  soundTitle: string;
  controlsTitle: string;
  masterVolume: string;
  musicVolume: string;
  ambienceVolume: string;
  effectsVolume: string;
  muteAll: string;
  move: string;
  interact: string;
  openSettings: string;
  done: string;
};

export const TITLE_SCREEN_COPY: Record<TitleLocale, TitleScreenCopy> = {
  zh: {
    titleAlt: "我的异世界小家",
    start: "开始游戏",
    settings: "设置",
    localeLabel: "语言",
    startDialogTitle: "要怎样进入小家？",
    login: "用户登录",
    guest: "游客游玩",
    back: "关闭",
    loginUnavailable: "即将开放",
    settingsTitle: "设置",
    soundTitle: "声音",
    controlsTitle: "键位",
    masterVolume: "主音量",
    musicVolume: "音乐",
    ambienceVolume: "环境音",
    effectsVolume: "交互音效",
    muteAll: "全部静音",
    move: "移动",
    interact: "交互",
    openSettings: "打开设置",
    done: "完成",
  },
  ja: {
    titleAlt: "私の異世界の小さなお家",
    start: "ゲームを始める",
    settings: "設定",
    localeLabel: "言語",
    startDialogTitle: "どの方法で始めますか？",
    login: "ログイン",
    guest: "ゲストで始める",
    back: "閉じる",
    loginUnavailable: "準備中",
    settingsTitle: "設定",
    soundTitle: "サウンド",
    controlsTitle: "キー設定",
    masterVolume: "全体音量",
    musicVolume: "音楽",
    ambienceVolume: "環境音",
    effectsVolume: "操作音",
    muteAll: "すべてミュート",
    move: "移動",
    interact: "調べる",
    openSettings: "設定を開く",
    done: "完了",
  },
};
