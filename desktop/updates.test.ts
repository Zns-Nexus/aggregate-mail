import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
const name = "Emc2-0.1.7-win-x64.exe";
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
    { ...release(), assets: [asset("Emc2-0.1.7-ci.38281422233.1-win-x64.exe"), asset("latest.yml")] },
    { ...release(), assets: [asset("Emc2-0.1.7-win-arm64.exe"), asset("latest.yml")] },
    { ...release(), assets: [asset(name), asset(name), asset("latest.yml")] },
    { ...release(), assets: [asset(name), asset("Other-0.1.7-win-x64.exe"), asset("latest.yml")] },
    { ...release(), assets: [asset(name)] },
  ]) assert.throws(() => releaseAssets(invalid, target));
});

test("release filenames survive GitHub upload and match builder architecture names", () => {
  for (const [platform, filename, manifestName] of [
    ["win32", "Emc2-0.1.7-win-x64.exe", "latest.yml"],
    ["linux", "Emc2-0.1.7-linux-x86_64.AppImage", "latest-linux.yml"],
  ]) {
    const assets = [asset(filename), asset(manifestName, 300)];
    const found = releaseAssets({ ...release(), assets }, { ...target, platform, appImage: "/synthetic/Emc.AppImage" });
    assert.equal(found?.asset.name, filename);
  }
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
  const input = { ...release(), assets: [asset("Emc2-0.1.7-linux-x86_64.AppImage"), asset("latest-linux.yml")] };
  assert.equal(releaseAssets(input, linux)?.asset.name, "Emc2-0.1.7-linux-x86_64.AppImage");
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

async function libraryFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "emc2-update-library-"));
  const priorImage = process.env.APPIMAGE;
  process.env.APPIMAGE = "/synthetic/Emc.AppImage";
  const spy = { fail: false, moveFailure: false, chunks: null as Buffer[] | null, headers: {} as Record<string, string>,
    written: 0, flushed: undefined as (() => void) | undefined,
    holdResponse: false, networkAttempts: 0,
    cacheReads: {} as Record<string, number>, holdCacheRead: false,
    cacheStarted: undefined as (() => void) | undefined, cacheRelease: undefined as (() => void) | undefined,
    cacheClosed: 0, handleClosed: 0,
    cacheOnStream: undefined as ((file: string) => void) | undefined,
    calls: [] as (string | { command: string; args: string[] })[] };
  Object.assign(globalThis, { __updaterSynthetic: spy });
  try {
    const bundle = path.join(directory, "updater.cjs");
    await build({ entryPoints: ["desktop/updates.ts"], outfile: bundle, bundle: true, platform: "node", format: "cjs",
      plugins: [{ name: "synthetic-electron", setup(builder) {
        builder.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", namespace: "synthetic" }));
        builder.onResolve({ filter: /^(node:)?child_process$/ }, () => ({ path: "child", namespace: "synthetic" }));
        builder.onResolve({ filter: /^node:fs\/promises$/ }, ({ namespace }) => namespace === "synthetic-promises"
          ? { path: "node:fs/promises", external: true } : { path: "fs/promises", namespace: "synthetic-promises" });
        builder.onResolve({ filter: /^(node:)?fs$/ }, ({ namespace, importer }) => {
          if (namespace === "synthetic-fs") return { path: "node:fs", external: true };
          if (/(?:httpExecutor\.js|DownloadedUpdateHelper\.js|desktop[/\\]updates\.ts)$/.test(importer)) return { path: "fs", namespace: "synthetic-fs" };
        });
        const observeCacheStream = `
          function observe(file, stream) {
            const spy = globalThis.__updaterSynthetic;
            if (spy.holdCacheRead) {
              const read = stream._read;
              stream._read = () => {};
              spy.cacheRelease = () => { if (!stream.destroyed) { stream._read = read; read.call(stream, 65536); } };
            }
            stream.on('data', chunk => { spy.cacheReads[file] = (spy.cacheReads[file] || 0) + chunk.length; });
            stream.on('close', () => { spy.cacheClosed++; });
            queueMicrotask(() => spy.cacheStarted?.());
            return stream;
          }
        `;
        builder.onLoad({ filter: /.*/, namespace: "synthetic-promises" }, () => ({ contents: `
          export * from 'node:fs/promises';
          import { open as realOpen } from 'node:fs/promises';
          ${observeCacheStream}
          export async function open(file, ...args) {
            const handle = await realOpen(file, ...args);
            const createReadStream = handle.createReadStream, close = handle.close;
            let closed = false;
            handle.createReadStream = function(options) {
              globalThis.__updaterSynthetic.cacheOnStream?.(file);
              return observe(file, createReadStream.call(this, options));
            };
            handle.close = function() { return close.call(this).finally(() => {
              if (!closed) { closed = true; globalThis.__updaterSynthetic.handleClosed++; }
            }); };
            return handle;
          }
        ` }));
        builder.onLoad({ filter: /.*/, namespace: "synthetic-fs" }, () => ({ contents: `
          export * from 'node:fs';
          import { createWriteStream as realCreateWriteStream, createReadStream as realCreateReadStream } from 'node:fs';
          ${observeCacheStream}
          export function createReadStream(file, options) {
            globalThis.__updaterSynthetic.cacheOnStream?.(file);
            return observe(file, realCreateReadStream(file, options));
          }
          export function createWriteStream(...args) {
            const output = realCreateWriteStream(...args), write = output.write;
            output.write = function(chunk, encoding, callback) {
              const spy = globalThis.__updaterSynthetic;
              spy.written += chunk.length;
              const done = typeof encoding === 'function' ? encoding : callback;
              return write.call(this, chunk, typeof encoding === 'string' ? encoding : undefined, (error) => {
                spy.flushed?.();
                done?.(error);
              });
            };
            return output;
          }
        ` }));
        builder.onLoad({ filter: /.*/, namespace: "synthetic" }, ({ path: module }) => ({ contents: module === "electron" ? `
          import { EventEmitter } from 'node:events';
          import { Readable } from 'node:stream';
          export const app = Object.assign(new EventEmitter(), {
            getVersion: () => '0.1.6', getName: () => 'Emc²', isPackaged: true,
            whenReady: async () => {}, getPath: () => { throw Error('No profile or staging ID IO allowed'); },
            quit: () => { globalThis.__updaterSynthetic.calls.push('quit'); }
          });
          export const session = { fromPartition: () => ({}) };
          export const net = { request: () => {
            const spy = globalThis.__updaterSynthetic;
            spy.networkAttempts++;
            if (!spy.chunks) throw Error('No network allowed');
            let response;
            return Object.assign(new EventEmitter(), {
              end() {
                // Delay each next chunk/EOF until the preceding real file write settles.
                response = Object.assign(Readable.from((async function*() {
                  for (const chunk of spy.chunks) {
                    const flushed = new Promise(resolve => { spy.flushed = resolve; });
                    yield chunk;
                    await flushed;
                  }
                })()), { statusCode: 200, headers: spy.headers });
                const destroy = response.destroy;
                response.destroy = function(...args) { spy.flushed?.(); return destroy.apply(this, args); };
                if (!spy.holdResponse) queueMicrotask(() => this.emit('response', response));
              },
              abort() { spy.calls.push('abort'); spy.flushed?.(); response?.destroy(); }
            });
          } };
        ` : `
          import { EventEmitter } from 'node:events';
          import { renameSync, writeFileSync } from 'node:fs';
          export function spawn(command, args) {
            const spy = globalThis.__updaterSynthetic;
            spy.calls.push({ command, args });
            const child = Object.assign(new EventEmitter(), { pid: spy.fail ? undefined : 123, unref() {} });
            if (spy.fail) queueMicrotask(() => child.emit('error', Object.assign(Error('Synthetic spawn failure'), { code: 'ENOENT' })));
            return child;
          }
          export function execFileSync(command, args) {
            if (command !== 'mv') throw Error('No native command allowed in this test');
            const spy = globalThis.__updaterSynthetic;
            spy.calls.push({ command, args });
            if (spy.moveFailure) {
              writeFileSync(args[2], 'partial synthetic copy');
              throw Object.assign(Error('Synthetic move failure'), { code: 'ENOSPC' });
            }
            renameSync(args[1], args[2]);
          }
          export function spawnSync() { throw Error('No native command allowed in this test'); }
        ` }));
      } }] });
    const actual = createRequire(import.meta.url)(bundle) as typeof import("./updates.js");
    return { actual, directory, spy, async cleanup() {
      Reflect.deleteProperty(globalThis, "__updaterSynthetic");
      if (priorImage === undefined) delete process.env.APPIMAGE; else process.env.APPIMAGE = priorImage;
      await rm(directory, { recursive: true, force: true });
    } };
  } catch (error) {
    Reflect.deleteProperty(globalThis, "__updaterSynthetic");
    if (priorImage === undefined) delete process.env.APPIMAGE; else process.env.APPIMAGE = priorImage;
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function cachedUpdater(f: Awaited<ReturnType<typeof libraryFixture>>, selected = candidate(), platform = "win32") {
  const updater = await f.actual.createUpdater(selected, { ...target, platform, appImage: "/synthetic/Emc.AppImage" });
  const config = path.join(f.directory, "app-update.yml");
  await writeFile(config, "updaterCacheDirName: synthetic-cache\n");
  const configured = updater as unknown as { updateConfigPath: string; app: object };
  configured.updateConfigPath = config;
  Object.defineProperty(configured.app, "baseCachePath", { value: f.directory });
  const pending = path.join(f.directory, "synthetic-cache", "pending");
  await mkdir(pending, { recursive: true });
  const file = path.join(pending, selected.asset.name);
  await writeFile(path.join(pending, "update-info.json"), JSON.stringify({ fileName: selected.asset.name,
    sha512: selected.sha512, isAdminRightsRequired: false }));
  await updater.checkForUpdates();
  return { updater, file, pending };
}

test("actual downloadUpdate rejects oversized regular and symlink caches before reading installer bytes", async (t) => {
  for (const platform of ["win32", "linux"]) for (const kind of ["oversized", "symlink"]) {
    if (kind === "symlink" && process.platform === "win32") continue;
    await t.test(`${platform}/${kind}`, async () => {
      const f = await libraryFixture();
      try {
        const selected = platform === "win32" ? candidate() : validateCandidate(releaseAssets({ ...release(),
          assets: [asset("Emc2-0.1.7-linux-x86_64.AppImage"), asset("latest-linux.yml", 300)] },
        { ...target, platform, appImage: "/synthetic/Emc.AppImage" })!, manifest({ files: [
          { url: "Emc2-0.1.7-linux-x86_64.AppImage", size: bytes.length, sha512: digest } ] }));
        const { updater, file } = await cachedUpdater(f, selected, platform);
        if (kind === "oversized") await writeFile(file, Buffer.alloc(4096, 7));
        else {
          const outside = path.join(f.directory, "outside.exe");
          await writeFile(outside, Buffer.alloc(4096, 7));
          await symlink(outside, file);
        }
        await assert.rejects(updater.downloadUpdate(), /No network allowed/);
        assert.equal(f.spy.cacheReads[file] || 0, 0, "Unsafe cache must be rejected before a byte is read");
        assert.equal(f.spy.networkAttempts, 1, "Cache miss may use only the normal library downloader");
        assert.equal(updater.installerPath, null);
      } finally { await f.cleanup(); }
    });
  }
});

test("actual downloadUpdate reuses verified cache and rehashes same-instance changes", async () => {
  const f = await libraryFixture();
  try {
    const { updater, file } = await cachedUpdater(f);
    await writeFile(path.join(f.directory, "app-update.yml"), "updaterCacheDirName: synthetic-cache\npublisherName: Synthetic Publisher\n");
    let signatures = 0;
    (updater as unknown as { verifyUpdateCodeSignature: (names: string[], file: string) => Promise<null> }).verifyUpdateCodeSignature = async (names, file) => {
      assert.deepEqual(names, ["Synthetic Publisher"]);
      assert.deepEqual(await readFile(file), bytes);
      signatures++;
      return null;
    };
    await writeFile(file, bytes);
    assert.deepEqual(await updater.downloadUpdate(), [file]);
    assert.equal(f.spy.cacheReads[file], bytes.length);
    assert.equal(f.spy.networkAttempts, 0);
    assert.equal(updater.installerPath, file);
    // The inherited same-instance shortcut must not accept changed bytes.
    await writeFile(file, Buffer.alloc(bytes.length, 8));
    f.spy.chunks = [bytes];
    assert.deepEqual(await updater.downloadUpdate(), [file]);
    assert.equal(f.spy.networkAttempts, 1);
    assert.equal(signatures, 1, "The library must preserve configured publisher verification for the fresh download");
    assert.deepEqual(await readFile(file), bytes);
    assert.equal(f.spy.handleClosed, 2, "Each cache verification closes its file handle");
  } finally { await f.cleanup(); }
});

test("actual downloadUpdate ignores cached metadata paths even on a new instance", async () => {
  const f = await libraryFixture();
  try {
    const { updater, file, pending } = await cachedUpdater(f);
    await writeFile(file, bytes);
    const outside = path.join(f.directory, "outside.exe");
    await writeFile(outside, Buffer.alloc(4096, 7));
    await writeFile(path.join(pending, "update-info.json"), JSON.stringify({ fileName: "../../outside.exe", sha512: digest }));
    assert.deepEqual(await updater.downloadUpdate(), [file]);
    assert.equal(f.spy.networkAttempts, 0);
    assert.equal(f.spy.cacheReads[outside] || 0, 0, "Metadata cannot select a path to hash");
    assert.equal(f.spy.cacheReads[file], bytes.length);
  } finally { await f.cleanup(); }
});

test("actual downloadUpdate caps cache bytes even when the file grows after the size check", async () => {
  const f = await libraryFixture();
  try {
    const { updater, file } = await cachedUpdater(f);
    await writeFile(file, bytes);
    f.spy.cacheOnStream = (reading) => {
      if (reading === file) writeFileSync(file, Buffer.concat([bytes, Buffer.alloc(4096, 7)]));
    };
    await assert.rejects(updater.downloadUpdate(), /No network allowed/);
    assert.equal(f.spy.cacheReads[file], bytes.length, "Growth must not expand the candidate's read limit");
    assert.equal(updater.installerPath, null);
  } finally { await f.cleanup(); }
});

test("actual downloadUpdate cache hashing stops on timeout, explicit cancellation and ordinary stop", async (t) => {
  for (const mode of ["timeout", "cancel", "stop"]) await t.test(mode, async () => {
    const f = await libraryFixture();
    let libraryDownload: Promise<unknown> | undefined;
    try {
      const { updater, file } = await cachedUpdater(f);
      await writeFile(file, bytes);
      f.spy.holdCacheRead = true;
      const started = deferred<void>();
      f.spy.cacheStarted = () => started.resolve();
      const { CancellationToken } = await import("builder-util-runtime");
      const token = new CancellationToken();
      let cancellations = 0;
      token.on("cancel", () => { cancellations++; });
      const flow = fixture({ create: async () => updater, cancellation: async () => token,
        timeouts: { download: mode === "timeout" ? 100 : 1000, drain: 1000 } });
      await flow.updates.command("check");
      const downloading = flow.updates.command("download");
      await started.promise;
      libraryDownload = updater.downloadUpdate(token);
      const settled = libraryDownload.then(() => true, () => true);
      if (mode === "cancel") token.cancel();
      if (mode === "stop") flow.updates.stop();
      const state = await downloading;
      if (mode !== "stop") assert.equal(state.phase, "error");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        assert.equal(await Promise.race([settled, new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), 250);
        })]), true, "The library promise must settle without releasing the stalled file stream");
      } finally { clearTimeout(timer); }
      assert.equal(cancellations, 1);
      assert.equal(f.spy.cacheClosed, 1);
      assert.equal(f.spy.handleClosed, 1);
      assert.equal(f.spy.cacheReads[file] || 0, 0);
      assert.equal(f.spy.networkAttempts, 0);
      assert.equal(updater.installerPath, null);
      assert.ok(!flow.states.some((value) => value.phase === "ready"));
    } finally {
      f.spy.cacheRelease?.();
      await libraryDownload?.catch(() => {});
      await f.cleanup();
    }
  });
});

