# 打桌面包（Electron）

浏览器里那一版原样装进一个原生窗口。主进程只有 `Frontend-3D/electron/main.cjs` 一个文件，
不内嵌后端、不碰原生模块——单机存档走渲染进程里的 IndexedDB，联机走普通的 socket.io 请求。

## 出包

在 `Frontend-3D/` 里：

| 命令 | 产物 | 说明 |
|---|---|---|
| `npm run electron:dev` | — | 连着 vite 开发服务器调壳子 |
| `npm run electron:pack` | `release/<平台>-unpacked/` | 只解包不压，改完想立刻双击试就用它 |
| `npm run electron:build` | `release/NewIdleGame Setup <版本>.exe` | Windows 安装包（NSIS） |
| `npm run electron:mac` | `release/NewIdleGame-<版本>-arm64.dmg` | macOS |
| `npx electron-builder --win zip --x64` | `release/NewIdleGame-<版本>-win.zip` | Windows 免安装版，解压即跑 |

**在 Mac 上能打 Windows 包**，不用装 wine：NSIS 本身 electron-builder 带了 macOS 版。
唯一要 wine 的是 `rcedit`（给 exe 换图标和版本信息的 Windows 小工具），所以 `win` 下写了
`signAndEditExecutable: false` 把那一步关掉——包照打、程序照跑，代价是 exe 顶着 Electron
默认图标。想要自己的图标，去 Windows 机器上打，或者 `brew install --cask wine-stable`。

## 两个坑

**`asar` 必须关**（`build.asar: false`）。主进程用自定义 `app://` scheme 把 `dist/` 当站点根
（运行时到处是 `/music/...`、`/audio/...` 这种绝对路径，`file://` 下会从磁盘根目录找、全 404），
而这个 scheme 的处理函数是 `net.fetch(file://…)` 读盘的——素材一旦被压进 `app.asar`，
`file://` 就进不去了：窗口能开、3D 照渲（那是程序化建模），但图和声音全没。

**后端地址是编译进去的**（`src/Api/backendUrl.ts` 读 `VITE_BACKEND_*`，默认
`http://localhost:3001`）。装了包的人要联机 / 登录，得有这个地址上的后端；单机存档不受影响。
换目标要重新 build 再重新打包。

## 体积

一个包 800 MB ~ 1.5 GB，几乎全是 `public/music`（原声带 579 MB）。想要小包就把音乐从
`files` 里排除掉，代价是留声机和 BGM 没声。

## 签名

都没签。Windows 首次运行会弹 SmartScreen（“更多信息 → 仍要运行”），macOS 会被 Gatekeeper
拦（右键 → 打开，或 `xattr -dr com.apple.quarantine NewIdleGame.app`）。自己玩无所谓，
要发给别人得买证书。
