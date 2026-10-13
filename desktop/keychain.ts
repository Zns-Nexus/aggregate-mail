import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";

export const CURRENT_NAME = "Emc²";
export const HELPER_FLAG = "--emc2-keychain-helper";
export const MAX_PAYLOAD = 16 * 1024;
export const MIGRATION_ERROR = "The protected mail key migration failed. Your mail store was not opened.";
const digestPattern = /^[a-f0-9]{64}$/;
export type CurrentRecord = { version: 1; name: typeof CURRENT_NAME; sourceProtectedKeySha256: string; wrappedKey: string };
type Request = { version: 1; nonce: string; sourceProtectedKeySha256: string; key: string };
type Response = Omit<Request, "key"> & { wrappedKey: string; mac: string };

function exact(value: unknown, fields: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...fields].sort().join(",");
}
export function canonicalBytes(value: unknown): Buffer {
  if (typeof value !== "string" || !value || value.length > MAX_PAYLOAD) throw new Error(MIGRATION_ERROR);
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.toString("base64") !== value) { bytes.fill(0); throw new Error(MIGRATION_ERROR); }
  return bytes;
}
export function canonicalKey(value: unknown): Buffer {
  const bytes = canonicalBytes(value);
  if (bytes.length !== 32) { bytes.fill(0); throw new Error(MIGRATION_ERROR); }
  return bytes;
}
export function protectedDigest(mailPath: string): string {
  return createHash("sha256").update(fs.readFileSync(path.join(mailPath, "key.protected"))).digest("hex");
}
export function parseCurrentRecord(value: unknown): CurrentRecord {
  if (!exact(value, ["version", "name", "sourceProtectedKeySha256", "wrappedKey"]) ||
      value.version !== 1 || value.name !== CURRENT_NAME ||
      typeof value.sourceProtectedKeySha256 !== "string" || !digestPattern.test(value.sourceProtectedKeySha256))
    throw new Error(MIGRATION_ERROR);
  canonicalBytes(value.wrappedKey).fill(0);
  return value as CurrentRecord;
}
export function readCurrentRecord(mailPath: string): CurrentRecord | undefined {
  const file = path.join(mailPath, "key.current.json");
  let fd: number | undefined;
  let present = false;
  try {
    // Only ENOENT for the record itself means absence. A broken link is corruption.
    const stat = fs.lstatSync(file);
    present = true;
    if (!stat.isFile() || stat.size > MAX_PAYLOAD || !stat.size) throw new Error(MIGRATION_ERROR);
    fd = fs.openSync(file, "r");
    const bytes = Buffer.alloc(MAX_PAYLOAD + 1);
    try {
      const length = fs.readSync(fd, bytes, 0, bytes.length, 0);
      if (!length || length > MAX_PAYLOAD) throw new Error(MIGRATION_ERROR);
      const record = parseCurrentRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))));
      if (record.sourceProtectedKeySha256 !== protectedDigest(mailPath)) throw new Error(MIGRATION_ERROR);
      return record;
    } finally { bytes.fill(0); }
  } catch (error) {
    if (!present && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(MIGRATION_ERROR);
  } finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { throw new Error(MIGRATION_ERROR); } } }
}

export const commitFiles = { openSync: fs.openSync, writeFileSync: fs.writeFileSync, fsyncSync: fs.fsyncSync,
  closeSync: fs.closeSync, renameSync: fs.renameSync, readFileSync: fs.readFileSync };
