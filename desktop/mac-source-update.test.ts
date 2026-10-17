import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { watch } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { MacSourceUpdate, bundleDigest, explicitUpdateProfile, runBounded, sourceApi, sourceCandidate, sourceEnvironment,
  sourceRepository, stampSourceVersion, validateDestination, verifyBundle, workspaceLimit, type MacSourceCandidate, type Run } from "./mac-source-update.js";

const candidate: MacSourceCandidate = { kind: "mac-source", version: "0.1.12", tag: "v0.1.12", commit: "a".repeat(40), arch: "x64" };
const release = { draft: false, prerelease: false, tag_name: candidate.tag };
const ref = { ref: `refs/tags/${candidate.tag}`, object: { type: "commit", sha: candidate.commit } };
const pkg = () => ({ name: "emc2", version: "0.1.10", scripts: { "package:mac:dir": "npm run build && electron-builder --mac --dir --publish never" },
  build: { appId: "dev.screen.aggregate-mail", productName: "Emc²", afterPack: "scripts/sign-mac.cjs", mac: { identity: null, notarize: false } }, dependencies: { synthetic: "1.2.3" } });
const lock = () => ({ name: "emc2", version: "0.1.10", lockfileVersion: 3,
  packages: { "": { name: "emc2", version: "0.1.10", dependencies: { synthetic: "1.2.3" } }, "node_modules/synthetic": { version: "1.2.3", integrity: "synthetic" } } });
async function sourceFiles(checkout: string) {
  await writeFile(path.join(checkout, "package.json"), JSON.stringify(pkg()));
  await writeFile(path.join(checkout, "package-lock.json"), JSON.stringify(lock()));
}
export async function syntheticBundle(bundle: string, executable = "synthetic executable, never run") {
  await mkdir(path.join(bundle, "Contents/MacOS"), { recursive: true });
  await writeFile(path.join(bundle, "Contents/Info.plist"), "synthetic plist");
  await writeFile(path.join(bundle, "Contents/MacOS/Emc²"), executable, { mode: 0o755 });
}
const verifyRun: Run = async (command, args) => {
  if (command.endsWith("codesign")) { assert.deepEqual(args.slice(0, 3), ["--verify", "--deep", "--strict"]); return ""; }
  if (command.endsWith("plutil")) return ({ CFBundleIdentifier: "dev.screen.aggregate-mail", CFBundleShortVersionString: candidate.version, CFBundleExecutable: "Emc²" } as Record<string, string>)[args[1]];
  if (command.endsWith("lipo")) return "x86_64";
  throw new Error("Unexpected verification command");
};

test("source selection pins only canonical stable higher tags to an immutable commit and process architecture", async () => {
  const urls: string[] = [];
  const read = async (url: string) => { urls.push(url); return JSON.stringify(ref); };
  assert.deepEqual(await sourceCandidate(release, { version: "0.1.10", arch: "x64" }, read), candidate);
  assert.deepEqual(urls, [`${sourceApi}/git/ref/tags/v0.1.12`]);
  for (const invalid of [{ ...release, draft: true }, { ...release, prerelease: true }, { ...release, tag_name: "v01.1.12" },
    { ...release, tag_name: "v0.1.12-ci.1" }, { ...release, tag_name: "v0.1.12/evil" }])
    await assert.rejects(sourceCandidate(invalid, { version: "0.1.10", arch: "x64" }, read));
  for (const object of [{ type: "commit", sha: "main" }, { type: "tree", sha: candidate.commit }])
    await assert.rejects(sourceCandidate(release, { version: "0.1.10", arch: "x64" }, async () => JSON.stringify({ ...ref, object })));
  await assert.rejects(sourceCandidate(release, { version: "broken", arch: "x64" }, read));
  await assert.rejects(sourceCandidate(release, { version: "0.1.10", arch: "ia32" }, read));
  assert.equal(await sourceCandidate(release, { version: "0.1.12", arch: "arm64" }, read), null);
  assert.equal(await sourceCandidate(release, { version: "0.1.13", arch: "arm64" }, read), null);
});

