import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Updates, createUpdater, isHigherStableVersion, registerUpdateIpc, releaseAssets,
  unsupportedReason, validateCandidate, verifyInstaller } from "./updates.js";
import type { UpdateState } from "../shared/updates.js";

const target = { platform: "win32", arch: "x64", version: "0.1.6", packaged: true };
const bytes = Buffer.from("synthetic updater installer, never executable");
const digest = createHash("sha512").update(bytes).digest("base64");
const root = "https://github.com/screen-devs/aggregate-mail/releases/download/v0.1.7/";
const asset = (name: string, size = bytes.length) => ({ name, size, browser_download_url: root + encodeURIComponent(name) });
const name = "Emc²-0.1.7-win-x64.exe";
const release = () => ({ draft: false, prerelease: false, tag_name: "v0.1.7", assets: [asset(name), asset("latest.yml", 300)] });
const manifest = (overrides: Record<string, unknown> = {}) => JSON.stringify({ version: "0.1.7",
  files: [{ url: name, size: bytes.length, sha512: digest }], releaseDate: "2026-10-13T00:00:00Z", ...overrides });
const candidate = () => validateCandidate(releaseAssets(release(), target)!, manifest());
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

test("only canonical stable, strictly higher versions qualify, including installed CI versions", () => {
  for (const [next, installed, expected] of [
    ["0.1.7", "0.1.6", true], ["0.1.6", "0.1.6", false], ["0.1.5", "0.1.6", false],
    ["0.1.6", "0.1.6-ci.1.1", true], ["0.1.7-ci.1", "0.1.6", false],
    ["0.1.7+build", "0.1.6", false], ["01.1.7", "0.1.6", false],
    ["0.1.7", "0.1.6-01", false], ["9007199254740992.0.0", "0.1.6", false],
  ] as const) assert.equal(isHigherStableVersion(next, installed), expected, `${next}/${installed}`);
  assert.equal(releaseAssets({ ...release(), tag_name: "v0.1.6" }, target), null);
});

test("release preflight rejects foreign URLs, CI filenames, missing metadata and wrong or ambiguous architectures", () => {
  for (const invalid of [
    { ...release(), prerelease: true }, { ...release(), draft: true }, { ...release(), tag_name: "v0.1.7-ci.1" },
    { ...release(), assets: [asset(name, -1), asset("latest.yml")] },
    { ...release(), assets: [asset(name, 2 ** 31), asset("latest.yml")] },
    { ...release(), assets: [{ ...asset(name), browser_download_url: "https://example.test/update.exe" }, asset("latest.yml")] },
    { ...release(), assets: [asset("Emc²-0.1.7-ci.38281422233.1-win-x64.exe"), asset("latest.yml")] },
    { ...release(), assets: [asset("Emc²-0.1.7-win-arm64.exe"), asset("latest.yml")] },
    { ...release(), assets: [asset(name), asset(name), asset("latest.yml")] },
    { ...release(), assets: [asset(name), asset("Other-0.1.7-win-x64.exe"), asset("latest.yml")] },
    { ...release(), assets: [asset(name)] },
  ]) assert.throws(() => releaseAssets(invalid, target));
});

test("manifest identity, size, digest, source and unsupported metadata are checked before library download", () => {
  const found = releaseAssets(release(), target)!;
  assert.equal(validateCandidate(found, manifest()).version, "0.1.7");
  for (const invalid of [
    "invalid: [", manifest({ version: "0.1.7-ci.1" }), manifest({ packages: {} }), manifest({ stagingPercentage: 50 }),
    manifest({ path: "foreign.exe" }), manifest({ sha512: "wrong" }),
    manifest({ files: [] }), manifest({ files: [{ url: name, size: bytes.length, sha512: digest }, { url: name, size: bytes.length, sha512: digest }] }),
    manifest({ files: [{ url: "https://example.test/update.exe", size: bytes.length, sha512: digest }] }),
    manifest({ files: [{ url: "../" + name, size: bytes.length, sha512: digest }] }),
    manifest({ files: [{ url: name, size: bytes.length + 1, sha512: digest }] }),
    manifest({ files: [{ url: name, size: bytes.length, sha512: "invalid" }] }),
  ]) assert.throws(() => validateCandidate(found, invalid));
});

