import { createHash } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import { copyFile, lstat, mkdtemp, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { StdioOptions } from "node:child_process";
import type { IncomingMessage, RequestOptions } from "node:http";
import { pipeline, Transform } from "node:stream";
import type { DownloadCallOptions } from "builder-util-runtime/out/httpExecutor.js";
import type { BaseUpdater, UpdateInfo, CancellationToken as UpdaterCancellation } from "electron-updater";
import type { DownloadExecutorTask } from "electron-updater/out/AppUpdater.js";
import type { DownloadedUpdateHelper } from "electron-updater/out/DownloadedUpdateHelper.js";
import { parseUpdateInfo } from "electron-updater/out/providers/Provider.js";
import type { UpdateCommand, UpdateReason, UpdateState } from "../shared/updates.js";
import { trustedWindowSender } from "./navigation.js";

const repository = "screen-devs/aggregate-mail";
const latestRelease = `https://api.github.com/repos/${repository}/releases/latest`;
const downloadRoot = `https://github.com/${repository}/releases/download/`;
const maxInstallerSize = 1024 * 1024 * 1024;
const metadataTimeout = 15000;
const downloadTimeout = 10 * 60000;
const drainTimeout = 30000;

type Target = { platform: string; arch: string; version: string; packaged: boolean; appImage?: string };
type Asset = { name: string; size: number; browser_download_url: string };
export type Candidate = { version: string; asset: Asset; info: UpdateInfo; sha512: string };
class UpdateFailure extends Error {
  constructor(readonly reason: UpdateReason) { super(reason); }
}
const fail = (reason: UpdateReason): never => { throw new UpdateFailure(reason); };

function versionParts(version: string, stable: boolean) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(version);
  if (!match || version.length > 100 || (stable && (match[4] || match[5]))) return null;
  const parts = match.slice(1, 4).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return null;
  if (match[4]?.split(".").some((part) => !part || (/^\d+$/.test(part) && part.length > 1 && part.startsWith("0")))) return null;
  if (match[5]?.split(".").some((part) => !part)) return null;
  return { parts, prerelease: !!match[4] };
}
export function isHigherStableVersion(candidate: string, current: string) {
  const next = versionParts(candidate, true), installed = versionParts(current, false);
  if (!next || !installed) return false;
  for (let i = 0; i < 3; i++) {
    if (next.parts[i] !== installed.parts[i]) return next.parts[i] > installed.parts[i];
  }
  return installed.prerelease;
}

export function unsupportedReason(target: Target): UpdateReason | undefined {
  if (!target.packaged) return "development";
  // Squirrel.Mac requires a supported signed bundle; local ad-hoc packaging is not that route.
  if (target.platform === "darwin") return "mac-signing";
  if (!["x64", "arm64"].includes(target.arch) || !["win32", "linux"].includes(target.platform)) return "platform";
  if (target.platform === "linux" && (!target.appImage || !path.isAbsolute(target.appImage))) return "appimage";
}

export function releaseAssets(value: unknown, target: Target) {
  if (!value || typeof value !== "object") return fail("candidate");
  const release = value as { draft?: unknown; prerelease?: unknown; tag_name?: unknown; assets?: unknown };
  if (release.draft !== false || release.prerelease !== false || typeof release.tag_name !== "string" ||
      !/^v\d+\.\d+\.\d+$/.test(release.tag_name) || !versionParts(release.tag_name.slice(1), true) ||
      !Array.isArray(release.assets) || release.assets.length > 100) return fail("candidate");
  const version = release.tag_name.slice(1);
  if (!versionParts(target.version, false)) return fail("candidate");
  if (!isHigherStableVersion(version, target.version)) return null;
  const assets = release.assets as Asset[];
  const seen = new Set<string>();
  for (const asset of assets) {
    if (!asset || typeof asset.name !== "string" || asset.name.length > 200 || seen.has(asset.name) ||
        !Number.isSafeInteger(asset.size) || asset.size <= 0 || typeof asset.browser_download_url !== "string" ||
        asset.browser_download_url !== `${downloadRoot}${release.tag_name}/${encodeURIComponent(asset.name)}`)
      return fail("candidate");
    seen.add(asset.name);
  }
  const os = target.platform === "win32" ? "win" : "linux";
  const extension = target.platform === "win32" ? "exe" : "AppImage";
  const name = `Emc²-${version}-${os}-${target.arch}.${extension}`;
  const matching = assets.filter((asset) => asset.name.endsWith(`-${os}-${target.arch}.${extension}`));
  if (matching.length !== 1 || matching[0].name !== name || matching[0].size > maxInstallerSize) return fail("candidate");
  const manifestName = target.platform === "win32" ? "latest.yml" : `latest-linux${target.arch === "x64" ? "" : `-${target.arch}`}.yml`;
  const manifest = assets.find((asset) => asset.name === manifestName);
  if (!manifest || manifest.size > 65536) return fail("metadata");
  return { version, asset: matching[0], manifest };
}

