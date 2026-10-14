import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync, type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { after, test } from "node:test";
import { canonicalKey, commitCurrentRecord, commitFiles, encodeFrame, HELPER_FLAG,
  helperEnvironment, MAX_PAYLOAD, MIGRATION_ERROR, migrateLegacyKey, parseCurrentRecord, protectedDigest,
  readCurrentRecord, readFrame, wrapRequest, type CurrentRecord } from "./keychain.js";

const root = fs.mkdtempSync(path.join(tmpdir(), "emc2-keychain-tests-"));
const posixOnly = process.platform === "win32" ? "requires POSIX directory fsync and permission semantics" : false;
after(() => fs.rmSync(root, { recursive: true, force: true }));
function fixture() {
  const mail = fs.mkdtempSync(path.join(root, "mail-"));
  const original = randomBytes(80), metadata = Buffer.from('original legacy metadata');
  fs.writeFileSync(path.join(mail, "key.protected"), original);
  fs.writeFileSync(path.join(mail, "keychain-identity.json"), metadata);
  fs.writeFileSync(path.join(mail, "mail.sqlite"), "synthetic untouched database");
  const record: CurrentRecord = { version: 1, name: "Emc²", sourceProtectedKeySha256: protectedDigest(mail), wrappedKey: Buffer.from("synthetic wrapper").toString("base64") };
  return { mail, original, metadata, record };
}
function preserved(saved: ReturnType<typeof fixture>) {
  assert.deepEqual(fs.readFileSync(path.join(saved.mail, "key.protected")), saved.original);
  assert.deepEqual(fs.readFileSync(path.join(saved.mail, "keychain-identity.json")), saved.metadata);
  assert.equal(fs.readFileSync(path.join(saved.mail, "mail.sqlite"), "utf8"), "synthetic untouched database");
}

test("strict bounded current record binds retained original bytes", { skip: posixOnly }, () => {
  const saved = fixture();
  assert.equal(readCurrentRecord(saved.mail), undefined);
  commitCurrentRecord(saved.mail, saved.record);
  assert.deepEqual(readCurrentRecord(saved.mail), saved.record);
  assert.equal(fs.statSync(path.join(saved.mail, "key.current.json")).mode & 0o777, 0o600);
  assert.throws(() => commitCurrentRecord(saved.mail, saved.record), { message: MIGRATION_ERROR });
  preserved(saved);
});
for (const [name, value] of Object.entries({
  version: { version: 2 }, name: { name: "Aggregate Mail" }, missing: { wrappedKey: undefined },
  extra: { surprise: true }, digest: { sourceProtectedKeySha256: "z".repeat(64) },
  empty: { wrappedKey: "" }, noncanonical: { wrappedKey: "YQ== " },
})) test(`current record rejects ${name}`, () => {
  const saved = fixture();
  assert.throws(() => parseCurrentRecord({ ...saved.record, ...value }), { message: MIGRATION_ERROR });
  preserved(saved);
});
for (const kind of ["malformed", "oversized", "digest-mismatch", "missing-original", "directory", "symlink"])
  test(`committed ${kind} fails closed rather than appearing absent`, { skip: kind === "symlink" && process.platform === "win32" ? "symlink fixture is not portable to Windows" : false }, () => {
    const saved = fixture(), file = path.join(saved.mail, "key.current.json");
    if (kind === "directory") fs.mkdirSync(file);
    else if (kind === "symlink") fs.symlinkSync(path.join(saved.mail, "absent"), file);
    else fs.writeFileSync(file, kind === "malformed" ? "{" : kind === "oversized" ? " ".repeat(MAX_PAYLOAD + 1) : JSON.stringify({
      ...saved.record, sourceProtectedKeySha256: kind === "digest-mismatch" ? "0".repeat(64) : saved.record.sourceProtectedKeySha256,
    }));
    if (kind === "missing-original") fs.unlinkSync(path.join(saved.mail, "key.protected"));
    assert.throws(() => readCurrentRecord(saved.mail), { message: MIGRATION_ERROR });
  });
