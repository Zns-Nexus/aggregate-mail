import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  Notification,
  nativeImage,
  safeStorage,
  session,
  shell,
  Tray,
} from "electron";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
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
import { editingMenu } from "./context-menu.js";
import { isExternalLink, isLocalNavigation } from "./navigation.js";
import { LEGACY_APP_NAME, migrateLegacyUserData } from "./migrate.js";

app.setName("Emc²");
app.setAppUserModelId("dev.screen.aggregate-mail");
const isMac = process.platform === "darwin";
const explicitProfile = process.argv.some(
  (arg) => arg === "--user-data-dir" || arg.startsWith("--user-data-dir="),
);
if (
  explicitProfile &&
  (process.argv.some(
    (arg) => arg === "--user-data-dir" ||
      (arg.startsWith("--user-data-dir=") && !arg.slice("--user-data-dir=".length).trim()),
  ) || !app.commandLine.getSwitchValue("user-data-dir").trim())
) {
  console.error("Use --user-data-dir=<nonempty path> before --. The mail store was not opened.");
  app.exit(1);
}
const dataPath = app.getPath("userData");
const mailPath = path.join(dataPath, "mail");
const protectedKey = path.join(mailPath, "key.protected");
const identityPath = path.join(mailPath, "keychain-identity.json");
const retryFlag = "--emc2-legacy-keychain-retry";
const retried = process.argv.includes(retryFlag);
let keychainName = "Emc²";
let confirmedIdentity = false;
if (isMac && existsSync(protectedKey)) {
  try {
    const saved = JSON.parse(readFileSync(identityPath, "utf8"));
    if (
      (saved.name === "Emc²" || saved.name === LEGACY_APP_NAME) &&
      saved.protectedKeySha256 === createHash("sha256").update(readFileSync(protectedKey)).digest("hex")
    ) {
      keychainName = saved.name;
      confirmedIdentity = true;
    }
  } catch {
    // Missing or stale metadata cannot establish the protected key's identity.
  }
  if (retried) keychainName = LEGACY_APP_NAME;
}
if (isMac && keychainName === LEGACY_APP_NAME) {
  // Electron captures this name before ready; keep storage at the Emc² path.
  app.setName(keychainName);
  app.setPath("userData", dataPath);
}
let window: BrowserWindow | null = null;
let server: Server | undefined;
let tray: Tray | undefined;
let syncTimer: ReturnType<typeof setInterval> | undefined;
let quitting = false;
const origin = "http://127.0.0.1:32145";
const developing = !app.isPackaged && process.argv.includes("--dev");
const rendererOrigin = developing ? "http://127.0.0.1:5173" : origin;
const token = randomBytes(32).toString("hex");
const checking = process.argv.includes("--check-startup");
const showWindow = () => {
  if (window?.isMinimized()) window.restore();
  window?.show();
  window?.focus();
};