test("annotated tags are peeled through bounded canonical API reads", async () => {
  const urls: string[] = [];
  const found = await sourceCandidate(release, { version: "0.1.10", arch: "arm64" }, async url => {
    urls.push(url);
    return JSON.stringify(url.includes("/git/tags/") ? { sha: "b".repeat(40), object: ref.object } : { ...ref, object: { type: "tag", sha: "b".repeat(40) } });
  });
  assert.equal(found?.arch, "arm64");
  assert.equal(urls[1], `${sourceApi}/git/tags/${"b".repeat(40)}`);
  let calls = 0;
  await assert.rejects(sourceCandidate(release, { version: "0.1.10", arch: "x64" }, async () => {
    calls++; return JSON.stringify({ ...ref, sha: "b".repeat(40), object: { type: "tag", sha: "b".repeat(40) } });
  }));
  assert.equal(calls, 5);
});

test("disposable version stamping changes exactly the package and lock roots, preserving dependencies and identity", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "emc2-source-stamp-")));
  try {
    await sourceFiles(root); await stampSourceVersion(root, candidate.version);
    const next = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    const nextLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
    assert.deepEqual(next, { ...pkg(), version: candidate.version });
    const expected = lock(); expected.version = expected.packages[""].version = candidate.version;
    assert.deepEqual(nextLock, expected);
    await assert.rejects(stampSourceVersion(root, "0.1.12-ci.1"));
    if (process.platform !== "win32") {
      const outside = path.join(root, "outside"); await writeFile(outside, JSON.stringify(pkg()));
      await rm(path.join(root, "package.json")); await symlink(outside, path.join(root, "package.json"));
      await assert.rejects(stampSourceVersion(root, candidate.version));
      assert.equal(await readFile(outside, "utf8"), JSON.stringify(pkg()));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("tool environment excludes launch secrets and injection variables and knows Finder toolchain paths", () => {
  const env = sourceEnvironment("/synthetic/private-build", "/usr/local/opt/node@24/bin");
  assert.deepEqual(Object.keys(env).sort(), ["HOME", "TMPDIR", "PATH", "LANG", "NPM_CONFIG_USERCONFIG", "NPM_CONFIG_GLOBALCONFIG", "CSC_IDENTITY_AUTO_DISCOVERY", "GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_GLOBAL", "GIT_TERMINAL_PROMPT"].sort());
  for (const key of ["NODE_OPTIONS", "ELECTRON_RUN_AS_NODE", "MAIL_DATA_KEY", "MAIL_DESKTOP_TOKEN", "NPM_TOKEN", "GITHUB_TOKEN", "SSH_AUTH_SOCK"])
    assert.equal(env[key], undefined);
  assert.ok(env.PATH!.startsWith("/usr/local/opt/node@24/bin:"));
  assert.ok(env.PATH!.includes("/opt/homebrew/bin"));
  assert.equal(env.NPM_CONFIG_USERCONFIG, path.join(env.HOME!, "npm-user.npmrc"));
  assert.equal(env.NPM_CONFIG_GLOBALCONFIG, path.join(env.HOME!, "npm-global.npmrc"));
});

test("real npm preflight rejects shared config paths and accepts the isolated source environment", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "emc2-source-npm-")));
  try {
    const npm = await realpath(process.env.npm_execpath || path.join(path.dirname(process.execPath),
      process.platform === "win32" ? "node_modules/npm/bin/npm-cli.js" : "npm"));
    const env = sourceEnvironment(root, path.dirname(process.execPath));
    const empty = process.platform === "win32" ? path.join(root, "empty.npmrc") : "/dev/null";
    if (process.platform === "win32") await writeFile(empty, "");
    const old = spawnSync(process.execPath, [npm, "--version"], { cwd: root,
      env: { ...env, NPM_CONFIG_USERCONFIG: empty, NPM_CONFIG_GLOBALCONFIG: empty }, encoding: "utf8", timeout: 30000 });
    assert.ifError(old.error);
    assert.equal(old.status, 1);
    assert.match(old.stderr, /double-loading config/);
    const repaired = spawnSync(process.execPath, [npm, "--version"], { cwd: root, env, encoding: "utf8", timeout: 30000 });
    assert.ifError(repaired.error);
    assert.equal(repaired.status, 0, repaired.stderr);
    assert.match(repaired.stdout.trim(), /^\d+\.\d+\.\d+$/);
    assert.equal(await runBounded(process.execPath, [npm, "--version"], root, env, new AbortController().signal), repaired.stdout.trim());
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("bounded executor kills timeout, excessive output and cancellation and suppresses raw stderr", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "emc2-source-run-")));
  const signal = new AbortController().signal;
  try {
    assert.equal(await runBounded(process.execPath, ["-e", "process.stdout.write('ok')"], root, sourceEnvironment(root), signal), "ok");
    if (process.platform === "win32") return; // Process-group termination is POSIX-only.
    await assert.rejects(runBounded(process.execPath, ["-e", "setInterval(()=>{},1000)"], root, sourceEnvironment(root), signal, 50), /mac-source-update/);
    await assert.rejects(runBounded(process.execPath, ["-e", "process.stderr.write('x'.repeat(2**21))"], root, sourceEnvironment(root), signal), /mac-source-update/);
    const abort = new AbortController();
    const running = runBounded(process.execPath, ["-e", "setInterval(()=>{},1000)"], root, sourceEnvironment(root), abort.signal);
    abort.abort(); await assert.rejects(running);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("workspace quota rejects oversized downloads and never follows dependency symlinks", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "emc2-source-quota-")));
  try {
    const workspace = path.join(root, "workspace"), outside = path.join(root, "outside");
    await mkdir(workspace); await mkdir(outside);
    await writeFile(path.join(outside, "sparse"), ""); await truncate(path.join(outside, "sparse"), 7 * 1024 ** 3);
    await symlink(outside, path.join(workspace, "dependency-link"), "junction");
    await workspaceLimit(workspace);
    await writeFile(path.join(workspace, "sparse"), ""); await truncate(path.join(workspace, "sparse"), 7 * 1024 ** 3);
    await assert.rejects(workspaceLimit(workspace));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("bundle verification rejects wrong signature, identity, version, architecture, escaped links and tampering", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "emc2-source-verify-")));
  const bundle = path.join(root, "staged.app"), signal = new AbortController().signal, env = sourceEnvironment(root);
  try {
    await syntheticBundle(bundle);
    const digest = await verifyBundle(bundle, candidate, root, env, signal, verifyRun);
    for (const fail of ["codesign", "CFBundleIdentifier", "CFBundleShortVersionString", "CFBundleExecutable", "lipo"])
      await assert.rejects(verifyBundle(bundle, candidate, root, env, signal, async (cmd, args, ...rest) => {
        if (cmd.endsWith(fail)) throw new Error("signature or arch failure");
        if (args.includes(fail)) return "wrong";
        return verifyRun(cmd, args, ...rest);
      }));
    await writeFile(path.join(bundle, "Contents/MacOS/Emc²"), "tampered");
    assert.notEqual(await bundleDigest(bundle), digest);
    if (process.platform !== "win32") {
      await symlink("Info.plist", path.join(bundle, "Contents/allowed-link"));
      await bundleDigest(bundle);
    }
    await symlink(root, path.join(bundle, "Contents/escaped-link"), "junction");
    await assert.rejects(bundleDigest(bundle));
    const link = path.join(root, "linked.app"); await symlink(bundle, link, "junction");
    await assert.rejects(validateDestination(link));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("bundle digest uses on-disk ASAR bytes and metadata in Electron and standalone Node", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "emc2-source-digest-")));
  try {
    const bundle = path.join(root, "staged.app"), adapter = path.join(root, "adapter.cjs");
    await syntheticBundle(bundle);
    const archive = path.join(bundle, "Contents/app.asar");
    await writeFile(archive, "synthetic raw archive bytes");
    const expected = await bundleDigest(bundle);
    await build({ entryPoints: ["desktop/mac-source-update.ts"], outfile: adapter, bundle: true,
      platform: "node", format: "cjs", target: "node24" });
    for (const electron of [false, true]) {
      const result = spawnSync(process.execPath, ["-e", `
        const assert = require('node:assert/strict');
        const Module = require('node:module'), fs = require('node:fs');
        const raw = { ...fs.promises }, load = Module._load;
        const electron = process.argv[3] === 'true';
        let rawLoads = 0;
        if (electron) Object.defineProperty(process.versions, 'electron', { value: '44.7.0' });
        Module._load = function(id, ...args) {
          if (id === 'original-fs') {
            assert.ok(electron, 'standalone Node must not load original-fs');
            rawLoads++;
            return { promises: raw };
          }
          if (electron && id === 'node:fs/promises') return { ...raw, lstat: async (...args) => {
            const stat = await raw.lstat(...args);
            // Emulate Electron's virtual ASAR identity differing from the opened disk file.
            if (String(args[0]).endsWith('.asar')) stat.ino++;
            return stat;
          } };
          return load.call(this, id, ...args);
        };
        require(process.argv[1]).bundleDigest(process.argv[2]).then(digest => {
          assert.equal(rawLoads, electron ? 1 : 0);
          assert.equal(process.noAsar, undefined);
          process.stdout.write(digest);
        }).catch(error => { console.error(error); process.exitCode = 1; });
      `, adapter, bundle, String(electron)], { encoding: "utf8", timeout: 30000 });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, expected);
    }
    await writeFile(archive, "changed raw archive bytes");
    assert.notEqual(await bundleDigest(bundle), expected);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("only one effective absolute profile argument survives restart, without reading profile files", () => {
  const profile = path.resolve("synthetic/profile");
  assert.equal(explicitUpdateProfile(["app", `--user-data-dir=${profile}`], profile), profile);
  assert.equal(explicitUpdateProfile(["app"], profile), undefined);
  for (const args of [["--user-data-dir", profile], ["--user-data-dir="], ["--", `--user-data-dir=${profile}`],
    [`--user-data-dir=${profile}`, `--user-data-dir=${profile}`], ["--user-data-dir=relative"]])
    assert.throws(() => explicitUpdateProfile(args, profile));
});

