import { createHash } from "node:crypto";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { isHigherStableVersion, versionParts } from "../shared/updates.js";

// Electron's ASAR view cannot supply disk identities for raw bundle integrity checks.
const { access, chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, realpath, rm, statfs, writeFile } =
  process.versions.electron ? (createRequire(process.execPath)("original-fs") as typeof import("node:fs")).promises : fs;

export const sourceRepository = "https://github.com/screen-devs/aggregate-mail.git";
export const sourceApi = "https://api.github.com/repos/screen-devs/aggregate-mail";
export type MacSourceCandidate = { kind: "mac-source"; version: string; tag: string; commit: string; arch: "x64" | "arm64" };
export type MacInstallation = { installed: string; helper: string; home: string; profile?: string; quit: () => void };
export type Run = (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, signal: AbortSignal, timeout?: number) => Promise<string>;
export class MacSourceFailure extends Error {
  constructor() { super("mac-source-update"); }
}
const invalid = () => new MacSourceFailure();
const maxWorkspaceBytes = 6 * 1024 ** 3;

export async function sourceCandidate(value: unknown, target: { version: string; arch: string }, read: (url: string, limit: number) => Promise<string>): Promise<MacSourceCandidate | null> {
  const release = value as { draft?: unknown; prerelease?: unknown; tag_name?: unknown } | null;
  if (!release || release.draft !== false || release.prerelease !== false || typeof release.tag_name !== "string" ||
      !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(release.tag_name) || release.tag_name.length > 100 ||
      !["x64", "arm64"].includes(target.arch) || !versionParts(target.version, false) || !isHigherStableVersion(release.tag_name.slice(1), "0.0.0-0")) throw invalid();
  const version = release.tag_name.slice(1);
  if (!isHigherStableVersion(version, target.version)) return null;
  const ref = JSON.parse(await read(`${sourceApi}/git/ref/tags/${release.tag_name}`, 65536));
  if (!ref || ref.ref !== `refs/tags/${release.tag_name}` || !ref.object) throw invalid();
  let object = ref.object;
  for (let depth = 0; object.type === "tag" && depth < 4; depth++) {
    if (!/^[a-f0-9]{40}$/.test(object.sha)) throw invalid();
    const tag = JSON.parse(await read(`${sourceApi}/git/tags/${object.sha}`, 65536));
    if (!tag || tag.sha !== object.sha || !tag.object) throw invalid();
    object = tag.object;
  }
  if (object.type !== "commit" || !/^[a-f0-9]{40}$/.test(object.sha)) throw invalid();
  return { kind: "mac-source", version, tag: release.tag_name, commit: object.sha, arch: target.arch as MacSourceCandidate["arch"] };
}

// Deliberately ignore the launch environment, including npm, Git, proxy and Node injection settings.
export function sourceEnvironment(home: string, toolDirectory = "/usr/bin"): NodeJS.ProcessEnv {
  return { HOME: home, TMPDIR: home, PATH: [toolDirectory, "/opt/homebrew/opt/node@24/bin", "/usr/local/opt/node@24/bin",
    "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"),
  LANG: "en_US.UTF-8", CSC_IDENTITY_AUTO_DISCOVERY: "false", GIT_CONFIG_NOSYSTEM: "1",
  NPM_CONFIG_USERCONFIG: path.join(home, "npm-user.npmrc"), NPM_CONFIG_GLOBALCONFIG: path.join(home, "npm-global.npmrc"),
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
}

export async function workspaceLimit(root: string) {
  let bytes = 0, entries = 0;
  async function walk(directory: string): Promise<void> {
    const listing = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const entry of listing) {
      if (++entries > 150000) throw invalid();
      const file = path.join(directory, entry.name);
      const stat = await lstat(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
      if (!stat) continue;
      bytes += stat.size;
      if (bytes > maxWorkspaceBytes) throw invalid();
      if (stat.isDirectory()) await walk(file);
    }
  }
  await walk(root);
}

export const runBounded: Run = (command, args, cwd, env, signal, timeout = 60000) => new Promise((resolve, reject) => {
  signal.throwIfAborted();
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", bytes = 0, failed = false, measuring = false;
  const kill = () => {
    failed = true;
    if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already exited. */ } }
  };
  const timer = setTimeout(kill, timeout);
  const quotaRoot = path.basename(cwd) === "source" && /^\.emc2-update-/.test(path.basename(path.dirname(cwd))) ? path.dirname(cwd) : cwd;
  const quota = setInterval(() => {
    if (measuring) return;
    measuring = true;
    void workspaceLimit(quotaRoot).catch(kill).finally(() => { measuring = false; });
  }, 1000);
  signal.addEventListener("abort", kill, { once: true });
  const count = (chunk: Buffer) => { bytes += chunk.length; if (bytes > 1024 * 1024) kill(); };
  child.stdout.on("data", (chunk: Buffer) => { count(chunk); if (!failed) output += chunk.toString("utf8"); });
  child.stderr.on("data", count);
  child.once("error", () => { failed = true; });
  child.once("close", (code) => {
    clearTimeout(timer); clearInterval(quota); signal.removeEventListener("abort", kill);
    if (failed || code !== 0 || signal.aborted) reject(invalid());
    else resolve(output.trim());
  });
});