export function commitCurrentRecord(mailPath: string, record: CurrentRecord, io = commitFiles): void {
  const file = path.join(mailPath, "key.current.json");
  const temporary = `${file}.${randomBytes(12).toString("hex")}.tmp`;
  const text = JSON.stringify(parseCurrentRecord(record));
  let fd: number | undefined;
  try {
    if (Buffer.byteLength(text) > MAX_PAYLOAD) throw new Error(MIGRATION_ERROR);
    fd = io.openSync(temporary, "wx", 0o600);
    io.writeFileSync(fd, text);
    io.fsyncSync(fd);
    io.closeSync(fd); fd = undefined;
    if (protectedDigest(mailPath) !== record.sourceProtectedKeySha256) throw new Error(MIGRATION_ERROR);
    try { fs.lstatSync(file); throw new Error(MIGRATION_ERROR); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    io.renameSync(temporary, file);
    fd = io.openSync(mailPath, "r");
    io.fsyncSync(fd);
    io.closeSync(fd); fd = undefined;
    if (io.readFileSync(file, "utf8") !== text || readCurrentRecord(mailPath)?.wrappedKey !== record.wrappedKey)
      throw new Error(MIGRATION_ERROR);
  } catch { throw new Error(MIGRATION_ERROR); }
  finally {
    if (fd !== undefined) { try { io.closeSync(fd); } catch { /* Reported by the failed commit. */ } }
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { throw new Error(MIGRATION_ERROR); }
  }
}

export function encodeFrame(value: unknown): Buffer {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  if (!bytes.length || bytes.length > MAX_PAYLOAD) throw new Error(MIGRATION_ERROR);
  const frame = Buffer.alloc(4 + bytes.length);
  frame.writeUInt32BE(bytes.length); bytes.copy(frame, 4); bytes.fill(0);
  return frame;
}
export function readFrame(stream: Readable): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Fixed storage bounds even an adversarial stream; data is accepted only at EOF.
    const bytes = Buffer.alloc(MAX_PAYLOAD + 4);
    let used = 0, failed = false, ended = false;
    const fail = () => { if (!failed) { failed = true; bytes.fill(0); reject(new Error(MIGRATION_ERROR)); } };
    stream.on("data", (chunk: Buffer) => {
      if (failed) return;
      if (used + chunk.length > bytes.length) { fail(); return; }
      chunk.copy(bytes, used); used += chunk.length;
      if (used >= 4) {
        const length = bytes.readUInt32BE(0);
        if (!length || length > MAX_PAYLOAD || used > length + 4) fail();
      }
    });
    stream.once("error", fail);
    stream.once("close", () => { if (!ended) fail(); });
    stream.once("end", () => {
      ended = true;
      if (failed) return;
      try {
        if (used < 4 || used !== bytes.readUInt32BE(0) + 4) throw new Error(MIGRATION_ERROR);
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(4, used));
        resolve(JSON.parse(text));
      } catch { fail(); }
      finally { bytes.fill(0); }
    });
  });
}
export function parseRequest(value: unknown): Request {
  if (!exact(value, ["version", "nonce", "sourceProtectedKeySha256", "key"]) || value.version !== 1 ||
      typeof value.nonce !== "string" || !digestPattern.test(value.nonce) ||
      typeof value.sourceProtectedKeySha256 !== "string" || !digestPattern.test(value.sourceProtectedKeySha256))
    throw new Error(MIGRATION_ERROR);
  canonicalKey(value.key).fill(0);
  return value as Request;
}
function authentication(key: Buffer, nonce: string, digest: string, wrappedKey: string): string {
  return createHmac("sha256", key).update(JSON.stringify([1, nonce, digest, wrappedKey])).digest("hex");
}
export function wrapRequest(value: unknown, storage: { isEncryptionAvailable(): boolean; encryptString(key: string): Buffer; decryptString(bytes: Buffer): string }): Response {
  const request = parseRequest(value), key = canonicalKey(request.key);
  let roundtrip: Buffer | undefined, wrapped: Buffer | undefined;
  try {
    if (!storage.isEncryptionAvailable()) throw new Error(MIGRATION_ERROR);
    wrapped = storage.encryptString(request.key);
    const wrappedKey = wrapped.toString("base64");
    canonicalBytes(wrappedKey).fill(0);
    roundtrip = canonicalKey(storage.decryptString(wrapped));
    if (!timingSafeEqual(key, roundtrip)) throw new Error(MIGRATION_ERROR);
    return { version: 1, nonce: request.nonce, sourceProtectedKeySha256: request.sourceProtectedKeySha256,
      wrappedKey, mac: authentication(roundtrip, request.nonce, request.sourceProtectedKeySha256, wrappedKey) };
  } finally { key.fill(0); roundtrip?.fill(0); wrapped?.fill(0); request.key = ""; }
}
function verifyResponse(value: unknown, request: Request, key: Buffer): CurrentRecord {
  if (!exact(value, ["version", "nonce", "sourceProtectedKeySha256", "wrappedKey", "mac"]) ||
      value.version !== 1 || value.nonce !== request.nonce || value.sourceProtectedKeySha256 !== request.sourceProtectedKeySha256 ||
      typeof value.mac !== "string" || !digestPattern.test(value.mac)) throw new Error(MIGRATION_ERROR);
  canonicalBytes(value.wrappedKey).fill(0);
  const expected = authentication(key, request.nonce, request.sourceProtectedKeySha256, value.wrappedKey as string);
  if (!timingSafeEqual(Buffer.from(value.mac, "hex"), Buffer.from(expected, "hex"))) throw new Error(MIGRATION_ERROR);
  return parseCurrentRecord({ version: 1, name: CURRENT_NAME, sourceProtectedKeySha256: request.sourceProtectedKeySha256, wrappedKey: value.wrappedKey });
}

export function helperEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const name of ["HOME", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "__CF_USER_TEXT_ENCODING"])
    if (env[name] !== undefined) result[name] = env[name];
  return result;
}
export function createHelperProfile(): string {
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()), "emc2-keychain-"));
  fs.chmodSync(parent, 0o700);
  const profile = path.join(parent, "profile");
  fs.mkdirSync(profile, { mode: 0o700 });
  return profile;
}
export function validateHelperProfile(args: string[], effective: string, tty: boolean): string {
  if (process.platform !== "darwin" || tty || args.filter(arg => arg === HELPER_FLAG).length !== 1) throw new Error(MIGRATION_ERROR);
  const switches = args.filter(arg => arg === "--user-data-dir" || arg.startsWith("--user-data-dir="));
  if (switches.length !== 1 || !switches[0].startsWith("--user-data-dir=")) throw new Error(MIGRATION_ERROR);
  const profile = switches[0].slice("--user-data-dir=".length), parent = path.dirname(profile);
  const terminator = args.indexOf("--");
  if ((terminator >= 0 && args.indexOf(switches[0]) > terminator) || !path.isAbsolute(profile) ||
      profile !== effective || fs.realpathSync(profile) !== profile || fs.realpathSync(parent) !== parent ||
      path.dirname(parent) !== fs.realpathSync(tmpdir()) || !/^emc2-keychain-[A-Za-z0-9]+$/.test(path.basename(parent)) ||
      path.basename(profile) !== "profile") throw new Error(MIGRATION_ERROR);
  for (const directory of [parent, profile]) {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700)
      throw new Error(MIGRATION_ERROR);
  }
  if (fs.readdirSync(profile).length || fs.readdirSync(parent).join() !== "profile") throw new Error(MIGRATION_ERROR);
  return profile;
}