async function builderFixture(beforeRun?: (cmd: string, args: string[], cwd: string, signal: AbortSignal) => Promise<void>) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "emc2-source-builder-")));
  const installed = path.join(root, "Installed.app"), profile = path.join(root, "profile"), helper = path.join(root, "helper.cjs");
  await syntheticBundle(installed, "old bundle"); await mkdir(profile);
  await writeFile(path.join(profile, "key.protected"), "synthetic unchanged wrapper");
  await writeFile(helper, "process.exit(1)");
  const calls: { cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }[] = [];
  const helperExits: Promise<void>[] = [];
  let fail = "", quit = 0;
  const run: Run = async (cmd, args, cwd, env, signal) => {
    calls.push({ cmd, args, cwd, env });
    await beforeRun?.(cmd, args, cwd, signal); signal.throwIfAborted();
    if (fail && (args.includes(fail) || cmd.endsWith(fail))) throw new Error("synthetic failure");
    if (fail === "npm" && path.basename(args[0] || "") === "npm") throw new Error("missing npm");
    if (cmd.endsWith("node") && args[0] === "--version") { if (cmd !== "/usr/bin/node") throw new Error("missing tool"); return fail === "old-node" ? "v23.0.0" : "v24.0.0"; }
    if (args[0] === "rev-parse") return fail === "commit-mismatch" ? "b".repeat(40) : candidate.commit;
    if (args.includes("checkout")) await sourceFiles(cwd);
    if (args.includes("ci")) {
      assert.equal(JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")).version, candidate.version);
      assert.deepEqual(args.slice(1), ["ci", "--no-audit", "--no-fund", `--cache=${path.join(env.HOME!, "npm-cache")}`]);
    }
    if (args.includes("package:mac:dir")) {
      assert.deepEqual(args.slice(-2), ["--", "--x64"]);
      await syntheticBundle(path.join(cwd, "release/mac/Emc².app"));
    }
    if (cmd.endsWith("ditto")) await cp(args[2], args[3], { recursive: true });
    if (["codesign", "plutil", "lipo"].some(tool => cmd.endsWith(tool))) return verifyRun(cmd, args, cwd, env, signal);
    return "";
  };
  const adapter = new MacSourceUpdate(candidate, { installed, helper, home: root, profile, quit: () => { quit++; } }, run, (_cmd, args, options) => {
    const child = spawn(process.execPath, args, options);
    // Ignored stdio needs no draining; IPC disconnect can omit the close event.
    helperExits.push(new Promise(resolve => child.once("exit", () => resolve())));
    return child;
  });
  return { root, installed, helper, profile, adapter, calls, quit: () => quit, fail: (value: string) => { fail = value; },
    workspace: async () => path.join(root, (await readdir(root)).find(name => name.startsWith(".emc2-update-"))!),
    cleanup: async () => { await Promise.all(helperExits); await rm(root, { recursive: true, force: true }); } };
}