for (const key of ["short", "A".repeat(43) + "= ", "A".repeat(42) + "B=", randomBytes(33).toString("base64")])
  test(`canonical key rejects ${key.length}-character invalid value`, () => assert.throws(() => canonicalKey(key), { message: MIGRATION_ERROR }));

for (const stage of ["open", "write", "file-fsync", "close", "rename", "directory-fsync", "readback"])
  test(`interrupted persistence at ${stage} preserves originals and never promotes a partial record`, { skip: (stage === "directory-fsync" || stage === "readback") && process.platform === "win32" ? "requires POSIX directory fsync" : false }, () => {
    const saved = fixture();
    let flushes = 0, closes = 0;
    const fail = () => { throw Error("SYNTHETIC_SECRET_MARKER"); };
    const io: typeof commitFiles = { ...commitFiles,
      openSync: (...args) => stage === "open" ? fail() : commitFiles.openSync(...args),
      writeFileSync: (...args) => stage === "write" ? fail() : commitFiles.writeFileSync(...args),
      fsyncSync: (...args) => { flushes++; if (stage === "file-fsync" && flushes === 1 || stage === "directory-fsync" && flushes === 2) fail(); return commitFiles.fsyncSync(...args); },
      closeSync: (...args) => { closes++; if (stage === "close" && closes === 1) fail(); return commitFiles.closeSync(...args); },
      renameSync: (...args) => stage === "rename" ? fail() : commitFiles.renameSync(...args),
      readFileSync: ((...args: Parameters<typeof fs.readFileSync>) => stage === "readback" ? "wrong readback" : commitFiles.readFileSync(...args)) as typeof fs.readFileSync,
    };
    assert.throws(() => commitCurrentRecord(saved.mail, saved.record, io), { message: MIGRATION_ERROR });
    const afterRename = stage === "directory-fsync" || stage === "readback";
    assert.equal(!!readCurrentRecord(saved.mail), afterRename);
    assert.equal(fs.readdirSync(saved.mail).some(file => file.endsWith(".tmp")), false);
    preserved(saved);
  });
test("commit rechecks source digest and committed-record absence after file flush", () => {
  for (const collision of [false, true]) {
    const saved = fixture();
    const io = { ...commitFiles, fsyncSync(fd: number) {
      commitFiles.fsyncSync(fd);
      if (collision) fs.writeFileSync(path.join(saved.mail, "key.current.json"), "other writer");
      else fs.writeFileSync(path.join(saved.mail, "key.protected"), "changed by synthetic writer");
    } };
    assert.throws(() => commitCurrentRecord(saved.mail, saved.record, io), { message: MIGRATION_ERROR });
    if (collision) assert.equal(fs.readFileSync(path.join(saved.mail, "key.current.json"), "utf8"), "other writer");
    else assert.equal(fs.existsSync(path.join(saved.mail, "key.current.json")), false);
  }
});
test("uncommitted temporary record is ignored on restart", () => {
  const saved = fixture(); fs.writeFileSync(path.join(saved.mail, "key.current.json.interrupted.tmp"), JSON.stringify(saved.record));
  assert.equal(readCurrentRecord(saved.mail), undefined); preserved(saved);
});