async function regular(file: string) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) throw invalid();
}

export async function stampSourceVersion(checkout: string, version: string) {
  if (!isHigherStableVersion(version, "0.0.0-0")) throw invalid();
  const files = ["package.json", "package-lock.json"].map(name => path.join(checkout, name));
  for (const file of files) await regular(file);
  const pkg = JSON.parse(await readFile(files[0], "utf8")), lock = JSON.parse(await readFile(files[1], "utf8"));
  if (pkg.name !== "emc2" || lock.name !== "emc2" || !lock.packages?.[""] || lock.packages[""].name !== "emc2" ||
      pkg.build?.appId !== "dev.screen.aggregate-mail" || pkg.build?.productName !== "Emc²" ||
      pkg.build?.afterPack !== "scripts/sign-mac.cjs" || pkg.build?.mac?.identity !== null || pkg.build?.mac?.notarize !== false ||
      pkg.scripts?.["package:mac:dir"] !== "npm run build && electron-builder --mac --dir --publish never") throw invalid();
  pkg.version = lock.version = lock.packages[""].version = version;
  await writeFile(files[0], JSON.stringify(pkg, null, 2) + "\n");
  await writeFile(files[1], JSON.stringify(lock, null, 2) + "\n");
}

export async function canonicalDirectory(directory: string) {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory || directory.includes("\0") ||
      await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) throw invalid();
}

export async function validateDestination(installed: string) {
  if (path.extname(installed) !== ".app") throw invalid();
  await canonicalDirectory(installed);
  await canonicalDirectory(path.dirname(installed));
  await access(path.dirname(installed), constants.W_OK);
  await access(installed, constants.W_OK);
  const disk = await statfs(path.dirname(installed));
  if (disk.bavail * disk.bsize < 1024 ** 3) throw invalid();
}

// Framework symlinks are normal, but every link must resolve inside this bundle.
export async function bundleDigest(bundle: string, signal?: AbortSignal) {
  await canonicalDirectory(bundle);
  const hash = createHash("sha512");
  let bytes = 0, entries = 0;
  async function walk(directory: string): Promise<void> {
    for (const name of (await readdir(directory)).sort()) {
      signal?.throwIfAborted();
      if (++entries > 100000) throw invalid();
      const file = path.join(directory, name), stat = await lstat(file);
      hash.update(JSON.stringify([path.relative(bundle, file), stat.mode]));
      if (stat.isSymbolicLink()) {
        if (!(await realpath(file)).startsWith(bundle + path.sep)) throw invalid();
        hash.update(await readlink(file));
      } else if (stat.isDirectory()) await walk(file);
      else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes > 3 * 1024 ** 3) throw invalid();
        const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const opened = await handle.stat();
          if (opened.ino !== stat.ino || opened.dev !== stat.dev || !opened.isFile()) throw invalid();
          for await (const chunk of handle.createReadStream({ autoClose: false })) { signal?.throwIfAborted(); hash.update(chunk); }
          const after = await lstat(file);
          if (after.ino !== stat.ino || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw invalid();
        } finally { await handle.close(); }
      } else throw invalid();
    }
  }
  await walk(bundle);
  return hash.digest("hex");
}

