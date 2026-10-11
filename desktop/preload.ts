import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  onNavigation: (callback: (direction: "back" | "forward") => void) => {
    const listener = (_event: Electron.IpcRendererEvent, direction: string) => {
      if (direction === "back" || direction === "forward") callback(direction);
    };
    ipcRenderer.on("mail-navigation", listener);
    return () => ipcRenderer.removeListener("mail-navigation", listener);
  },
  onMailChanged: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("mail-changed", listener);
    return () => ipcRenderer.removeListener("mail-changed", listener);
  },
  oauthUrl: "http://127.0.0.1:32145/api/oauth/google",
  windowCommand: (command: "minimize" | "maximize" | "close") =>
    ipcRenderer.send("window-command", command),
  onWindowState: (callback: (maximized: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) =>
      callback(maximized);
    ipcRenderer.on("window-state", listener);
    return () => ipcRenderer.removeListener("window-state", listener);
  },
  onAccountConnected: (callback: (error: string | null) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      error: string | null,
    ) => callback(error);
    ipcRenderer.on("account-connected", listener);
    return () => ipcRenderer.removeListener("account-connected", listener);
  },
});
