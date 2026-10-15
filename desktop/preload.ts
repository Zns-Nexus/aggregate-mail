import { contextBridge, ipcRenderer } from "electron";
import type { UpdateCommand, UpdateState } from "../shared/updates.js";
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  // The window has an OS material behind it: macOS vibrancy, or Mica and
  // Acrylic on Windows 11 22H2 (build 22621) and later.
  materials: process.platform === "darwin" ||
    (process.platform === "win32" && Number(process.getSystemVersion().split(".")[2]) >= 22621),
  setMaterial: (material: "none" | "mica" | "acrylic") => ipcRenderer.send("window-material", material),
  setScheme: (mode: "system" | "light" | "dark") => ipcRenderer.send("window-scheme", mode),
  // Outside macOS: the app's drawn traffic lights or the system caption buttons.
  windowControls: process.platform !== "darwin" && process.argv?.includes("--emc2-window-controls=windows") ? "windows" : "mac",
  setWindowControls: (controls: "mac" | "windows") => ipcRenderer.send("window-controls", controls),
  setOverlay: (colors: { color: string; symbolColor: string }) => ipcRenderer.send("window-overlay", colors),
  mailMenu: (items: unknown, position?: unknown) => ipcRenderer.invoke("mail-menu", items, position),
  credentialFallback: process.argv?.includes("--emc2-credential-fallback=linux-local")
    ? "linux-local" : undefined,
  updates: process.argv?.includes("--emc2-disable-updates") ? undefined : {
    state: () => ipcRenderer.invoke("update-state"),
    command: (command: UpdateCommand) => ipcRenderer.invoke("update-command", command),
    onState: (callback: (state: UpdateState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: UpdateState) => callback(state);
      ipcRenderer.on("update-state", listener);
      return () => ipcRenderer.removeListener("update-state", listener);
    },
    onDrain: (callback: () => Promise<void>) => {
      const listener = (_event: Electron.IpcRendererEvent, request: string) => {
        if (typeof request !== "string" || !/^[a-f0-9]{32}$/.test(request)) return;
        void callback().then(() => ipcRenderer.send("update-drained", request), () => {});
      };
      ipcRenderer.on("update-drain", listener);
      return () => ipcRenderer.removeListener("update-drain", listener);
    },
  },
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
