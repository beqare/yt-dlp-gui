const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  startDownload: (options) => ipcRenderer.invoke("start-download", options),
  cancelDownload: () => ipcRenderer.invoke("cancel-download"),
  getVersion: () => ipcRenderer.invoke("get-version"),
  openFolder: (path) => ipcRenderer.invoke("open-folder", path),

  // Event listeners
  onLog: (callback) =>
    ipcRenderer.on("download-log", (_, data) => callback(data)),
  onProgress: (callback) =>
    ipcRenderer.on("download-progress", (_, data) => callback(data)),
  onFinished: (callback) => ipcRenderer.on("download-finished", callback),
  onError: (callback) =>
    ipcRenderer.on("download-error", (_, data) => callback(data)),

  // Remove listeners
  removeListeners: () => {
    ipcRenderer.removeAllListeners("download-log");
    ipcRenderer.removeAllListeners("download-progress");
    ipcRenderer.removeAllListeners("download-finished");
    ipcRenderer.removeAllListeners("download-error");
  },
});