test("running app architecture wins, and ad-hoc macOS/development/non-AppImage installs stay disabled", () => {
  assert.equal(unsupportedReason(target), undefined);
  assert.equal(unsupportedReason({ ...target, packaged: false }), "development");
  assert.equal(unsupportedReason({ ...target, platform: "darwin", arch: "x64" }), "mac-signing", "Rosetta x64 must never select an arm64 installer");
  assert.equal(unsupportedReason({ ...target, platform: "darwin", arch: "arm64" }), "mac-signing");
  assert.equal(unsupportedReason({ ...target, platform: "linux" }), "appimage");
  assert.equal(unsupportedReason({ ...target, arch: "ia32" }), "platform");
  const linux = { ...target, platform: "linux", appImage: "/synthetic/Emc.AppImage" };
  const input = { ...release(), assets: [asset("Emc²-0.1.7-linux-x64.AppImage"), asset("latest-linux.yml")] };
  assert.equal(releaseAssets(input, linux)?.asset.name, "Emc²-0.1.7-linux-x64.AppImage");
  assert.throws(() => releaseAssets(input, { ...linux, arch: "arm64" }));
});

test("downloaded files must be nonsymlink regular files with matching size and a fresh digest", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "emc2-update-fixture-"));
  try {
    const file = path.join(directory, name);
    await writeFile(file, bytes);
    await verifyInstaller(file, candidate());
    await assert.rejects(verifyInstaller(directory, candidate()));
    await assert.rejects(verifyInstaller(name, candidate()));
    await writeFile(file, Buffer.alloc(bytes.length, 1));
    await assert.rejects(verifyInstaller(file, candidate()));
    await writeFile(file, bytes.subarray(1));
    await assert.rejects(verifyInstaller(file, candidate()));
    await writeFile(file, bytes);
    if (process.platform !== "win32") {
      const link = path.join(directory, "linked.exe");
      await symlink(file, link);
      await assert.rejects(verifyInstaller(link, candidate()));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("the actual pinned library disables automatic/downgrade paths and checks without staging-ID or network IO", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "emc2-update-library-"));
  const priorImage = process.env.APPIMAGE;
  process.env.APPIMAGE = "/synthetic/Emc.AppImage";
  const spy = { fail: false, calls: [] as (string | { command: string; args: string[] })[] };
  Object.assign(globalThis, { __updaterSynthetic: spy });
  try {
    const bundle = path.join(directory, "updater.cjs");
    await build({ entryPoints: ["desktop/updates.ts"], outfile: bundle, bundle: true, platform: "node", format: "cjs",
      plugins: [{ name: "synthetic-electron", setup(builder) {
        builder.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", namespace: "synthetic" }));
        builder.onResolve({ filter: /^(node:)?child_process$/ }, () => ({ path: "child", namespace: "synthetic" }));
        builder.onLoad({ filter: /.*/, namespace: "synthetic" }, ({ path: module }) => ({ contents: module === "electron" ? `
          import { EventEmitter } from 'node:events';
          export const app = Object.assign(new EventEmitter(), {
            getVersion: () => '0.1.6', getName: () => 'Emc²', isPackaged: true,
            whenReady: async () => {}, getPath: () => { throw Error('No profile or staging ID IO allowed'); },
            quit: () => { globalThis.__updaterSynthetic.calls.push('quit'); }
          });
          export const net = { request: () => { throw Error('No network allowed'); } };
        ` : `
          import { EventEmitter } from 'node:events';
          export function spawn(command, args) {
            const spy = globalThis.__updaterSynthetic;
            spy.calls.push({ command, args });
            const child = Object.assign(new EventEmitter(), { pid: spy.fail ? undefined : 123, unref() {} });
            if (spy.fail) queueMicrotask(() => child.emit('error', Object.assign(Error('Synthetic spawn failure'), { code: 'ENOENT' })));
            return child;
          }
          export function execFileSync() { throw Error('No native file replacement allowed in this test'); }
          export function spawnSync() { throw Error('No native command allowed in this test'); }
        ` }));
      } }] });
    const actual = createRequire(import.meta.url)(bundle) as typeof import("./updates.js");
    for (const platform of ["win32", "linux"]) {
      const updater = await actual.createUpdater(candidate(), { ...target, platform, appImage: "/synthetic/Emc.AppImage" });
      assert.equal(updater.autoDownload, false); assert.equal(updater.autoInstallOnAppQuit, false);
      assert.equal(updater.allowPrerelease, false); assert.equal(updater.allowDowngrade, false);
      assert.equal((await updater.checkForUpdates())?.isUpdateAvailable, true);
      assert.equal(updater.installerPath, null);
    }
    assert.deepEqual(spy.calls, []);
    for (const failure of [true, false]) {
      spy.fail = failure; spy.calls.length = 0;
      const updater = await actual.createUpdater(candidate(), target);
      Object.assign(updater, { downloadedUpdateHelper: { file: "/synthetic/update.exe", downloadedFileInfo: { isAdminRightsRequired: false } } });
      if (failure) {
        await assert.rejects(Promise.resolve(updater.quitAndInstall(false, true)), /Synthetic spawn failure/);
        assert.equal(spy.calls.length, 1, "No shell/elevation retry or quit after a failed launch");
      } else {
        await updater.quitAndInstall(false, true);
        assert.equal(spy.calls.at(-1), "quit");
      }
      assert.deepEqual(spy.calls[0], { command: "/synthetic/update.exe", args: ["--updated", "/S", "--force-run"] });
    }
  } finally {
    Reflect.deleteProperty(globalThis, "__updaterSynthetic");
    if (priorImage === undefined) delete process.env.APPIMAGE; else process.env.APPIMAGE = priorImage;
    await rm(directory, { recursive: true, force: true });
  }
});