export async function verifyBundle(bundle: string, candidate: Pick<MacSourceCandidate, "version" | "arch">, cwd: string, env: NodeJS.ProcessEnv, signal: AbortSignal, run = runBounded) {
  await canonicalDirectory(bundle);
  await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", bundle], cwd, env, signal);
  const plist = path.join(bundle, "Contents/Info.plist");
  for (const [field, expected] of [["CFBundleIdentifier", "dev.screen.aggregate-mail"], ["CFBundleShortVersionString", candidate.version], ["CFBundleExecutable", "Emc²"]]) {
    if (await run("/usr/bin/plutil", ["-extract", field, "raw", "-o", "-", plist], cwd, env, signal) !== expected) throw invalid();
  }
  const executable = path.join(bundle, "Contents/MacOS/Emc²");
  if (await run("/usr/bin/lipo", ["-archs", executable], cwd, env, signal) !== (candidate.arch === "x64" ? "x86_64" : "arm64")) throw invalid();
  return bundleDigest(bundle, signal);
}

export function explicitUpdateProfile(args: string[], effective: string) {
  const switches = args.filter(arg => arg === "--user-data-dir" || arg.startsWith("--user-data-dir="));
  if (!switches.length) return undefined;
  if (switches.length !== 1 || !switches[0].startsWith("--user-data-dir=") ||
      (args.includes("--") && args.indexOf(switches[0]) > args.indexOf("--")) ||
      switches[0].slice("--user-data-dir=".length) !== effective || !path.isAbsolute(effective) || effective.includes("\0")) throw invalid();
  return effective;
}