test("the actual pinned library disables automatic/downgrade paths and checks without staging-ID or network IO", async () => {
  const { actual, spy, cleanup } = await libraryFixture();
  try {
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
    await cleanup();
  }
});

test("actual AppImage replacement preserves both names and bytes before failure recovery, without retry or quit", async (t) => {
  const { actual, directory, spy, cleanup } = await libraryFixture();
  const linuxName = "Emc2-0.1.7-linux-x86_64.AppImage";
  const originalBytes = Buffer.from("original synthetic image, never executable");
  const destinationBytes = Buffer.from("prior destination synthetic image, never executable");
  const linuxRelease = { ...release(), assets: [asset(linuxName), asset("latest-linux.yml", 300)] };
  const linuxManifest = manifest({ files: [{ url: linuxName, size: bytes.length, sha512: digest }] });
  try {
    for (const originalName of ["Emc.AppImage", linuxName, "Emc2-0.1.6-linux-x86_64.AppImage"]) {
      for (const failure of ["move", "launch", "success"] as const) {
        for (const collision of originalName.includes("0.1.6") ? [false, true] : [false]) {
          await t.test(`${originalName}/${failure}/collision=${collision}`, async () => {
            const installed = await mkdtemp(path.join(directory, "installed-"));
            const cached = await mkdtemp(path.join(directory, "cached-"));
            const original = path.join(installed, originalName), installer = path.join(cached, linuxName);
            const destination = path.join(installed, originalName.includes("0.1.6") ? linuxName : originalName);
            await writeFile(original, originalBytes, { mode: 0o755 });
            const originalMode = (await lstat(original)).mode & 0o777;
            await writeFile(installer, bytes, { mode: 0o755 });
            if (collision) await writeFile(destination, destinationBytes);
            process.env.APPIMAGE = original;
            spy.calls.length = 0; spy.moveFailure = failure === "move"; spy.fail = failure === "launch";
            const linuxTarget = { ...target, platform: "linux", appImage: original };
            const selected = actual.validateCandidate(actual.releaseAssets(linuxRelease, linuxTarget)!, linuxManifest);
            const updater = await actual.createUpdater(selected, linuxTarget);
            Object.assign(updater, { downloadedUpdateHelper: { file: installer, downloadedFileInfo: {} },
              downloadUpdate: async () => [installer] });
            const assertRestored = async () => {
              assert.deepEqual(await readFile(original), originalBytes, `${originalName}/${failure}: original bytes`);
              assert.equal((await lstat(original)).mode & 0o777, originalMode);
              if (destination !== original) {
                if (collision) assert.deepEqual(await readFile(destination), destinationBytes);
                else await assert.rejects(lstat(destination), { code: "ENOENT" });
              }
            };
            const updates = new actual.Updates({ target: linuxTarget, publish: () => {},
              read: async (url) => url.includes("api.github.com") ? JSON.stringify(linuxRelease) : linuxManifest,
              create: async () => updater,
              quiesce: async () => { spy.calls.push("quiesce"); },
              drainRenderer: async () => { spy.calls.push("drain"); },
              closeWindow: async () => { spy.calls.push("close"); return true; },
              restoreWindow: async () => { await assertRestored(); spy.calls.push("restore"); },
              resume: () => { spy.calls.push("resume"); } });
            assert.equal((await updates.command("check")).phase, "available");
            assert.equal((await updates.command("download")).phase, "ready");
            const result = await updates.command("install");
            if (failure !== "success") {
              assert.equal(result.reason, "installer");
              await assertRestored();
              assert.deepEqual(spy.calls.slice(-2), ["restore", "resume"]);
              assert.ok(!spy.calls.includes("quit"));
              const calls = spy.calls.length;
              await updates.command("install");
              assert.equal(spy.calls.length, calls, "Failed handoff cannot auto-retry");
            } else {
              assert.equal(result.phase, "installing");
              assert.deepEqual(await readFile(destination), bytes);
              if (destination !== original) await assert.rejects(lstat(original), { code: "ENOENT" });
              assert.equal(spy.calls.at(-1), "quit");
              assert.ok(!spy.calls.includes("restore") && !spy.calls.includes("resume"));
            }
            const moves = spy.calls.filter((call) => typeof call !== "string" && call.command === "mv");
            assert.deepEqual(moves, [{ command: "mv", args: ["-f", installer, destination] }]);
            const launches = spy.calls.filter((call) => typeof call !== "string" && call.command !== "mv");
            assert.deepEqual(launches, failure === "move" ? [] : [{ command: destination, args: [] }]);
          });
        }
      }
    }
  } finally { await cleanup(); }
});

