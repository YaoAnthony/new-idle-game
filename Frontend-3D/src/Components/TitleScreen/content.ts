export type TitleLocale = "zh" | "ja";

export type TitleScreenCopy = {
  titleAlt: string;
  start: string;
  /** 只在本地存在可继续的存档时显示（V0.1 要求的小号入口） */
  continueGame: string;
  continueHint: string;
  settings: string;
  localeLabel: string;
  back: string;
  loggedInAs: string;
  logout: string;
  loginDialogTitle: string;

  /* ---- 存档页（四个槽：本地 A/B/C + 云端）---- */
  slotsTitle: string;
  slotLocal: string;
  slotCloud: string;
  slotEmpty: string;
  slotEmptyHint: string;
  /** "第 %s 天"。%s 是天数 */
  slotDay: string;
  slotGoldUnit: string;
  slotSaved: string;
  slotFromBackup: string;
  slotUnreadable: string;
  slotTooNew: string;
  slotCloudLocked: string;
  slotCloudLockedHint: string;
  slotEnter: string;
  slotDelete: string;
  /** "删掉「%s」的这个家？" %s 是槽名 */
  slotDeleteAsk: string;
  slotDeleteWarn: string;
  slotDeleteYes: string;
  slotDeleteNo: string;
  slotDownload: string;
  slotUpload: string;
  /** 导入失败的六种理由（Data/Save/transfer 的 ImportFailure） */
  slotImportEmpty: string;
  slotImportTooBig: string;
  slotImportOccupied: string;
  slotImportNotSave: string;
  slotImportTooNew: string;
  slotImportFailed: string;
  slotExportEmpty: string;
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
    continueGame: "继续游戏",
    continueHint: "回到你的小家",
    settings: "设置",
    localeLabel: "语言",
    back: "关闭",
    loggedInAs: "已登录",
    logout: "退出登录",
    loginDialogTitle: "登录账户",

    slotsTitle: "选择存档",
    slotLocal: "本地",
    slotCloud: "云端",
    slotEmpty: "空档位",
    slotEmptyHint: "点这里开始新生活",
    slotDay: "第 %s 天",
    slotGoldUnit: "金币",
    slotSaved: "上次保存",
    slotFromBackup: "已从备份恢复",
    slotUnreadable: "存档读不出来",
    slotTooNew: "存档比这台设备的游戏新",
    slotCloudLocked: "登录后使用",
    slotCloudLockedHint: "点这里登录账户",
    slotEnter: "进入",
    slotDelete: "删除",
    slotDeleteAsk: "删掉「%s」的这个家？",
    slotDeleteWarn: "删了找不回来",
    slotDeleteYes: "确定删除",
    slotDeleteNo: "算了",
    slotDownload: "下载",
    slotUpload: "上传存档",
    slotImportEmpty: "文件是空的",
    slotImportTooBig: "文件太大，不像是这个游戏的存档",
    slotImportOccupied: "这个槽里已经有档了，先删掉再导入",
    slotImportNotSave: "这不是一份存档文件",
    slotImportTooNew: "这份存档来自更新版本的游戏，先更新游戏再导入",
    slotImportFailed: "导入失败了，存档没有被改动",
    slotExportEmpty: "这个槽里没有可以下载的存档",
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
    continueGame: "つづきから",
    continueHint: "お家に戻る",
    settings: "設定",
    localeLabel: "言語",
    back: "閉じる",
    loggedInAs: "ログイン中",
    logout: "ログアウト",
    loginDialogTitle: "ログイン",

    slotsTitle: "セーブデータを選ぶ",
    slotLocal: "本体",
    slotCloud: "クラウド",
    slotEmpty: "空きスロット",
    slotEmptyHint: "ここから新しい暮らしを",
    slotDay: "%s 日目",
    slotGoldUnit: "コイン",
    slotSaved: "最終セーブ",
    slotFromBackup: "バックアップから復元",
    slotUnreadable: "読み込めません",
    slotTooNew: "新しいバージョンのセーブです",
    slotCloudLocked: "ログインすると使えます",
    slotCloudLockedHint: "ここからログイン",
    slotEnter: "はじめる",
    slotDelete: "削除",
    slotDeleteAsk: "「%s」のお家を削除しますか？",
    slotDeleteWarn: "元に戻せません",
    slotDeleteYes: "削除する",
    slotDeleteNo: "やめる",
    slotDownload: "ダウンロード",
    slotUpload: "読み込む",
    slotImportEmpty: "ファイルが空です",
    slotImportTooBig: "ファイルが大きすぎます",
    slotImportOccupied: "このスロットは使用中です。先に削除してください",
    slotImportNotSave: "セーブファイルではありません",
    slotImportTooNew: "新しいバージョンのセーブです。ゲームを更新してください",
    slotImportFailed: "読み込みに失敗しました（セーブは変更されていません）",
    slotExportEmpty: "このスロットは空です",
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