export function validateCandidate(release: NonNullable<ReturnType<typeof releaseAssets>>, raw: string): Candidate {
  let info: UpdateInfo;
  try { info = parseUpdateInfo(raw, release.manifest.name, new URL(release.manifest.browser_download_url)); }
  catch { return fail("metadata"); }
  if (!info || info.version !== release.version || !Array.isArray(info.files) || info.files.length !== 1 ||
      (info as UpdateInfo & { packages?: unknown }).packages != null || info.stagingPercentage != null) return fail("candidate");
  const file = info.files[0];
  if (!file || ![release.asset.name, encodeURIComponent(release.asset.name), release.asset.browser_download_url].includes(file.url) ||
      file.size !== release.asset.size || typeof file.sha512 !== "string" ||
      Buffer.from(file.sha512, "base64").length !== 64 || Buffer.from(file.sha512, "base64").toString("base64") !== file.sha512 ||
      (info.path != null && ![release.asset.name, encodeURIComponent(release.asset.name), release.asset.browser_download_url].includes(info.path)) ||
      (info.sha512 != null && info.sha512 !== file.sha512)) return fail("candidate");
  // Keep only the verified file; the renderer never receives any download path or URL.
  return { version: release.version, asset: release.asset, sha512: file.sha512,
    info: { version: info.version, files: [{ url: release.asset.name, size: file.size, sha512: file.sha512 }],
      path: release.asset.name, sha512: file.sha512,
      releaseDate: info.releaseDate, minimumSystemVersion: info.minimumSystemVersion } };
}

async function readMetadata(url: string, limit: number) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), metadataTimeout);
  try {
    const response = await fetch(url, { signal: abort.signal, headers: { Accept: "application/vnd.github+json" }, credentials: "omit" });
    if (!response.ok || !response.body) return fail("network");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) return fail("metadata");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return Buffer.concat(chunks).toString("utf8");
  } finally { clearTimeout(timer); }
}

export async function verifyInstaller(file: string, candidate: Candidate, cancellation?: UpdaterCancellation): Promise<void> {
  const abort = new AbortController();
  const cancel = () => abort.abort();
  cancellation?.once("cancel", cancel);
  if (cancellation?.cancelled) cancel();
  const timer = setTimeout(cancel, drainTimeout);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    abort.signal.throwIfAborted();
    if (!path.isAbsolute(file)) return fail("verification");
    const before = await lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || before.size !== candidate.asset.size) return fail("verification");
    abort.signal.throwIfAborted();
    handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    abort.signal.throwIfAborted();
    const stat = await handle.stat();
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size !== before.size) return fail("verification");
    const hash = createHash("sha512");
    let bytes = 0;
    const stream = handle.createReadStream({ autoClose: false, start: 0, end: candidate.asset.size - 1,
      highWaterMark: 65536, signal: abort.signal });
    for await (const chunk of stream) {
      bytes += chunk.length;
      hash.update(chunk);
    }
    const after = await lstat(file);
    abort.signal.throwIfAborted();
    if (bytes !== candidate.asset.size || hash.digest("base64") !== candidate.sha512 || !after.isFile() ||
        after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
      return fail("verification");
  } finally {
    clearTimeout(timer);
    cancellation?.removeListener("cancel", cancel);
    if (handle && handle.fd !== -1) await handle.close();
  }
}

type Driver = Pick<BaseUpdater, "autoDownload" | "autoInstallOnAppQuit" | "allowPrerelease" | "allowDowngrade" |
  "checkForUpdates" | "downloadUpdate" | "quitAndInstall" | "on"> & { readonly installerPath: string | null };

