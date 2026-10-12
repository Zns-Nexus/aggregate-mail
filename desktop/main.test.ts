import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import { build } from "esbuild";
import { LEGACY_APP_NAME, MIGRATION_MARKER } from "./migrate.js";

const root = mkdtempSync(path.join(tmpdir(), "emc2-startup-"));
after(() => rmSync(root, { recursive: true, force: true }));
const bundle = path.join(root, "main.cjs");

// Mock only Electron and the backend boundary; run the actual main process in
// separate processes, including its retry, with real files and authenticated bytes.
await build({
  entryPoints: ["desktop/main.ts"], outfile: bundle, bundle: true,
  platform: "node", format: "cjs", packages: "external",
  plugins: [{ name: "startup-adapters", setup(builder) {
    builder.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", namespace: "fixture" }));
    builder.onResolve({ filter: /server\/index\.js$/ }, () => ({ path: "backend", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: module }) => ({
      loader: "js", contents: module === "electron" ? `
        import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
        import path from 'node:path';
        import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
        const config = JSON.parse(process.env.TEST_STARTUP);
        Object.defineProperty(process, 'platform', { value: config.platform || 'darwin' });
        let name = 'Emc²', fixedPath, identity;
        // Chromium stops switches at -- and only equals-form carries a value.
        const separator = process.argv.indexOf('--');
        const switches = separator < 0 ? process.argv : process.argv.slice(0, separator);
        const explicit = switches.filter(arg => arg === '--user-data-dir' || arg.startsWith('--user-data-dir=')).at(-1);
        const requestedPath = explicit?.startsWith('--user-data-dir=') ? explicit.slice('--user-data-dir='.length) : undefined;
        const lock = path.join(config.appData, 'test-lock');
        let locked = false;
        function release() { if (locked) { unlinkSync(lock); locked = false; } }
        export const app = {
          isPackaged: config.packaged !== false,
          commandLine: { getSwitchValue() { return requestedPath || ''; } },
          setName(value) { name = value; }, setAppUserModelId() {},
          getPath(kind) {
            if (kind === 'userData' && config.forbidDefault && !fixedPath && !requestedPath)
              throw Error('Default profile accessed');
            return kind === 'appData' ? config.appData :
              fixedPath || requestedPath || path.join(config.appData, name);
          },
          setPath(kind, value) {
            if (!existsSync(value)) throw Error('Electron setPath requires an existing directory');
            if (kind === 'userData') fixedPath = value;
          },
          getAppPath() { return process.cwd(); },
          requestSingleInstanceLock() {
            if (existsSync(lock)) return false;
            writeFileSync(lock, '', {flag: 'wx'}); locked = true; return true;
          }, releaseSingleInstanceLock() { release(); },
          relaunch(options) { console.log(JSON.stringify({relaunch: options.args})); },
          on() {}, whenReady() { identity = name; return Promise.resolve(); },
          quit() { release(); process.exit(0); }, exit(code) { release(); process.exit(code); }
        };
        export const safeStorage = {
          isEncryptionAvailable() { return config.available !== false; },
          decryptString(bytes) {
            const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(identity).digest(), bytes.subarray(0,12));
            decipher.setAuthTag(bytes.subarray(12,28));
            return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString();
          },
          encryptString(text) {
            const iv = randomBytes(12);
            const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(identity).digest(), iv);
            const bytes = Buffer.concat([cipher.update(text), cipher.final()]);
            return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
          }
        };
        export const dialog = { showErrorBox() {} }, ipcMain = { on() {} }, shell = {};
        export const Menu = {
          buildFromTemplate() { return { items: [{ submenu: { items:
            ['quit','close','undo','cut','copy','paste','selectall'].map(role => ({role}))
          }}] }; },
          setApplicationMenu(menu) { this.menu = menu; }, getApplicationMenu() { return this.menu; }
        };
        export const session = { fromPartition() { return {
          webRequest: { onBeforeSendHeaders() {} }, setPermissionRequestHandler() {}, setPermissionCheckHandler() {}
        }; }};
        export class Tray {
          destroyed = false;
          setToolTip() {} setContextMenu() {} on() {}
          isDestroyed() { return this.destroyed; }
          destroy() { this.destroyed = true; }
        }
        export class Notification {
          static isSupported() { return true; }
          constructor(options) { this.options = options; }
          on() {} show() {}
        }
        export class BrowserWindow {
          destroyed = false; visible = false; handlers = new Map();
          webContents = { setWindowOpenHandler() {}, on() {}, once() {} };
          on(event, handler) {
            this.handlers.set(event, [...(this.handlers.get(event) || []), handler]);
          }
          once() {} async loadURL() {}
          isVisible() { return this.visible; }
          isDestroyed() { return this.destroyed; }
          isMinimized() { return false; }
          isMaximized() { return false; }
          show() { this.visible = true; }
          hide() { this.visible = false; }
          focus() {} restore() {} minimize() {} maximize() {} unmaximize() {}
          close() {
            let prevented = false;
            for (const handler of this.handlers.get('close') || [])
              handler({ preventDefault() { prevented = true; } });
            if (prevented) return;
            this.destroyed = true; this.visible = false;
          }
        }
        globalThis.fetch = async (_url, options) => ({ ok: !!options, status: options ? 200 : 403 });
      ` : `
        import { readFileSync, existsSync } from 'node:fs';
        import { createDecipheriv } from 'node:crypto';
        import path from 'node:path';
        const key = Buffer.from(process.env.MAIL_DATA_KEY, 'base64');
        export async function startServer() {
          const file = path.join(process.env.MAIL_DATA_DIR, 'mail.sqlite');
          if (existsSync(file)) {
            const bytes = readFileSync(file);
            const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0,12));
            decipher.setAuthTag(bytes.subarray(12,28));
            const value = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString();
            if (value !== 'synthetic cached mail') throw Error('Saved mail changed');
          }
          console.log('backend: opened');
          return { close() {} };
        }
        export async function syncMail() { return { errors: [] }; }
      `,
    }));
  }}],
});