test("builder fetches exact canonical tag, stamps only checkout, builds process arch and stages before quiescence", async () => {
  const f = await builderFixture();
  try {
    await f.adapter.build(); await f.adapter.verify();
    assert.ok(f.calls.some(call => call.args.includes(sourceRepository) && call.args.includes(`refs/tags/${candidate.tag}:refs/tags/${candidate.tag}`)));
    assert.ok(f.calls.some(call => call.args[0] === "rev-parse"));
    assert.equal(f.quit(), 0);
    assert.equal(await readFile(path.join(f.installed, "Contents/MacOS/Emc²"), "utf8"), "old bundle");
    assert.equal(await readFile(path.join(f.profile, "key.protected"), "utf8"), "synthetic unchanged wrapper");
    const workspace = await f.workspace();
    assert.deepEqual(await readdir(workspace), ["staged.app"]);
    await writeFile(path.join(workspace, "staged.app/Contents/Info.plist"), "tamper after staging");
    await assert.rejects(f.adapter.verify());
    assert.equal(f.quit(), 0);
  } finally { await f.adapter.dispose(); await f.cleanup(); }
});

test("commit mismatch, build/signature failure, missing tools and cancellation never replace, quit or mutate profile", async () => {
  for (const mode of ["commit-mismatch", "ci", "package:mac:dir", "codesign", "xcrun", "node", "old-node", "npm", "cancel"]) {
    const f = await builderFixture();
    try {
      if (mode === "cancel") f.adapter.stop(); else f.fail(mode);
      await assert.rejects(f.adapter.build());
      assert.equal(f.quit(), 0);
      assert.deepEqual((await readdir(f.root)).sort(), ["Installed.app", "helper.cjs", "profile"]);
      assert.equal(await readFile(path.join(f.profile, "key.protected"), "utf8"), "synthetic unchanged wrapper");
      assert.equal(await readFile(path.join(f.installed, "Contents/MacOS/Emc²"), "utf8"), "old bundle");
    } finally { await f.cleanup(); }
  }
});