if (!app.requestSingleInstanceLock()) app.quit();
else {
  if (!explicitProfile)
    migrateLegacyUserData({ appData: app.getPath("appData"), target: dataPath });
  app.on("second-instance", showWindow);
  app.on("activate", showWindow);
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
      app.setName("Emc²");
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
      mkdirSync(mailPath, { recursive: true });
      if (!safeStorage.isEncryptionAvailable())
        throw new Error(
          "System credential encryption is unavailable. Your mail store was not opened.",
        );
      if (isMac && retried && !existsSync(protectedKey))
        throw new Error("The protected mail key is missing. Your mail store was not opened.");
      // Preserve the earlier client's data without moving or deleting its source files.
      let legacyKey: Buffer | undefined;
      if (
        !app.isPackaged &&
        !explicitProfile &&
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
      let key: string;
      if (existsSync(protectedKey)) {
        const bytes = readFileSync(protectedKey);
        try {
          key = safeStorage.decryptString(bytes);
          const decoded = Buffer.from(key, "base64");
          if (decoded.length !== 32 || decoded.toString("base64") !== key)
            throw new Error("The protected mail key is invalid. Your mail store was not opened.");
        } catch (error) {
          if (!isMac || retried || confirmedIdentity || keychainName !== "Emc²") throw error;
          const args = process.argv.slice(1);
          const separator = args.indexOf("--");
          args.splice(separator < 0 ? args.length : separator, 0, `--user-data-dir=${dataPath}`, retryFlag);
          app.releaseSingleInstanceLock();
          if (checking) {
            console.log(JSON.stringify({ startup: "retrying-legacy-keychain" }));
            // Keep check logs and final exit status attached to the original invocation.
            const child = spawn(process.execPath, args, { stdio: "inherit" });
            child.on("error", () => app.exit(1));
            child.on("close", (code) => app.exit(code ?? 1));
          } else {
            app.relaunch({ args });
            app.exit(0);
          }
          return;
        }
      } else {
        if (existsSync(path.join(mailPath, "mail.sqlite")))
          throw new Error("The protected mail key is missing. Your mail store was not opened.");
        key = (legacyKey || randomBytes(32)).toString("base64");
      }
      if (!existsSync(protectedKey))
        writeFileSync(protectedKey, safeStorage.encryptString(key));
      if (isMac && !confirmedIdentity) {
        const metadata = JSON.stringify({
          name: keychainName,
          protectedKeySha256: createHash("sha256").update(readFileSync(protectedKey)).digest("hex"),
        });
        writeFileSync(`${identityPath}.tmp`, metadata, { mode: 0o600 });
        renameSync(`${identityPath}.tmp`, identityPath);
      }
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
          showWindow();
        },
        () => window?.webContents.send("mail-changed"),
        (count) => {
          if (checking || !Notification.isSupported()) return;
          const notification = new Notification({
            title: "Emc²",
            body: `${count} new unread ${count === 1 ? "email" : "emails"}`,
          });
          notification.on("click", showWindow);
          notification.on("failed", (_event, error) =>
            console.error("Mail notification failed:", error),
          );
          notification.show();
        },
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
      const trayImage = nativeImage.createFromPath(
        path.join(app.getAppPath(), isMac ? "build/tray-icon.png" : "build/icon.png"),
      );
      if (isMac) {
        const image = trayImage.resize({ width: 16, height: 16 });
        image.setTemplateImage(true);
        tray = new Tray(image);
      } else if (process.platform === "linux") {
        tray = new Tray(trayImage.resize({ width: 22, height: 22 }));
      } else {
        tray = new Tray(trayImage);
      }
      tray.setToolTip("Emc²");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Open Emc²", click: showWindow },
          { type: "separator" },
          { label: "Quit", click: () => app.quit() },
        ]),
      );
      tray.on("click", showWindow);
      // Closing the window leaves the app, its mail service and its sync
      // running; only Quit in the tray menu or the system session ends it.
      window.on("close", (event) => {
        if (quitting) return;
        event.preventDefault();
        window?.hide();
      });
      window.on("session-end", () => {
        quitting = true;
      });
      // A maximized window fills the screen, so its corners square off.
      const reportWindowState = () =>
        window?.webContents.send("window-state", !!window?.isMaximized());
      window.on("maximize", reportWindowState);
      window.on("unmaximize", reportWindowState);
      window.webContents.on("context-menu", (_event, params) => {
        const items = editingMenu(params);
        if (items.length && window) Menu.buildFromTemplate(items).popup({ window });
      });
      window.on("app-command", (_event, command) => {
        if (command === "browser-backward" || command === "browser-forward")
          window?.webContents.send("mail-navigation", command === "browser-backward" ? "back" : "forward");
      });
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
        if (!window) return;
        showWindow();
        if (
          dialog.showMessageBoxSync(window, {
            type: "question",
            buttons: ["Keep editing", "Discard draft"],
            defaultId: 0,
            cancelId: 0,
            message: "Discard your draft?",
          }) === 1
        )
          event.preventDefault();
        else quitting = false;
      });
      // Entrance animations start at opacity 0 and a hidden window never runs
      // them, so ready-to-show alone can wait forever for a visible paint.
      const reveal = () => {
        if (!checking && !window?.isVisible()) window?.show();
      };
      window.once("ready-to-show", reveal);
      window.webContents.once("did-finish-load", reveal);
      await window.loadURL(rendererOrigin);
      if (!checking) {
        // A main-process timer keeps mail current while the window is hidden
        // and the renderer has no reason to paint.
        syncTimer = setInterval(() => {
          void backend.syncMail()
            .then(({ errors }) => {
              for (const error of errors) console.error(error);
            })
            .catch((error: unknown) => console.error(error));
        }, 300000);
      }
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
        // Closing the window must leave the app and its tray in place.
        window.close();
        if (window.isDestroyed() || window.isVisible() || !tray || tray.isDestroyed())
          throw new Error("Closing the window did not preserve the background app.");
        console.log(
          JSON.stringify({
            startup: "passed",
            packaged: app.isPackaged,
            electron: process.versions.electron,
            database: "opened",
            renderer: "loaded",
            hotReload: developing,
            isolatedApi: true,
            backgroundClose: true,
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
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("will-quit", () => {
    clearInterval(syncTimer);
    tray?.destroy();
    server?.close();
  });
}