function fixture(overrides: Partial<ConstructorParameters<typeof Updates>[0]> = {}) {
  const calls: string[] = [], states: UpdateState[] = [];
  const events = new EventEmitter();
  let download = async () => ["/synthetic/update.exe"];
  let acceptClose = true;
  let verify = async () => { calls.push("verify"); };
  const driver = Object.assign(events, {
    autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false, allowDowngrade: false,
    installerPath: "/synthetic/update.exe",
    checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: candidate().info, versionInfo: candidate().info }),
    downloadUpdate: async () => { calls.push("download"); return download(); },
    quitAndInstall: () => { calls.push("install"); },
  }) as unknown as Awaited<ReturnType<typeof createUpdater>>;
  const updates = new Updates({ target, publish: (state) => states.push(state),
    read: async (url) => {
      calls.push("read");
      assert.ok(url === "https://api.github.com/repos/screen-devs/aggregate-mail/releases/latest" || url === root + "latest.yml");
      return url.includes("api.github.com") ? JSON.stringify(release()) : manifest();
    },
    create: async () => driver,
    verify: async () => verify(),
    cancellation: async () => ({ cancel: () => { calls.push("cancel"); } }) as unknown as UpdaterCancellation,
    quiesce: async () => { calls.push("quiesce"); }, resume: () => calls.push("resume"),
    drainRenderer: async () => { calls.push("renderer-drained"); },
    closeWindow: async () => { calls.push("close"); return acceptClose; },
    restoreWindow: async () => { calls.push("restore"); }, ...overrides });
  return { updates, calls, states, events, driver, setDownload: (fn: typeof download) => { download = fn; },
    setVerify: (fn: typeof verify) => { verify = fn; }, setAccept: (value: boolean) => { acceptClose = value; } };
}
type UpdaterCancellation = NonNullable<Awaited<ReturnType<NonNullable<ConstructorParameters<typeof Updates>[0]["cancellation"]>>>>;

test("synthetic flow protects duplicate actions and reports progress, then drains and rehashes after accepted close", async () => {
  const f = fixture();
  assert.equal((await f.updates.command("check")).phase, "available");
  assert.ok(!f.calls.includes("download"));
  const gate = deferred<string[]>();
  f.setDownload(() => gate.promise);
  const downloading = f.updates.command("download");
  await Promise.resolve(); await Promise.resolve();
  f.events.emit("download-progress", { percent: 45 });
  assert.equal((await f.updates.command("download")).percent, 45);
  assert.equal(f.calls.filter((call) => call === "download").length, 1);
  gate.resolve(["/synthetic/update.exe"]);
  assert.equal((await downloading).phase, "ready");
  f.calls.length = 0;
  const install = f.updates.command("install");
  await f.updates.command("install");
  assert.equal((await install).phase, "installing");
  assert.deepEqual(f.calls, ["quiesce", "renderer-drained", "close", "verify", "install"]);
});

test("draft/sendUnknown close cancellation resumes mail and does not invoke installer", async () => {
  const f = fixture();
  await f.updates.command("check"); await f.updates.command("download");
  f.setAccept(false); f.calls.length = 0;
  assert.deepEqual(await f.updates.command("install"), { phase: "ready", version: "0.1.7", reason: "cancelled" });
  assert.deepEqual(f.calls, ["quiesce", "renderer-drained", "close", "resume"]);
  f.setAccept(true);
  assert.equal((await f.updates.command("install")).phase, "installing");
});