test("missing helper readiness fails before quit and keeps installed bundle and profile", async () => {
  const f = await builderFixture();
  try {
    await f.adapter.build(); await assert.rejects(f.adapter.install());
    assert.equal(f.quit(), 0);
    assert.equal(await readFile(path.join(f.installed, "Contents/MacOS/Emc²"), "utf8"), "old bundle");
    assert.equal(await readFile(path.join(f.profile, "key.protected"), "utf8"), "synthetic unchanged wrapper");
  } finally { await f.adapter.dispose(); await f.cleanup(); }
});

test("quit happens only after helper ready and armed acknowledgements", async () => {
  const f = await builderFixture();
  try {
    await writeFile(f.helper, `const fs = require('node:fs'); process.once('message', request => {
      fs.writeFileSync('handshake.json', JSON.stringify(request));
      process.send('ready'); process.once('message', value => {
        if (value !== 'commit') process.exit(1);
        fs.writeFileSync('armed', 'yes'); process.send('armed');
      });
    }); process.on('disconnect', () => process.exit(0));`);
    await f.adapter.build(); assert.equal(f.quit(), 0); await f.adapter.install();
    assert.equal(f.quit(), 1);
    const workspace = await f.workspace();
    await f.adapter.dispose();
    assert.equal(await readFile(path.join(workspace, "armed"), "utf8"), "yes");
    const request = JSON.parse(await readFile(path.join(workspace, "handshake.json"), "utf8"));
    assert.equal(request.profile, f.profile); assert.equal(request.home, f.root); assert.equal(request.parent, process.pid);
    assert.equal(await readFile(path.join(f.installed, "Contents/MacOS/Emc²"), "utf8"), "old bundle", "helper must wait for parent exit");
  } finally { await f.cleanup(); }
});

