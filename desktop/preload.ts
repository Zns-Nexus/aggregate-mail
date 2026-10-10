import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("desktop", {
  onMailChanged: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("mail-changed", listener);
    return () => ipcRenderer.removeListener("mail-changed", listener);
  },
  oauthUrl: "http://127.0.0.1:32145/api/oauth/google",
  onAccountConnected: (callback: (error: string | null) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      error: string | null,
    ) => callback(error);
    ipcRenderer.on("account-connected", listener);
    return () => ipcRenderer.removeListener("account-connected", listener);
  },
});