test("drain/renderer errors resume without closing, and a changed installer restores the closed window", async () => {
  for (const boundary of ["quiesce", "drainRenderer"] as const) {
    const f = fixture({ [boundary]: async () => { throw new Error("private raw error"); } });
    await f.updates.command("check"); await f.updates.command("download"); f.calls.length = 0;
    const state = await f.updates.command("install");
    assert.equal(state.reason, "mail-busy");
    assert.deepEqual(f.calls.filter((call) => ["close", "resume", "install"].includes(call)), ["resume"]);
    assert.ok(!JSON.stringify(state).includes("private"));
  }
  const f = fixture();
  await f.updates.command("check"); await f.updates.command("download"); f.calls.length = 0;
  f.setVerify(async () => { throw new Error("changed bytes"); });
  assert.equal((await f.updates.command("install")).reason, "verification");
  assert.deepEqual(f.calls, ["quiesce", "renderer-drained", "close", "restore", "resume"]);
});

test("an installer launch rejection restores the window and resumes mail without a retry", async () => {
  const f = fixture();
  await f.updates.command("check"); await f.updates.command("download"); f.calls.length = 0;
  f.driver.quitAndInstall = async () => { f.calls.push("launch-failed"); throw new Error("Synthetic launch failure"); };
  assert.equal((await f.updates.command("install")).reason, "installer");
  assert.deepEqual(f.calls, ["quiesce", "renderer-drained", "close", "verify", "launch-failed", "restore", "resume"]);
});

test("bounded download cancels once; unsupported builds and ordinary stop never install", async () => {
  const f = fixture({ timeouts: { download: 5, drain: 5 } });
  await f.updates.command("check");
  f.setDownload(() => new Promise(() => {}));
  assert.equal((await f.updates.command("download")).reason, "download");
  assert.equal(f.calls.filter((call) => call === "cancel").length, 1);
  const normal = fixture();
  await normal.updates.command("check"); await normal.updates.command("download"); normal.updates.stop();
  await normal.updates.command("install");
  assert.ok(!normal.calls.includes("install"));
  const mac = fixture({ target: { ...target, platform: "darwin" } });
  await mac.updates.command("check"); await mac.updates.command("download"); await mac.updates.command("install");
  assert.equal(mac.updates.snapshot().reason, "mac-signing"); assert.deepEqual(mac.calls, []);
});

test("download size overruns cancel once and never expose a ready installer", async () => {
  const f = fixture(); await f.updates.command("check");
  const gate = deferred<string[]>(); f.setDownload(() => gate.promise);
  const downloading = f.updates.command("download");
  await Promise.resolve(); await Promise.resolve();
  for (let i = 0; i < 2; i++) f.events.emit("download-progress", { percent: 100, total: bytes.length + 1, transferred: bytes.length + 1 });
  gate.resolve(["/synthetic/update.exe"]);
  assert.equal((await downloading).reason, "verification");
  assert.equal(f.calls.filter((call) => call === "cancel").length, 1);
  assert.ok(!f.calls.includes("install"));
});

test("update IPC authenticates the main renderer frame and accepts only a command enum with no extra arguments", async () => {
  const f = fixture();
  const handlers = new Map<string, (event: { sender: unknown; senderFrame: unknown }, ...args: unknown[]) => unknown>();
  let url = "http://127.0.0.1:32145/";
  const contents = { mainFrame: {}, getURL: () => url };
  registerUpdateIpc({ handle: (channel, handler) => { handlers.set(channel, handler); } }, () => contents, "http://127.0.0.1:32145", f.updates);
  const good = { sender: contents, senderFrame: contents.mainFrame };
  const command = handlers.get("update-command")!, state = handlers.get("update-state")!;
  assert.deepEqual(state(good), { phase: "idle" });
  for (const event of [{ sender: {}, senderFrame: contents.mainFrame }, { sender: contents, senderFrame: {} }])
    assert.throws(() => command(event, "check"), /rejected/);
  for (const args of [[], ["https://example.test"], ["check", "extra"], [{ command: "install" }]])
    assert.throws(() => command(good, ...args), /rejected/);
  assert.throws(() => state(good, "extra"));
  url = "https://example.test/"; assert.throws(() => command(good, "check"));
  url = "http://127.0.0.1:32145/foreign"; assert.throws(() => command(good, "check"));
  url = "http://127.0.0.1:32145/";
  assert.equal((await command(good, "check") as UpdateState).phase, "available");
});