// Pin the library's provider to the already checked release. This avoids its persistent staging UUID
// and prevents a second metadata fetch from selecting a different candidate.
export async function createUpdater(candidate: Candidate, target: Target): Promise<Driver> {
  const { NsisUpdater, AppImageUpdater, Provider } = await import("electron-updater");
  const { ElectronHttpExecutor } = await import("electron-updater/out/electronHttpExecutor.js");
  const { DigestTransform, ProgressCallbackTransform, safeGetHeader, CancellationError } = await import("builder-util-runtime");
  const bindCache = async (updater: BaseUpdater, cancellation: UpdaterCancellation) => {
    if (cancellation.cancelled) throw new CancellationError();
    // Use the pinned library's cache configuration, replacing only its unbounded validator.
    const helper = await (updater as unknown as {
      getOrCreateDownloadHelper(): Promise<DownloadedUpdateHelper>;
    }).getOrCreateDownloadHelper();
    if (cancellation.cancelled) throw new CancellationError();
    helper.validateDownloadedPath = async (file) => {
      if (cancellation.cancelled) throw new CancellationError();
      if (file !== path.join(helper.cacheDirForPendingUpdate, candidate.asset.name)) return fail("verification");
      try { await verifyInstaller(file, candidate, cancellation); }
      catch (error) {
        if (cancellation.cancelled) throw new CancellationError();
        if (error instanceof UpdateFailure || (error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      if (cancellation.cancelled) throw new CancellationError();
      // Rebuild cached install metadata from the selected candidate, never from cached JSON paths.
      return file;
    };
  };
  class BoundedExecutor extends ElectronHttpExecutor {
    private cancelDownload?: DownloadCallOptions["onCancel"];
    createRequest(options: RequestOptions, callback: (response: IncomingMessage) => void) {
      let received: IncomingMessage | undefined, aborted = false;
      const abort = () => { if (!aborted) { aborted = true; request.abort(); } };
      const request = super.createRequest(options, (response: IncomingMessage) => {
        received = response;
        response.once("close", () => { if (!response.readableEnded) abort(); });
        callback(response);
      });
      this.cancelDownload?.(() => { abort(); received?.destroy(new CancellationError()); });
      return request;
    }
    protected doDownload(request: RequestOptions, options: DownloadCallOptions, redirects: number) {
      this.cancelDownload = options.onCancel;
      if (options.responseHandler || !options.destination) return super.doDownload(request, options, redirects);
      super.doDownload(request, { ...options, responseHandler: (response, callback) => {
        let transferred = 0;
        const streams: Transform[] = [new Transform({ transform(chunk: Buffer, _encoding, done) {
          transferred += chunk.length;
          if (transferred > candidate.asset.size) { done(new UpdateFailure("verification")); return; }
          done(null, chunk);
        } })];
        const contentLength = safeGetHeader(response, "content-length");
        if (options.options.onProgress && contentLength != null)
          streams.push(new ProgressCallbackTransform(Number.parseInt(contentLength, 10), options.options.cancellationToken, options.options.onProgress));
        streams.push(new DigestTransform(candidate.sha512));
        response.removeListener("error", callback);
        // Count before hashing or file output, including when the server omits Content-Length.
        pipeline([response, ...streams, createWriteStream(options.destination!)], callback);
      } }, redirects);
    }
  }
  class ReleaseProvider extends Provider<UpdateInfo> {
    constructor() { super({ platform: target.platform as "win32" | "linux", isUseMultipleRangeRequest: false, executor: new ElectronHttpExecutor() }); }
    async getLatestVersion() { return candidate.info; }
    resolveFiles() { return [{ url: new URL(candidate.asset.browser_download_url), info: candidate.info.files[0] }]; }
  }
  const pinned = async () => ({ info: candidate.info, provider: new ReleaseProvider() });
  class WindowsUpdater extends NsisUpdater {
    protected getUpdateInfoAndProvider = pinned;
    protected async executeDownload(options: DownloadExecutorTask) {
      await bindCache(this, options.downloadUpdateOptions.cancellationToken);
      return super.executeDownload(options);
    }
    get installerPath() { return super.installerPath; }
    private launch?: Promise<boolean>;
    protected spawnLog(command: string, args?: string[], env?: NodeJS.ProcessEnv, stdio?: StdioOptions) {
      this.launch = super.spawnLog(command, args, env, stdio);
      // Report the first launch failure without the library's automatic elevation/shell retry.
      return this.launch.catch(() => false);
    }
    async quitAndInstall() {
      if (!this.install(true, true) || !this.launch) return fail("installer");
      await this.launch;
      this.app.quit();
    }
  }
  class LinuxUpdater extends AppImageUpdater {
    protected getUpdateInfoAndProvider = pinned;
    protected async executeDownload(options: DownloadExecutorTask) {
      await bindCache(this, options.downloadUpdateOptions.cancellationToken);
      return super.executeDownload(options);
    }
    get installerPath() { return super.installerPath; }
    private launch?: Promise<boolean>;
    protected spawnLog(command: string, args?: string[], env?: NodeJS.ProcessEnv, stdio?: StdioOptions) {
      this.launch = super.spawnLog(command, args, env, stdio);
      return this.launch.catch(() => false);
    }
    async quitAndInstall() {
      const original = process.env.APPIMAGE, installer = this.installerPath;
      if (!original || original !== target.appImage || !path.isAbsolute(original) || original.includes("\0") || !installer)
        return fail("installer");
      const originalStat = await lstat(original);
      if (!originalStat.isFile() || originalStat.isSymbolicLink()) return fail("installer");
      // Match the pinned library's destination choice, protecting both paths before its unlink/move.
      const base = path.basename(original);
      const destination = path.basename(installer) === base || !/\d+\.\d+\.\d+/.test(base)
        ? original : path.join(path.dirname(original), path.basename(installer));
      const existing = destination === original ? null : await lstat(destination).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
      if (existing && (!existing.isFile() || existing.isSymbolicLink())) return fail("installer");
      const backup = await mkdtemp(path.join(path.dirname(original), ".emc2-update-"));
      const originalBackup = path.join(backup, "original"), destinationBackup = path.join(backup, "destination");
      let keepBackup = false;
      try {
        await copyFile(original, originalBackup, constants.COPYFILE_EXCL);
        if (existing) await copyFile(destination, destinationBackup, constants.COPYFILE_EXCL);
        try {
          if (!this.install(false, true) || !this.launch) return fail("installer");
          await this.launch;
        } catch (error) {
          // A failed rollback must retain the independent copies for recovery.
          keepBackup = true;
          await rename(originalBackup, original);
          if (destination !== original) {
            if (existing) await rename(destinationBackup, destination);
            else await rm(destination, { force: true });
          }
          keepBackup = false;
          throw error;
        }
      } finally {
        if (!keepBackup) await rm(backup, { recursive: true, force: true }).catch(() => {});
      }
      this.app.quit();
    }
  }
  const updater = target.platform === "win32" ? new WindowsUpdater() : new LinuxUpdater();
  Object.assign(updater, { httpExecutor: new BoundedExecutor((info, callback) => updater.emit("login", info, callback)) });
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.autoRunAppAfterInstall = true;
  updater.disableWebInstaller = true;
  updater.disableDifferentialDownload = true;
  updater.logger = null;
  return updater;
}

type Dependencies = {
  target: Target;
  publish: (state: UpdateState) => void;
  quiesce: (timeout: number) => Promise<void>;
  resume: () => void;
  drainRenderer: (timeout: number) => Promise<void>;
  closeWindow: () => Promise<boolean>;
  restoreWindow: () => Promise<void>;
  read?: typeof readMetadata;
  create?: typeof createUpdater;
  verify?: typeof verifyInstaller;
  cancellation?: () => Promise<UpdaterCancellation>;
  timeouts?: { download: number; drain: number };
};

export class Updates {
  private state: UpdateState;
  private running = false;
  private candidate?: Candidate;
  private updater?: Driver;
  private downloaded?: string;
  private stopped = false;
  private installerFailed = false;
  private downloadInvalid = false;
  private cancel?: UpdaterCancellation;
  constructor(private deps: Dependencies) {
    const reason = unsupportedReason(deps.target);
    this.state = reason ? { phase: "unsupported", reason } : { phase: "idle" };
  }
  snapshot() { return { ...this.state }; }
  private set(state: UpdateState) { if (!this.stopped) { this.state = state; this.deps.publish(this.snapshot()); } }
  stop() { this.stopped = true; this.cancel?.cancel(); }
  async command(command: UpdateCommand) {
    if (this.running || this.stopped || this.state.phase === "unsupported") return this.snapshot();
    this.running = true;
    try {
      if (command === "check") await this.check();
      else if (command === "download" && this.state.phase === "available") await this.download();
      else if (command === "install" && this.state.phase === "ready") await this.install();
    } catch (error) {
      const reason = error instanceof UpdateFailure ? error.reason : command === "check" ? "network" : command === "download" ? "download" : "installer";
      this.set({ phase: reason === "metadata" || reason === "candidate" ? "unavailable" : "error", version: this.candidate?.version, reason });
    } finally { this.running = false; }
    return this.snapshot();
  }
  private async check() {
    this.candidate = undefined; this.updater = undefined; this.downloaded = undefined;
    this.set({ phase: "checking" });
    const read = this.deps.read || readMetadata;
    const release = releaseAssets(JSON.parse(await read(latestRelease, 2 * 1024 * 1024)), this.deps.target);
    if (!release) { this.set({ phase: "current" }); return; }
    const candidate = validateCandidate(release, await read(release.manifest.browser_download_url, 65536));
    const updater = await (this.deps.create || createUpdater)(candidate, this.deps.target);
    updater.on("error", () => {
      if (this.updater !== updater) return;
      if (this.state.phase === "installing") this.installerFailed = true;
      if (!this.running && !this.stopped) {
        this.deps.resume();
        this.set({ phase: "error", reason: "installer", version: candidate.version });
        void this.deps.restoreWindow();
      }
    });
    updater.on("download-progress", (progress) => {
      if (this.updater !== updater) return;
      if (this.state.phase === "downloading" && (progress.transferred > candidate.asset.size ||
          (Number.isFinite(progress.total) && progress.total !== candidate.asset.size))) {
        if (!this.downloadInvalid) { this.downloadInvalid = true; this.cancel?.cancel(); }
        return;
      }
      if (!this.stopped && this.state.phase === "downloading" && Number.isFinite(progress.percent))
        this.set({ phase: "downloading", version: candidate.version, percent: Math.max(0, Math.min(100, progress.percent)) });
    });
    const result = await updater.checkForUpdates();
    if (!result?.isUpdateAvailable || result.updateInfo.version !== candidate.version) return fail("candidate");
    this.candidate = candidate; this.updater = updater;
    this.set({ phase: "available", version: candidate.version });
  }
  private async download() {
    const candidate = this.candidate!, updater = this.updater!;
    this.set({ phase: "downloading", version: candidate.version, percent: 0 });
    this.downloadInvalid = false;
    this.cancel = this.deps.cancellation ? await this.deps.cancellation() : new (await import("electron-updater")).CancellationToken();
    if (this.stopped) { this.cancel.cancel(); this.cancel = undefined; return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const files = await Promise.race([updater.downloadUpdate(this.cancel), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { this.cancel?.cancel(); reject(new UpdateFailure("download")); }, this.deps.timeouts?.download ?? downloadTimeout);
      })]);
      if (this.stopped) return;
      if (this.downloadInvalid || files.length !== 1 || updater.installerPath !== files[0]) return fail("verification");
      await (this.deps.verify || verifyInstaller)(files[0], candidate, this.cancel).catch(() => fail("verification"));
      if (this.stopped) return;
      this.downloaded = files[0];
      this.set({ phase: "ready", version: candidate.version });
    } finally { clearTimeout(timer); this.cancel = undefined; }
  }
  private async install() {
    const candidate = this.candidate!, updater = this.updater!, file = this.downloaded!;
    this.set({ phase: "installing", version: candidate.version });
    let closed = false;
    let handedOff = false;
    try {
      const timeout = this.deps.timeouts?.drain ?? drainTimeout;
      await this.deps.quiesce(timeout).catch(() => fail("mail-busy"));
      await this.deps.drainRenderer(timeout).catch(() => fail("mail-busy"));
      if (this.stopped) return;
      if (!(await this.deps.closeWindow())) {
        this.set({ phase: "ready", version: candidate.version, reason: "cancelled" });
        return;
      }
      closed = true;
      if (updater.installerPath !== file) return fail("verification");
      await (this.deps.verify || verifyInstaller)(file, candidate).catch(() => fail("verification"));
      if (this.stopped) return;
      this.installerFailed = false;
      await updater.quitAndInstall(false, true);
      if (this.installerFailed) return fail("installer");
      handedOff = true;
    } catch (error) {
      if (closed) await this.deps.restoreWindow();
      throw error;
    } finally {
      // A successful handoff remains quiesced until quit; every other path resumes mail.
      if (!handedOff) this.deps.resume();
    }
  }
}

export function registerUpdateIpc(ipc: {
  handle: (channel: string, listener: (event: { sender: unknown; senderFrame: unknown }, ...args: unknown[]) => unknown) => void;
}, contents: () => { mainFrame: unknown; getURL: () => string } | undefined, origin: string, updates: Updates) {
  for (const channel of ["update-state", "update-command"]) {
    ipc.handle(channel, (event, ...args) => {
      const sender = contents();
      if (!sender || !trustedWindowSender(event, sender, origin) ||
          (channel === "update-state" ? args.length !== 0 : args.length !== 1 || !["check", "download", "install"].includes(args[0] as string)))
        throw new Error("Update request rejected.");
      return channel === "update-state" ? updates.snapshot() : updates.command(args[0] as UpdateCommand);
    });
  }
}