test("one frame succeeds only after complete payload and normal EOF", async () => {
  const stream = new PassThrough(), frame = encodeFrame({ synthetic: true });
  let resolved = false;
  const result = readFrame(stream).then(value => { resolved = true; return value; });
  stream.write(frame.subarray(0, 2)); stream.write(frame.subarray(2));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(resolved, false);
  stream.end(); assert.deepEqual(await result, { synthetic: true });
});
const valid = encodeFrame({ synthetic: true });
for (const [name, bytes] of Object.entries({
  empty: Buffer.alloc(0), header: valid.subarray(0, 3), premature: valid.subarray(0, valid.length - 1),
  duplicate: Buffer.concat([valid, valid]), trailing: Buffer.concat([valid, Buffer.from("x")]),
  zero: Buffer.alloc(4), oversized: Buffer.from([0, 0, 64, 1]),
  json: Buffer.from([0, 0, 0, 1, 123]), utf8: Buffer.from([0, 0, 0, 1, 255]),
})) test(`private pipe rejects ${name}`, async () => {
  const stream = new PassThrough(), result = readFrame(stream);
  stream.end(bytes); await assert.rejects(result, { message: MIGRATION_ERROR });
});
test("abrupt pipe close fails without normal EOF", async () => {
  const stream = new PassThrough(), result = readFrame(stream); stream.write(valid); stream.destroy();
  await assert.rejects(result, { message: MIGRATION_ERROR });
});
test("environment allowlist excludes key, provider and Node injection entries", () => {
  assert.deepEqual(helperEnvironment({ HOME: "/synthetic", LANG: "C", MAIL_DATA_KEY: "secret", PROVIDER_TOKEN: "secret", NODE_OPTIONS: "secret", NODE_CHANNEL_FD: "4", ELECTRON_RUN_AS_NODE: "1", PATH: "untrusted" }), { HOME: "/synthetic", LANG: "C" });
});
test("helper roundtrip must preserve the exact canonical key", () => {
  const request = { version: 1, nonce: "a".repeat(64), sourceProtectedKeySha256: "b".repeat(64), key: randomBytes(32).toString("base64") };
  assert.throws(() => wrapRequest(request, { isEncryptionAvailable: () => true, encryptString: () => Buffer.from("wrapper"), decryptString: () => randomBytes(32).toString("base64") }));
});