function encrypt(key: Buffer, text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(text), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

function fixture(identity: string, location = "Emc²", plaintext?: string) {
  const appData = mkdtempSync(path.join(root, "profile-"));
  const profile = path.join(appData, location);
  const mail = path.join(profile, "mail");
  mkdirSync(mail, { recursive: true });
  const key = randomBytes(32);
  const protectedBytes = encrypt(createHash("sha256").update(identity).digest(), plaintext ?? key.toString("base64"));
  const databaseBytes = encrypt(key, "synthetic cached mail");
  writeFileSync(path.join(mail, "key.protected"), protectedBytes);
  writeFileSync(path.join(mail, "mail.sqlite"), databaseBytes);
  return { appData, profile, protectedBytes, databaseBytes };
}

function launch(appData: string, options: Record<string, unknown> = {}, args: string[] = [], checking = true) {
  return spawnSync(process.execPath, [bundle, ...(checking ? ["--check-startup"] : []), ...args], {
    env: { ...process.env, TEST_STARTUP: JSON.stringify({ appData, ...options }) },
    encoding: "utf8", timeout: 10000,
  });
}

function preserved(profile: string, saved: ReturnType<typeof fixture>) {
  assert.deepEqual(readFileSync(path.join(profile, "mail/key.protected")), saved.protectedBytes);
  assert.deepEqual(readFileSync(path.join(profile, "mail/mail.sqlite")), saved.databaseBytes);
}

function passed(result: ReturnType<typeof launch>, retries: number) {
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"startup":"passed"/);
  assert.match(result.stdout, /"backgroundClose":true/);
  assert.match(result.stdout, /backend: opened/);
  assert.equal((result.stdout.match(/"startup":"retrying-legacy-keychain"/g) || []).length, retries);
}

test("first upgrade restarts once, opens saved mail, and later launches without retry", () => {
  const old = fixture(LEGACY_APP_NAME, LEGACY_APP_NAME);
  passed(launch(old.appData), 1);
  const current = path.join(old.appData, "Emc²");
  preserved(current, old);
  assert.equal(existsSync(path.join(current, "mail/keychain-identity.json")), true);
  passed(launch(old.appData), 0);
  preserved(current, old);
});

test("default legacy startup retry keeps generated switches before the first terminator", () => {
  const old = fixture(LEGACY_APP_NAME, LEGACY_APP_NAME);
  passed(launch(old.appData, {}, ["--", "original-argument"]), 1);
  preserved(path.join(old.appData, "Emc²"), old);
});

test("already-migrated legacy profile retries with the same explicit profile", () => {
  const old = fixture(LEGACY_APP_NAME);
  writeFileSync(path.join(old.profile, MIGRATION_MARKER), "");
  passed(launch(old.appData, {}, [`--user-data-dir=${old.profile}`]), 1);
  preserved(old.profile, old);
  passed(launch(old.appData, {}, [`--user-data-dir=${old.profile}`]), 0);
  preserved(old.profile, old);
});