type Lifecycle = { isPackaged: boolean; getAppPath(): string; on(event: "before-quit", handler: (event: { preventDefault(): void }) => void): unknown;
  removeListener(event: "before-quit", handler: (event: { preventDefault(): void }) => void): unknown; quit(): void; exit(code: number): void };
export async function migrateLegacyKey(options: { mailPath: string; key: string; app: Lifecycle; deadlineMs?: number; spawnChild?: typeof spawn }): Promise<void> {
  let profile: string | undefined, child: ReturnType<typeof spawn> | undefined;
  const key = canonicalKey(options.key);
  let closed = false;
  let priorUncaught: NodeJS.UncaughtExceptionListener[] | undefined;
  let priorRejections: NodeJS.UnhandledRejectionListener[] | undefined;
  const cleanup = () => {
    if (profile && (!child || closed)) {
      try { fs.rmSync(path.dirname(profile), { recursive: true, force: true }); }
      catch { throw new Error(MIGRATION_ERROR); }
    }
  };
  let cancel: (() => Promise<void>) | undefined;
  const quit = (event: { preventDefault(): void }) => { event.preventDefault(); void cancel?.().then(() => options.app.quit()); };
  const fatal = () => { void cancel?.().then(() => options.app.exit(1), () => options.app.exit(1)); };
  const signal = () => fatal();
  try {
    const request: Request = { version: 1, nonce: randomBytes(32).toString("hex"), sourceProtectedKeySha256: protectedDigest(options.mailPath), key: options.key };
    profile = createHelperProfile();
    const args = [...(options.app.isPackaged ? [] : [options.app.getAppPath()]), HELPER_FLAG, `--user-data-dir=${profile}`];
    const owned = (options.spawnChild ?? spawn)(process.execPath, args, { stdio: ["pipe", "pipe", "ignore"], env: helperEnvironment(process.env) });
    child = owned;
    let failed = false;
    const exit = new Promise<void>((resolve) => owned.once("close", (code, signal) => {
      closed = true;
      if (code !== 0 || signal) failed = true;
      resolve();
    }));
    cancel = async () => {
      failed = true;
      if (!closed) owned.kill("SIGKILL");
      await exit;
      options.app.removeListener("before-quit", quit);
      key.fill(0);
      cleanup();
    };
    options.app.on("before-quit", quit);
    priorUncaught = process.listeners("uncaughtException");
    priorRejections = process.listeners("unhandledRejection");
    // The existing Electron listener would otherwise display the same raw error.
    process.removeAllListeners("uncaughtException"); process.removeAllListeners("unhandledRejection");
    process.on("uncaughtException", fatal); process.on("unhandledRejection", fatal);
    process.on("SIGTERM", signal); process.on("SIGINT", signal);
    const timer = setTimeout(() => { void cancel?.(); }, options.deadlineMs ?? 5 * 60 * 1000);
    try {
      if (!owned.stdin || !owned.stdout) { await cancel(); throw new Error(MIGRATION_ERROR); }
      owned.once("error", () => { void cancel?.(); });
      owned.stdin.on("error", () => { void cancel?.(); });
      const response = readFrame(owned.stdout).catch(async () => { await cancel?.(); return undefined; });
      const frame = encodeFrame(request); request.key = "";
      owned.stdin.end(frame, () => frame.fill(0));
      const value = await response;
      await exit;
      if (failed) throw new Error(MIGRATION_ERROR);
      const record = verifyResponse(value, request, key);
      commitCurrentRecord(options.mailPath, record);
    } finally { clearTimeout(timer); }
  } catch {
    if (cancel && !closed) await cancel();
    throw new Error(MIGRATION_ERROR);
  } finally {
    options.app.removeListener("before-quit", quit);
    process.removeListener("uncaughtException", fatal); process.removeListener("unhandledRejection", fatal);
    process.removeListener("SIGTERM", signal); process.removeListener("SIGINT", signal);
    if (priorUncaught) for (const handler of priorUncaught) process.on("uncaughtException", handler);
    if (priorRejections) for (const handler of priorRejections) process.on("unhandledRejection", handler);
    key.fill(0);
    // A hard-killed parent cannot run this cleanup, especially during a native prompt.
    cleanup();
  }
}
