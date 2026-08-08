// 目前渲染进程不需要任何主进程能力（存档走 IndexedDB，联机走
// socket.io-client，都是普通网页 API）。留一个空 preload 只是给以后
// 真需要原生能力（文件对话框、系统托盘之类）时留的入口，contextIsolation
// 打开着，不往 window 上挂东西。