test("current collision profile stays current despite a migration marker", () => {
  const current = fixture("Emc²");
  const legacy = path.join(current.appData, LEGACY_APP_NAME);
  mkdirSync(path.join(legacy, "mail"), { recursive: true });
  writeFileSync(path.join(legacy, "mail/key.protected"), "unrelated legacy bytes");
  passed(launch(current.appData), 0);
  assert.equal(existsSync(path.join(current.profile, MIGRATION_MARKER)), true);
  preserved(current.profile, current);
  assert.equal(readFileSync(path.join(legacy, "mail/key.protected"), "utf8"), "unrelated legacy bytes");
  passed(launch(current.appData), 0);
});

test("fresh explicit profile never imports default legacy or development data", () => {
  const old = fixture(LEGACY_APP_NAME, LEGACY_APP_NAME);
  const temporary = path.join(old.appData, "temporary");
  // Launch from a synthetic development directory with importable .data files.
  const development = path.join(old.appData, "development");
  mkdirSync(path.join(development, ".data"), { recursive: true });
  writeFileSync(path.join(development, ".data/key"), randomBytes(32));
  writeFileSync(path.join(development, ".data/mail.sqlite"), "must not be opened");
  const result = spawnSync(process.execPath, [bundle, "--check-startup", `--user-data-dir=${temporary}`], {
    cwd: development,
    env: { ...process.env, TEST_STARTUP: JSON.stringify({ appData: old.appData, packaged: false }) },
    encoding: "utf8", timeout: 10000,
  });
  passed(result, 0);
  preserved(old.profile, old);
  assert.equal(existsSync(path.join(temporary, MIGRATION_MARKER)), false);
  assert.equal(existsSync(path.join(temporary, "mail/mail.sqlite")), false);
  passed(launch(old.appData, {}, [`--user-data-dir=${temporary}`]), 0);
});

test("split, bare and empty profile arguments stop before accessing the saved default profile", () => {
  const saved = fixture("Emc²");
  const temporary = path.join(saved.appData, "temporary profile");
  const entries = readdirSync(saved.profile, { recursive: true });
  for (const args of [
    ["--user-data-dir", temporary],
    ["--user-data-dir"],
    ["--user-data-dir="],
    ["--user-data-dir=   "],
    ["--user-data-dir", ""],
    [`--user-data-dir=${temporary}`, "--user-data-dir="],
    [`--user-data-dir=${temporary}`, "--user-data-dir"],
    ["--", `--user-data-dir=${temporary}`],
    ["--", "--user-data-dir", temporary],
  ]) {
    const result = launch(saved.appData, { forbidDefault: true }, args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Use --user-data-dir=<nonempty path>/);
    assert.doesNotMatch(result.stderr, /Default profile accessed/);
    assert.doesNotMatch(result.stdout, /backend: opened|retrying|"startup":"passed"/);
    preserved(saved.profile, saved);
    assert.deepEqual(readdirSync(saved.profile, { recursive: true }), entries);
    assert.equal(existsSync(temporary), false);
  }
  passed(launch(saved.appData, { forbidDefault: true }, [`--user-data-dir=${temporary}`]), 0);
  preserved(saved.profile, saved);
  assert.deepEqual(readdirSync(saved.profile, { recursive: true }), entries);
});

test("unavailable encryption stops without retry, metadata or byte changes", () => {
  for (const identity of ["Emc²", LEGACY_APP_NAME]) {
    const saved = fixture(identity);
    const result = launch(saved.appData, { available: false });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /System credential encryption is unavailable/);
    assert.doesNotMatch(result.stdout, /retrying|backend: opened/);
    assert.equal(existsSync(path.join(saved.profile, "mail/keychain-identity.json")), false);
    preserved(saved.profile, saved);
  }
});

test("unrecoverable ciphertext retries once and forwards child failure without persisting identity", () => {
  const saved = fixture("unrecognized identity");
  const result = launch(saved.appData);
  assert.equal(result.status, 1);
  assert.equal((result.stdout.match(/retrying-legacy-keychain/g) || []).length, 1);
  assert.doesNotMatch(result.stdout, /backend: opened|"startup":"passed"/);
  assert.equal(existsSync(path.join(saved.profile, "mail/keychain-identity.json")), false);
  preserved(saved.profile, saved);
});

