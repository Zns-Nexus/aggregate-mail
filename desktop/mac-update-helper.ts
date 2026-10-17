import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { lstat, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundleDigest, canonicalDirectory, sourceEnvironment, validateDestination, verifyBundle, type MacSourceCandidate, type Run } from "./mac-source-update.js";
import { isHigherStableVersion } from "../shared/updates.js";

type Replacement = { parent: number; installed: string; home: string; workspace: string; candidate: MacSourceCandidate; digest: string; profile?: string };
const invalid = () => new Error("mac-update-replacement");
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; } };

export async function waitForParentExit(parent: number, timeout = 60000, signal?: AbortSignal) {
  const deadline = Date.now() + timeout;
  while (alive(parent)) {
    signal?.throwIfAborted();
    if (Date.now() >= deadline) throw invalid();
    await delay(100);
  }
}

export async function validateReplacement(value: unknown, parent: number): Promise<Replacement> {
  const request = value as Replacement;
  if (!request || Object.keys(request).some(key => !["parent", "installed", "workspace", "candidate", "digest", "profile", "home"].includes(key)) ||
      request.parent !== parent || !Number.isSafeInteger(parent) || parent < 2 ||
      typeof request.installed !== "string" || typeof request.workspace !== "string" ||
      path.dirname(request.workspace) !== path.dirname(request.installed) || !/^\.emc2-update-[A-Za-z0-9]+$/.test(path.basename(request.workspace)) ||
      typeof request.digest !== "string" || !/^[a-f0-9]{128}$/.test(request.digest) ||
      request.candidate?.kind !== "mac-source" || !isHigherStableVersion(request.candidate.version, "0.0.0-0") ||
      request.candidate.tag !== `v${request.candidate.version}` || !/^[a-f0-9]{40}$/.test(request.candidate.commit) ||
      !["x64", "arm64"].includes(request.candidate.arch) ||
      (request.profile !== undefined && (typeof request.profile !== "string" || !path.isAbsolute(request.profile) ||
        path.normalize(request.profile) !== request.profile || request.profile.includes("\0")))) throw invalid();
  await canonicalDirectory(request.home);
  await canonicalDirectory(request.workspace);
  const stat = await lstat(request.workspace);
  if (stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) throw invalid();
  await validateDestination(request.installed);
  return request;
}

export async function replaceAndLaunch(request: Replacement, run?: Run, signal = new AbortController().signal,
  launch: (command: string, args: string[], options: SpawnOptions) => ChildProcess = spawn) {
  const { workspace, installed, candidate } = request;
  const stage = path.join(workspace, "staged.app"), backup = path.join(workspace, "previous.app");
  const env = sourceEnvironment(workspace);
  if (await verifyBundle(stage, candidate, workspace, env, signal, run) !== request.digest) throw invalid();
  await validateDestination(installed);
  if (await lstat(backup).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; })) throw invalid();
  await rename(installed, backup);
  let promoted = false, started = false;
  const receipt = async (state: string, launcherPid?: number) => writeFile(path.join(workspace, "result.json"),
    JSON.stringify({ state, version: candidate.version, commit: candidate.commit, arch: candidate.arch, digest: request.digest, launcherPid }) + "\n", { mode: 0o600 });
  try {
    await rename(stage, installed); promoted = true;
    if (await bundleDigest(installed) !== request.digest) throw invalid();
    // LaunchServices supplies the desktop session needed for interactive Keychain access.
    const args = request.profile ? ["--args", `--user-data-dir=${request.profile}`] : [];
    const child = launch("/usr/bin/open", ["-n", installed, ...args], { detached: true, cwd: path.dirname(installed),
      env: { HOME: request.home, PATH: env.PATH, LANG: env.LANG }, stdio: "ignore" });
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("spawn", () => { started = true; resolve(); });
    });
    // Dispatch may already have opened the database. Never downgrade it automatically.
    let exitCode: number | null | undefined;
    const exited = new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 5000);
      child.once("exit", code => { exitCode = code; clearTimeout(timer); resolve(); });
    });
    await receipt("launch-dispatching", child.pid);
    await exited;
    await receipt(exitCode === 0 ? "launch-dispatched" : exitCode === undefined ? "launch-uncertain-retained-backup" : "launch-dispatch-failed", child.pid);
    child.unref();
  } catch (error) {
    if (!started) {
      if (promoted) await rename(installed, stage);
      await rename(backup, installed);
      await receipt("rolled-back-before-start");
    } else await receipt("launch-uncertain-retained-backup");
    throw error;
  }
}

async function main() {
  if (process.platform !== "darwin" || !process.send) throw invalid();
  const abort = new AbortController();
  process.once("SIGTERM", () => abort.abort());
  const raw = await new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(invalid()), 10000);
    process.once("message", value => { clearTimeout(timer); resolve(value); });
  });
  const request = await validateReplacement(raw, process.ppid);
  if (await verifyBundle(path.join(request.workspace, "staged.app"), request.candidate, request.workspace,
    sourceEnvironment(request.workspace), abort.signal) !== request.digest) throw invalid();
  process.send!("ready");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(invalid()), 10000);
    process.once("message", value => { clearTimeout(timer); if (value === "commit") resolve(); else reject(invalid()); });
    process.once("disconnect", () => { clearTimeout(timer); reject(invalid()); });
    abort.signal.addEventListener("abort", () => { clearTimeout(timer); reject(invalid()); }, { once: true });
  });
  abort.signal.throwIfAborted();
  process.send!("armed");
  await waitForParentExit(request.parent, 60000, abort.signal);
  abort.signal.throwIfAborted();
  await replaceAndLaunch(request, undefined, abort.signal);
}

if (typeof require !== "undefined" && require.main === module) {
  process.on("uncaughtException", () => process.exit(1));
  process.on("unhandledRejection", () => process.exit(1));
  void main().then(() => process.exit(0), () => process.exit(1));
}