class Application extends EventEmitter {
  isPackaged = true; quitCalls = 0; exitCalls = 0;
  getAppPath() { return "/unused"; }
  quit() { this.quitCalls++; }
  exit() { this.exitCalls++; }
}
const modulePath = new URL("./keychain.ts", import.meta.url).href;
function syntheticSpawner(mode: string, app: Application, receipt: { closed?: boolean; profile?: string; stdout?: string; stderr?: string; signal?: string | null }) {
  return ((executable: string, args: string[], options: SpawnOptions) => {
    assert.equal(executable, process.execPath);
    assert.equal(args[0], HELPER_FLAG); assert.equal(args.length, 2);
    assert.deepEqual(options.stdio, ["pipe", "pipe", "ignore"]);
    assert.equal(options.env?.MAIL_DATA_KEY, undefined);
    receipt.profile = args[1].slice("--user-data-dir=".length);
    assert.equal(fs.readdirSync(receipt.profile).length, 0);
    if (!posixOnly) assert.equal(fs.statSync(receipt.profile).mode & 0o777, 0o700);
    const code = `
      import { readFrame, encodeFrame, wrapRequest } from ${JSON.stringify(modulePath)};
      if (${JSON.stringify(mode)} === 'hang' || ${JSON.stringify(mode)} === 'quit' || ${JSON.stringify(mode)} === 'fatal') setInterval(() => {}, 1000);
      else {
        const request = await readFrame(process.stdin);
        const response = wrapRequest(request, { isEncryptionAvailable: () => true,
          encryptString: key => Buffer.from('wrapped:' + key), decryptString: bytes => bytes.toString().slice(8) });
        const mode = ${JSON.stringify(mode)};
        if (mode === 'nonce') response.nonce = '0'.repeat(64);
        if (mode === 'mac') response.mac = '0'.repeat(64);
        if (mode === 'digest') response.sourceProtectedKeySha256 = '0'.repeat(64);
        if (mode === 'version') response.version = 2;
        let frame = encodeFrame(response);
        if (mode === 'premature') frame = frame.subarray(0, frame.length - 1);
        if (mode === 'duplicate') frame = Buffer.concat([frame, frame]);
        if (mode === 'trailing') frame = Buffer.concat([frame, Buffer.from('x')]);
        process.stdout.end(frame, () => {
          if (mode === 'signal') process.kill(process.pid, 'SIGTERM');
          else process.exit(mode === 'nonzero' ? 7 : 0);
        });
      }
    `;
    const child = mode === "spawn-error" ? spawn("/synthetic/no-such-executable", [], options) :
      spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], options);
    child.on("close", (_code, signal) => { receipt.closed = true; receipt.signal = signal; });
    if (mode === "quit") setTimeout(() => {
      let prevented = false;
      app.emit("before-quit", { preventDefault() { prevented = true; } });
      assert.equal(prevented, true); assert.equal(app.quitCalls, 0);
    }, 30);
    if (mode === "fatal") setTimeout(() => process.emit("unhandledRejection", Error("SYNTHETIC_SECRET_MARKER"), Promise.resolve()), 30);
    return child;
  }) as typeof spawn;
}
for (const mode of ["success", "nonce", "mac", "digest", "version", "premature", "duplicate", "trailing", "nonzero", "signal", "hang", "spawn-error", "quit", "fatal"])
  test(`owned child ${mode}: authenticated EOF and observed exit gate the additive commit`, { skip: mode === "success" ? posixOnly : false }, async () => {
    if (mode === "fatal") {
      const saved = fixture();
      const source = `
        import { migrateLegacyKey } from ${JSON.stringify(modulePath)};
        import { spawn } from 'node:child_process';
        import { EventEmitter } from 'node:events';
        import { existsSync, readFileSync } from 'node:fs';
        import path from 'node:path';
        let profile, closed = false;
        process.on('unhandledRejection', error => console.error(error));
        class App extends EventEmitter {
          isPackaged = true; getAppPath() { return '/unused'; } quit() {};
          exit() { console.log(JSON.stringify({ exited: true, closed, removed: !existsSync(path.dirname(profile)) })); process.exit(0); }
        }
        const app = new App();
        migrateLegacyKey({ mailPath: ${JSON.stringify(saved.mail)}, key: readFileSync(0, 'utf8'), app,
          spawnChild(exe, args, options) {
            profile = args[1].slice('--user-data-dir='.length);
            const child = spawn(exe, ['-e', 'setInterval(() => {}, 1000)'], options);
            child.on('close', () => { closed = true; });
            setTimeout(() => Promise.reject(Error('SYNTHETIC_SECRET_MARKER')), 30);
            return child;
          }
        }).catch(() => {});
      `;
      const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], { encoding: "utf8", timeout: 5000, input: randomBytes(32).toString("base64") });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { exited: true, closed: true, removed: true });
      assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_SECRET_MARKER/);
      assert.equal(fs.existsSync(path.join(saved.mail, "key.current.json")), false); preserved(saved);
      return;
    }
    const saved = fixture(), app = new Application(), receipt: { closed?: boolean; profile?: string; signal?: string | null } = {};
    const run = migrateLegacyKey({ mailPath: saved.mail, key: randomBytes(32).toString("base64"), app,
      deadlineMs: mode === "hang" ? 150 : 3000, spawnChild: syntheticSpawner(mode, app, receipt) });
    if (mode === "success") await run;
    else await assert.rejects(run, { message: MIGRATION_ERROR });
    assert.equal(receipt.closed, true);
    assert.equal(fs.existsSync(path.dirname(receipt.profile!)), false);
    assert.equal(fs.existsSync(path.join(saved.mail, "key.current.json")), mode === "success");
    if (mode === "hang" || mode === "quit") assert.equal(receipt.signal, "SIGKILL");
    await new Promise(resolve => setImmediate(resolve));
    if (mode === "quit") assert.equal(app.quitCalls, 1);
    assert.equal(app.listenerCount("before-quit"), 0);
    preserved(saved);
  });
test("synchronous parent spawn exception is sanitized and temporary profile removed", async () => {
  const saved = fixture(), app = new Application(); let profile = "";
  const spawnChild = ((_exec: string, args: string[]) => { profile = args[1].slice("--user-data-dir=".length); throw Error("SYNTHETIC_SECRET_MARKER"); }) as unknown as typeof spawn;
  await assert.rejects(migrateLegacyKey({ mailPath: saved.mail, key: randomBytes(32).toString("base64"), app, spawnChild }), { message: MIGRATION_ERROR });
  assert.equal(fs.existsSync(path.dirname(profile)), false); preserved(saved);
});