test("disposing during helper readiness waits for its exit and never quits or replaces", async () => {
  const f = await builderFixture();
  try {
    await writeFile(f.helper, `process.once('message', () => { require('node:fs').writeFileSync('waiting', 'yes'); setInterval(()=>{},1000); });`);
    await f.adapter.build();
    const workspace = await f.workspace();
    const started = new Promise<void>((resolve, reject) => {
      const watcher = watch(workspace, (_event, file) => { if (file === "waiting") { clearTimeout(timer); watcher.close(); resolve(); } });
      const timer = setTimeout(() => { watcher.close(); reject(new Error("synthetic helper did not start")); }, 5000);
    });
    const rejected = assert.rejects(f.adapter.install());
    await started; await f.adapter.dispose(); await rejected;
    await assert.rejects(readdir(workspace), { code: "ENOENT" });
    assert.equal(f.quit(), 0);
    assert.equal(await readFile(path.join(f.installed, "Contents/MacOS/Emc²"), "utf8"), "old bundle");
    assert.equal(await readFile(path.join(f.profile, "key.protected"), "utf8"), "synthetic unchanged wrapper");
  } finally { await f.adapter.dispose(); await f.cleanup(); }
});

test("disposing a cancelled ready update removes only its unhanded workspace", async () => {
  const f = await builderFixture();
  try {
    await f.adapter.build();
    const workspace = await f.workspace();
    f.adapter.stop(); await f.adapter.dispose();
    await assert.rejects(readdir(workspace), { code: "ENOENT" });
    assert.equal(f.quit(), 0);
    assert.equal(await readFile(path.join(f.installed, "Contents/MacOS/Emc²"), "utf8"), "old bundle");
    assert.equal(await readFile(path.join(f.profile, "key.protected"), "utf8"), "synthetic unchanged wrapper");
  } finally { await f.adapter.dispose(); await f.cleanup(); }
});

test("disposal waits for an aborted build child to close before removing its workspace", async () => {
  let entered!: () => void, close!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const closed = new Promise<void>(resolve => { close = resolve; });
  const f = await builderFixture(async (_cmd, args) => {
    if (args.includes("ci")) { entered(); await closed; }
  });
  try {
    const building = assert.rejects(f.adapter.build());
    await started;
    const workspace = await f.workspace();
    let disposed = false;
    const disposing = f.adapter.dispose().then(() => { disposed = true; });
    try {
      await Promise.race([disposing, new Promise(resolve => setTimeout(resolve, 100))]);
      assert.equal(disposed, false, "disposal must wait for child close");
      assert.ok((await readdir(workspace)).includes("source"), "child still owns its working directory");
    } finally { close(); await building; await disposing; }
    await assert.rejects(readdir(workspace), { code: "ENOENT" });
    assert.equal(f.quit(), 0);
    assert.equal(await readFile(path.join(f.profile, "key.protected"), "utf8"), "synthetic unchanged wrapper");
  } finally { close(); await f.adapter.dispose(); await f.cleanup(); }
});