test("actual Electron download adapter bounds headerless streams before disk and keeps digest/progress checks", async (t) => {
  const { actual, directory, spy, cleanup } = await libraryFixture();
  const payload = Buffer.alloc(64, 7);
  const base = candidate(), sha512 = createHash("sha512").update(payload).digest("base64");
  const selected = { ...base, asset: { ...base.asset, size: 64 }, sha512,
    info: { ...base.info, sha512, files: [{ ...base.info.files[0], size: 64, sha512 }] } };
  try {
    for (const scenario of [
      { name: "headerless-oversize", chunks: [Buffer.alloc(4096)], oversize: true },
      { name: "headerless-cross-boundary", chunks: [payload.subarray(0, 32), Buffer.alloc(4096)], oversize: true },
      { name: "headerless-exact", chunks: [payload.subarray(0, 32), payload.subarray(32)] },
      { name: "headerless-wrong-digest", chunks: [Buffer.alloc(64, 8)], digestFailure: true },
      { name: "headerless-short", chunks: [payload.subarray(0, 63)], digestFailure: true },
      { name: "with-content-length", chunks: [payload], contentLength: "64" },
    ]) {
      await t.test(scenario.name, async () => {
        spy.chunks = scenario.chunks;
        spy.headers = scenario.contentLength ? { "content-length": scenario.contentLength } : {};
        spy.calls.length = 0;
        spy.written = 0; spy.flushed = undefined;
        const updater = await actual.createUpdater(selected, target);
        const executor = (updater as unknown as {
          httpExecutor: import("electron-updater/out/electronHttpExecutor.js").ElectronHttpExecutor;
        }).httpExecutor;
        const { CancellationToken } = await import("builder-util-runtime");
        const cancellationToken = new CancellationToken();
        let progress = 0, cancellations = 0, error: unknown;
        cancellationToken.on("cancel", () => { cancellations++; });
        const destination = path.join(directory, scenario.name + ".exe");
        try {
          await executor.download(new URL(selected.asset.browser_download_url), destination,
            { cancellationToken, sha512: selected.sha512, onProgress: () => { progress++; } });
        } catch (caught) { error = caught; }
        if (scenario.oversize) {
          assert.ok(error instanceof Error);
          const written = (await lstat(destination)).size;
          assert.ok(written <= 64, `${scenario.name}: wrote ${written} bytes for a 64-byte candidate`);
          assert.ok(spy.written <= 64, "Excess bytes must never enter the file output stream");
          assert.match(error.message, /verification/);
          assert.equal(spy.calls.filter((call) => call === "abort").length, 1);
          assert.equal(cancellations, 0, "One abort, without a second cancellation");
        } else if (scenario.digestFailure) {
          assert.ok(error instanceof Error);
          assert.match(error.message, /checksum mismatch/);
        } else {
          assert.equal(error, undefined);
          assert.deepEqual(await readFile(destination), payload);
          assert.equal(spy.calls.length, 0);
        }
        assert.equal(progress > 0, !!scenario.contentLength);
      });
    }
  } finally { await cleanup(); }
});

test("actual Electron download adapter aborts once when cancelled before response headers", async () => {
  const { actual, directory, spy, cleanup } = await libraryFixture();
  try {
    spy.chunks = [bytes]; spy.holdResponse = true;
    const updater = await actual.createUpdater(candidate(), target);
    const executor = (updater as unknown as {
      httpExecutor: import("electron-updater/out/electronHttpExecutor.js").ElectronHttpExecutor;
    }).httpExecutor;
    const { CancellationToken } = await import("builder-util-runtime");
    const cancellationToken = new CancellationToken();
    const destination = path.join(directory, "cancelled.exe");
    const downloading = executor.download(new URL(candidate().asset.browser_download_url), destination,
      { cancellationToken, sha512: digest });
    cancellationToken.cancel();
    await assert.rejects(downloading, /cancelled/);
    assert.deepEqual(spy.calls, ["abort"]);
    assert.equal(spy.written, 0);
    await assert.rejects(lstat(destination), { code: "ENOENT" });
  } finally { await cleanup(); }
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