export class MacSourceUpdate {
  private abort = new AbortController();
  private workspace?: string;
  private node?: string;
  private env?: NodeJS.ProcessEnv;
  private digest?: string;
  private handedOff = false;
  private pending = new Set<Promise<void>>();
  constructor(readonly candidate: MacSourceCandidate, private installation: MacInstallation, private run: Run = runBounded,
    private launch: (command: string, args: string[], options: SpawnOptions) => ChildProcess = spawn) {}
  private track(operation: Promise<void>) {
    this.pending.add(operation);
    return operation.finally(() => { this.pending.delete(operation); });
  }
  stop() { if (!this.handedOff) this.abort.abort(); }
  async dispose() {
    this.stop();
    await Promise.allSettled(this.pending);
    await this.cleanup();
  }
  private async cleanup() {
    if (this.workspace && !this.handedOff) await rm(this.workspace, { recursive: true, force: true });
  }
  build() { return this.track(this.buildSource()); }
  private async buildSource() {
    const signal = this.abort.signal;
    const deadline = setTimeout(() => this.abort.abort(), 30 * 60000);
    try {
      await validateDestination(this.installation.installed);
      const disk = await statfs(path.dirname(this.installation.installed));
      if (disk.bavail * disk.bsize < 8 * 1024 ** 3) throw invalid();
      this.workspace = await mkdtemp(path.join(path.dirname(this.installation.installed), ".emc2-update-"));
      await chmod(this.workspace, 0o700);
      const home = path.join(this.workspace, "home");
      await mkdir(home, { mode: 0o700 });
      this.env = sourceEnvironment(home);
      await this.run("/usr/bin/git", ["--version"], this.workspace, this.env, signal);
      await this.run("/usr/bin/xcode-select", ["-p"], this.workspace, this.env, signal);
      await this.run("/usr/bin/xcrun", ["--find", "clang"], this.workspace, this.env, signal);
      for (const node of ["/opt/homebrew/opt/node@24/bin/node", "/usr/local/opt/node@24/bin/node", "/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]) {
        try {
          const version = await this.run(node, ["--version"], this.workspace, this.env, signal);
          if (/^v\d+\.\d+\.\d+$/.test(version) && Number(version.split(".")[0].slice(1)) >= 24) { this.node = node; break; }
        } catch { signal.throwIfAborted(); }
      }
      if (!this.node) throw invalid();
      this.env = sourceEnvironment(home, path.dirname(this.node));
      const npm = path.join(path.dirname(this.node), "npm");
      await this.run(this.node, [npm, "--version"], this.workspace, this.env, signal);
      const checkout = path.join(this.workspace, "source");
      await mkdir(checkout, { mode: 0o700 });
      const git = (args: string[]) => this.run("/usr/bin/git", args, checkout, this.env!, signal, 5 * 60000);
      await git(["init", "--quiet"]);
      await git(["-c", "http.lowSpeedLimit=1024", "-c", "http.lowSpeedTime=30", "fetch", "--depth=1", "--no-tags", sourceRepository,
        `refs/tags/${this.candidate.tag}:refs/tags/${this.candidate.tag}`]);
      if (await git(["rev-parse", `refs/tags/${this.candidate.tag}^{commit}`]) !== this.candidate.commit) throw invalid();
      await git(["-c", "advice.detachedHead=false", "checkout", "--detach", this.candidate.commit]);
      await stampSourceVersion(checkout, this.candidate.version);
      await this.run(this.node, [npm, "ci", "--no-audit", "--no-fund", `--cache=${path.join(home, "npm-cache")}`], checkout, this.env, signal, 10 * 60000);
      await this.run(this.node, [npm, "run", "package:mac:dir", "--", `--${this.candidate.arch}`], checkout, this.env, signal, 15 * 60000);
      const built = path.join(checkout, "release", this.candidate.arch === "arm64" ? "mac-arm64" : "mac", "Emc².app");
      const builtDigest = await verifyBundle(built, this.candidate, this.workspace, this.env, signal, this.run);
      const stage = path.join(this.workspace, "staged.app");
      await this.run("/usr/bin/ditto", ["--rsrc", "--extattr", built, stage], this.workspace, this.env, signal, 120000);
      this.digest = await verifyBundle(stage, this.candidate, this.workspace, this.env, signal, this.run);
      if (this.digest !== builtDigest) throw invalid();
      await workspaceLimit(this.workspace);
      this.env = sourceEnvironment(this.workspace, path.dirname(this.node));
      await rm(checkout, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    } catch (error) { this.stop(); await this.cleanup(); throw error; }
    finally { clearTimeout(deadline); }
  }
  verify() { return this.track(this.verifyStage()); }
  private async verifyStage() {
    if (!this.workspace || !this.env || !this.digest) throw invalid();
    await validateDestination(this.installation.installed);
    if (await verifyBundle(path.join(this.workspace, "staged.app"), this.candidate, this.workspace, this.env, this.abort.signal, this.run) !== this.digest) throw invalid();
  }
  install() { return this.track(this.installSource()); }
  private async installSource() {
    await this.verify();
    const workspace = this.workspace!;
    const helper = path.join(workspace, "replace.cjs");
    // The running app's helper can be inside its ASAR archive.
    await fs.copyFile(this.installation.helper, helper, constants.COPYFILE_EXCL);
    await chmod(helper, 0o600);
    this.abort.signal.throwIfAborted();
    const child = this.launch(this.node!, [helper], { cwd: workspace, env: this.env!, detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); this.abort.signal.removeEventListener("abort", fail);
        const force = setTimeout(() => child.kill("SIGKILL"), 2000);
        child.once("close", () => { clearTimeout(force); reject(invalid()); });
        child.kill("SIGTERM");
      };
      const timer = setTimeout(fail, 30000);
      this.abort.signal.addEventListener("abort", fail, { once: true });
      child.once("error", fail);
      child.once("exit", fail);
      let ready = false;
      const onMessage = (message: unknown) => {
        if (settled) return;
        if (this.abort.signal.aborted) { fail(); return; }
        if (!ready && message === "ready") { ready = true; child.send("commit", error => { if (error) fail(); }); return; }
        if (!ready || message !== "armed") { fail(); return; }
        settled = true;
        clearTimeout(timer); child.removeListener("exit", fail); child.removeListener("error", fail);
        this.abort.signal.removeEventListener("abort", fail);
        child.removeListener("message", onMessage);
        this.handedOff = true;
        child.disconnect(); child.unref();
        resolve();
      };
      child.on("message", onMessage);
      child.send({ parent: process.pid, installed: this.installation.installed, home: this.installation.home, workspace, candidate: this.candidate,
        digest: this.digest, profile: this.installation.profile }, error => { if (error) fail(); });
    });
    try { this.installation.quit(); }
    catch (error) { child.kill("SIGKILL"); this.handedOff = false; throw error; }
  }
}
