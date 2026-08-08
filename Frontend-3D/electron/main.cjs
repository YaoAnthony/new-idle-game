const { app, BrowserWindow, net, protocol } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

/**
 * Electron 外壳，纯粹是给已经打包好的 Vite 产物套一个原生窗口。
 *
 * 不做的事：不内嵌 Backend，不碰 node 原生模块。联机走的是渲染进程里
 * 普通的 socket.io-client 请求，单机存档走的是渲染进程里的 IndexedDB——
 * 两者在浏览器标签页里就能跑，装进 Electron 窗口不需要主进程插手。
 * 这意味着联机功能仍然要求玩家自己起一个 Backend（本机或远程）。
 *
 * **为什么不用 loadFile 直接开 dist/index.html**：全套素材（图标、音效、
 * 曲库、立绘）都是运行时拼出来的绝对路径——`/icons/${itemId}.png`、
 * audio 注册表里的 `/audio/...wav`、曲库里的 `/music/...mp3`。`file://`
 * 下的绝对路径是从**磁盘根目录**算的（C:\icons\...），全部 404：
 * 窗口能开、3D 场景照常渲染（那是程序化建模，不读文件），但图全没了、
 * 声音也全没了。改 base 只能救 Vite 自己产出的 index.js/css，救不了这些
 * 运行时字符串。
 *
 * 所以注册一个自定义 scheme 当"源"，让绝对路径重新有根可依。scheme 必须
 * 声明成 standard 才有正常的 origin 和路径解析；secure 是为了 IndexedDB
 * （存档）不被当成不安全源禁掉。
 */

const SCHEME = "app";
const distRoot = path.join(__dirname, "..", "dist");

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      // 曲库单曲几 MB，让它流式播而不是整首读进内存
      stream: true,
    },
  },
]);

function serveDist() {
  protocol.handle(SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    // 曲库文件名里有空格和括号，注册表里是转义过的
    const filePath = path.join(distRoot, decodeURIComponent(pathname));

    // 目录穿越：pathname 由页面自己拼，仍然按不可信输入处理
    if (filePath !== distRoot && !filePath.startsWith(distRoot + path.sep)) {
      return new Response("forbidden", { status: 403 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.ELECTRON_START_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadURL(`${SCHEME}://bundle/index.html`);
  }
}

app.whenReady().then(() => {
  serveDist();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
