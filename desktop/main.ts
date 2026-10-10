import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  session,
  shell,
} from "electron";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { DatabaseSync, backup } from "node:sqlite";
import path from "node:path";
import type { Server } from "node:http";
import { isExternalLink, isLocalNavigation } from "./navigation.js";
import { migrateLegacyUserData } from "./migrate.js";

app.setName("Emc²");
app.setAppUserModelId("dev.screen.aggregate-mail");
migrateLegacyUserData({
  appData: app.getPath("appData"),
  target: app.getPath("userData"),
});
let window: BrowserWindow | null = null;
let server: Server | undefined;
const origin = "http://127.0.0.1:32145";
const developing = !app.isPackaged && process.argv.includes("--dev");
const rendererOrigin = developing ? "http://127.0.0.1:5173" : origin;
const token = randomBytes(32).toString("hex");
const checking = process.argv.includes("--check-startup");
const isMac = process.platform === "darwin";

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  // The window is frameless outside macOS, so the renderer's traffic lights ask
  // for these instead of the native caption buttons.
  ipcMain.on("window-command", (_event, command: string) => {
    if (!window) return;
    if (command === "minimize") window.minimize();
    else if (command === "maximize")
      window.isMaximized() ? window.unmaximize() : window.maximize();
    else if (command === "close") window.close();
  });
  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(
        isMac
          ? Menu.buildFromTemplate([
              { role: "appMenu" },
              { role: "fileMenu" },
              { role: "editMenu" },
              { role: "windowMenu" },
            ])
          : null,
      );
      const dataPath = app.getPath("userData");
      const mailPath = path.join(dataPath, "mail");
      mkdirSync(mailPath, { recursive: true });
      const protectedKey = path.join(mailPath, "key.protected");
      if (!safeStorage.isEncryptionAvailable())
        throw new Error(
          "System credential encryption is unavailable. Your mail store was not opened.",
        );
      // Preserve the earlier client's data without moving or deleting its source files.
      let legacyKey: Buffer | undefined;
      if (
        !app.isPackaged &&
        !existsSync(path.join(mailPath, "mail.sqlite")) &&
        existsSync(path.resolve(".data/key"))
      ) {
        const source = new DatabaseSync(path.resolve(".data/mail.sqlite"), {
          readOnly: true,
        });
        try {
          legacyKey = readFileSync(path.resolve(".data/key"));
          if (!existsSync(protectedKey))
            writeFileSync(
              protectedKey,
              safeStorage.encryptString(legacyKey.toString("base64")),
            );
          await backup(source, path.join(mailPath, "mail.sqlite.migrating"));
          renameSync(
            path.join(mailPath, "mail.sqlite.migrating"),
            path.join(mailPath, "mail.sqlite"),
          );
        } finally {
          source.close();
        }
      }
      const key = existsSync(protectedKey)
        ? safeStorage.decryptString(readFileSync(protectedKey))
        : (legacyKey || randomBytes(32)).toString("base64");
      if (!existsSync(protectedKey))
        writeFileSync(protectedKey, safeStorage.encryptString(key));
      process.env.MAIL_DATA_DIR = mailPath;
      process.env.MAIL_DATA_KEY = key;
      process.env.MAIL_CONFIG_PATH = path.join(dataPath, "settings.env");
      process.env.MAIL_STATIC_DIR = path.join(app.getAppPath(), "dist");
      process.env.MAIL_DESKTOP_TOKEN = token;
      process.env.APP_URL = origin;
      if (developing) process.env.MAIL_RENDERER_ORIGIN = rendererOrigin;
      else delete process.env.MAIL_RENDERER_ORIGIN;
      const backend = await import("../server/index.js");
      delete process.env.MAIL_DATA_KEY;
      server = await backend.startServer(
        32145,
        (error) => {
          window?.webContents.send("account-connected", error || null);
          if (window?.isMinimized()) window.restore();
          window?.show();
          window?.focus();
        },
        () => window?.webContents.send("mail-changed"),
      );
      const localSession = session.fromPartition("persist:aggregate");
      localSession.webRequest.onBeforeSendHeaders(
        { urls: [`${origin}/api/*`, `${rendererOrigin}/api/*`] },
        (details, callback) =>
          callback({
            requestHeaders: {
              ...details.requestHeaders,
              "X-Desktop-Token": token,
            },
          }),
      );
      localSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      localSession.setPermissionCheckHandler(() => false);
      window = new BrowserWindow({
        title: "Emc²",
        width: 1440,
        height: 900,
        minWidth: 900,
        minHeight: 560,
        backgroundColor: "#0a0a0a",
        icon: path.join(app.getAppPath(), "build/icon.png"),
        show: false,
        // macOS keeps its native traffic lights. Elsewhere the window is
        // frameless and the renderer draws its own; Windows still rounds and
        // shadows the frame, so the corners belong to the OS.
        titleBarStyle: isMac ? "hiddenInset" : "hidden",
        trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          session: localSession,
        },
      });
      // A maximized window fills the screen, so its corners square off.
      const reportWindowState = () =>
        window?.webContents.send("window-state", !!window?.isMaximized());
      window.on("maximize", reportWindowState);
      window.on("unmaximize", reportWindowState);
      window.webContents.setWindowOpenHandler(({ url }) => {
        if (isExternalLink(url, origin)) void shell.openExternal(url);
        return { action: "deny" };
      });
      window.webContents.on("will-navigate", (event, url) => {
        if (isLocalNavigation(url, rendererOrigin)) return;
        event.preventDefault();
        if (isExternalLink(url, origin)) void shell.openExternal(url);
      });
      window.webContents.on("will-prevent-unload", (event) => {
        if (
          window &&
          dialog.showMessageBoxSync(window, {
            type: "question",
            buttons: ["Keep editing", "Discard draft"],
            defaultId: 0,
            cancelId: 0,
            message: "Discard your unsent draft?",
          }) === 1
        )
          event.preventDefault();
      });
      // Entrance animations start at opacity 0 and a hidden window never runs
      // them, so ready-to-show alone can wait forever for a visible paint.
      const reveal = () => {
        if (!checking && !window?.isVisible()) window?.show();
      };
      window.once("ready-to-show", reveal);
      window.webContents.once("did-finish-load", reveal);
      await window.loadURL(rendererOrigin);
      if (checking) {
        if (isMac) {
          const roles = Menu.getApplicationMenu()?.items.flatMap((item) =>
            item.submenu?.items.map((entry) => entry.role?.toLowerCase()) ?? [],
          );
          for (const role of ["quit", "close", "undo", "cut", "copy", "paste", "selectall"]) {
            if (!roles?.includes(role))
              throw new Error(`The macOS menu is missing ${role}.`);
          }
        }
        const response = await fetch(`${origin}/api/state`, {
          headers: { "X-Desktop-Token": token },
        });
        if (!response.ok)
          throw new Error("The desktop mail service did not respond.");
        const blocked = await fetch(`${origin}/api/state`);
        if (blocked.status !== 403)
          throw new Error("Desktop API isolation failed.");
        if (developing) {
          const client = await fetch(`${rendererOrigin}/@vite/client`);
          if (!client.ok || !(await client.text()).includes("WebSocket"))
            throw new Error("The hot reload client is unavailable.");
          const proxied = await fetch(`${rendererOrigin}/api/state`, {
            headers: { "X-Desktop-Token": token, Origin: rendererOrigin },
          });
          if (!proxied.ok) throw new Error("The development API proxy failed.");
          const blockedProxy = await fetch(`${rendererOrigin}/api/state`);
          if (blockedProxy.status !== 403)
            throw new Error("Development API isolation failed.");
        }
        console.log(
          JSON.stringify({
            startup: "passed",
            packaged: app.isPackaged,
            electron: process.versions.electron,
            database: "opened",
            renderer: "loaded",
            hotReload: developing,
            isolatedApi: true,
            platform: process.platform,
            nativeMenu: isMac,
          }),
        );
        app.quit();
      }
    })
    .catch((error: unknown) => {
      if (checking) {
        console.error(error instanceof Error ? error.stack : error);
        app.exit(1);
        return;
      }
      dialog.showErrorBox(
        "Emc² could not start",
        error instanceof Error ? error.message : "Unknown startup error.",
      );
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => server?.close());
}