test("noncanonical and short decrypted keys never open the backend or persist identity", () => {
  for (const text of ["short", "A".repeat(43) + "= ", "A".repeat(42) + "B="]) {
    const saved = fixture(LEGACY_APP_NAME, "Emc²", text);
    const result = launch(saved.appData);
    assert.equal(result.status, 1);
    assert.equal((result.stdout.match(/retrying-legacy-keychain/g) || []).length, 1);
    assert.doesNotMatch(result.stdout, /backend: opened|"startup":"passed"/);
    assert.equal(existsSync(path.join(saved.profile, "mail/keychain-identity.json")), false);
    preserved(saved.profile, saved);
  }
});

test("missing protected key cannot replace an existing encrypted database key", () => {
  const saved = fixture("Emc²");
  rmSync(path.join(saved.profile, "mail/key.protected"));
  const result = launch(saved.appData);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /protected mail key is missing/);
  assert.doesNotMatch(result.stdout, /retrying|backend: opened/);
  assert.equal(existsSync(path.join(saved.profile, "mail/key.protected")), false);
  assert.deepEqual(readFileSync(path.join(saved.profile, "mail/mail.sqlite")), saved.databaseBytes);
});

test("successful canonical key decryption cannot hide an unreadable saved database", () => {
  const saved = fixture(LEGACY_APP_NAME, "Emc²", "A".repeat(43) + "=");
  const result = launch(saved.appData);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /backend: opened|"startup":"passed"/);
  preserved(saved.profile, saved);
});

test("stale identity metadata cannot force current protected bytes onto legacy Keychain", () => {
  const current = fixture("Emc²");
  writeFileSync(path.join(current.profile, "mail/keychain-identity.json"), JSON.stringify({
    name: LEGACY_APP_NAME, protectedKeySha256: "0".repeat(64),
  }));
  passed(launch(current.appData), 0);
  preserved(current.profile, current);
  assert.equal(JSON.parse(readFileSync(path.join(current.profile, "mail/keychain-identity.json"), "utf8")).name, "Emc²");
});

test("confirmed legacy identity fails closed if Keychain becomes unavailable or changes", () => {
  const saved = fixture("unrecognized identity");
  const metadata = JSON.stringify({ name: LEGACY_APP_NAME,
    protectedKeySha256: createHash("sha256").update(saved.protectedBytes).digest("hex") });
  writeFileSync(path.join(saved.profile, "mail/keychain-identity.json"), metadata);
  const result = launch(saved.appData);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /retrying|backend: opened/);
  assert.equal(readFileSync(path.join(saved.profile, "mail/keychain-identity.json"), "utf8"), metadata);
  preserved(saved.profile, saved);
});

test("Windows keeps its current identity and never uses a legacy retry or metadata", () => {
  const current = fixture("Emc²");
  passed(launch(current.appData, { platform: "win32" }), 0);
  preserved(current.profile, current);
  assert.equal(existsSync(path.join(current.profile, "mail/keychain-identity.json")), false);
  const old = fixture(LEGACY_APP_NAME);
  const failed = launch(old.appData, { platform: "win32" });
  assert.equal(failed.status, 1);
  assert.doesNotMatch(failed.stdout, /retrying|backend: opened/);
  preserved(old.profile, old);
});

test("normal legacy startup relaunches without a supervisor or backend", () => {
  const old = fixture(LEGACY_APP_NAME);
  const result = launch(old.appData, {}, [`--user-data-dir=${old.profile}`, "--", "original-argument"], false);
  assert.equal(result.status, 0);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.relaunch.includes(`--user-data-dir=${old.profile}`), true);
  assert.equal(receipt.relaunch.includes("--emc2-legacy-keychain-retry"), true);
  assert.equal(receipt.relaunch.includes("--check-startup"), false);
  const separator = receipt.relaunch.indexOf("--");
  assert.equal(receipt.relaunch.indexOf("--emc2-legacy-keychain-retry") < separator, true);
  assert.deepEqual(receipt.relaunch.slice(separator), ["--", "original-argument"]);
  assert.equal(receipt.relaunch[0], bundle);
  assert.doesNotMatch(result.stdout, /backend: opened|retrying/);
  assert.equal(existsSync(path.join(old.profile, "mail/keychain-identity.json")), false);
  assert.equal(existsSync(path.join(old.appData, "test-lock")), false);
  preserved(old.profile, old);
});
