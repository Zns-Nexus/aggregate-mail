import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { replaceAndLaunch, validateReplacement, waitForParentExit } from "./mac-update-helper.js";
import { bundleDigest, type MacSourceCandidate, type Run } from "./mac-source-update.js";

type Launch = NonNullable<Parameters<typeof replaceAndLaunch>[3]>;
const candidate: MacSourceCandidate = { kind: "mac-source", version: "0.1.12", tag: "v0.1.12", commit: "a".repeat(40), arch: "x64" };
const run: Run = async (cmd, args) => {
  if (cmd.endsWith("codesign")) return "";
  if (cmd.endsWith("lipo")) return "x86_64";
  if (cmd.endsWith("plutil")) return ({ CFBundleIdentifier: "dev.screen.aggregate-mail", CFBundleShortVersionString: candidate.version, CFBundleExecutable: "Emc²" } as Record<string, string>)[args[1]];
  throw new Error("Unexpected native command");
};
async function fixture(script = "#!/missing/synthetic/interpreter\n") {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "emc2-replace-test-")));
  const workspace = await mkdtemp(path.join(root, ".emc2-update-")), installed = path.join(root, "Installed.app"), profile = path.join(root, "profile");
  await chmod(workspace, 0o700); await mkdir(installed); await writeFile(path.join(installed, "old"), "original bundle");
  await mkdir(profile); await writeFile(path.join(profile, "key.protected"), "unchanged synthetic key wrapper");
  const stage = path.join(workspace, "staged.app");
  await mkdir(path.join(stage, "Contents/MacOS"), { recursive: true });
  await writeFile(path.join(stage, "Contents/Info.plist"), "synthetic");
  await writeFile(path.join(stage, "Contents/MacOS/Emc²"), script, { mode: 0o755 });
  const request = { parent: process.pid, installed, workspace, home: root, candidate, profile, digest: await bundleDigest(stage) };
  return { root, stage, workspace, installed, profile, request, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("replacement waits for the original process exit and stops if the original remains alive", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  let finished = false;
  const waiting = waitForParentExit(child.pid!).then(() => { finished = true; });
  try {
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(finished, false);
    await assert.rejects(waitForParentExit(child.pid!, 20));
    const exited = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exited;
    await waiting; assert.equal(finished, true);
  } finally { child.kill(); }
});

test("helper accepts only a private sibling workspace, correct parent and bounded explicit profile", async () => {
  const f = await fixture();
  try {
    if (process.platform !== "win32") assert.deepEqual(await validateReplacement(f.request, process.pid), f.request);
    for (const changes of [{ parent: process.pid + 1 }, { workspace: f.root }, { profile: "relative" }, { digest: "invalid" },
      { candidate: { ...candidate, arch: "ia32" } }, { unexpected: true }])
      await assert.rejects(validateReplacement({ ...f.request, ...changes }, process.pid));
    if (process.platform !== "win32") {
      await chmod(f.workspace, 0o755); await assert.rejects(validateReplacement(f.request, process.pid));
      await chmod(f.workspace, 0o700);
    }
    const actual = path.join(f.root, "real.app"); await mkdir(actual);
    await rm(f.installed, { recursive: true }); await symlink(actual, f.installed, "junction");
    await assert.rejects(replaceAndLaunch(f.request, run));
  } finally { await f.cleanup(); }
});

test("failed launcher spawn rolls back before dispatch and retains stage and error receipt", async () => {
  const f = await fixture();
  try {
    await assert.rejects(replaceAndLaunch(f.request, run, undefined,
      () => spawn(path.join(f.root, "missing-launcher"), [], { stdio: "ignore" })));
    assert.equal(await readFile(path.join(f.installed, "old"), "utf8"), "original bundle");
    assert.ok((await readdir(f.workspace)).includes("staged.app"));
    const receipt = JSON.parse(await readFile(path.join(f.workspace, "result.json"), "utf8"));
    assert.equal(receipt.state, "rolled-back-before-start");
    assert.equal(await readFile(path.join(f.profile, "key.protected"), "utf8"), "unchanged synthetic key wrapper");
  } finally { await f.cleanup(); }
});

test("staging tamper, signature failure and backup collisions leave the installed app untouched", async () => {
  for (const failure of ["tamper", "signature", "backup"]) {
    const f = await fixture();
    try {
      if (failure === "tamper") await writeFile(path.join(f.stage, "Contents/Info.plist"), "tampered");
      if (failure === "backup") await mkdir(path.join(f.workspace, "previous.app"));
      await assert.rejects(replaceAndLaunch(f.request, failure === "signature" ? async () => { throw new Error("bad signature"); } : run));
      assert.equal(await readFile(path.join(f.installed, "old"), "utf8"), "original bundle");
      assert.equal(await readFile(path.join(f.profile, "key.protected"), "utf8"), "unchanged synthetic key wrapper");
    } finally { await f.cleanup(); }
  }
});

test("LaunchServices receives the exact promoted bundle and explicit profile without claiming app readiness", async () => {
  const f = await fixture();
  try {
    const launch: Launch = (command, args, options) => {
      assert.equal(command, "/usr/bin/open");
      assert.deepEqual(args, ["-n", f.installed, "--args", `--user-data-dir=${f.profile}`]);
      assert.equal(options?.cwd, path.dirname(f.installed));
      assert.equal(options?.env?.HOME, f.root);
      assert.deepEqual(Object.keys(options?.env ?? {}).sort(), ["HOME", "LANG", "PATH"]);
      return spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
    };
    await replaceAndLaunch(f.request, run, undefined, launch);
    const receipt = JSON.parse(await readFile(path.join(f.workspace, "result.json"), "utf8"));
    assert.equal(receipt.state, "launch-dispatched");
    assert.equal(receipt.pid, undefined);
    assert.ok(receipt.launcherPid > 1);
    assert.equal(await readFile(path.join(f.workspace, "previous.app/old"), "utf8"), "original bundle");
    assert.equal(await readFile(path.join(f.profile, "key.protected"), "utf8"), "unchanged synthetic key wrapper");
  } finally { await f.cleanup(); }
});

test("a failed dispatch retains replacement and backup without a schema-unsafe rollback", async () => {
  const f = await fixture();
  try {
    const { profile: _profile, ...request } = f.request;
    const launch: Launch = (command, args) => {
      assert.equal(command, "/usr/bin/open");
      assert.deepEqual(args, ["-n", f.installed]);
      return spawn(process.execPath, ["-e", "process.exit(12)"], { stdio: "ignore" });
    };
    await replaceAndLaunch(request, run, undefined, launch);
    const receipt = JSON.parse(await readFile(path.join(f.workspace, "result.json"), "utf8"));
    assert.equal(receipt.state, "launch-dispatch-failed");
    assert.ok((await readdir(f.installed)).includes("Contents"));
    assert.equal(await readFile(path.join(f.workspace, "previous.app/old"), "utf8"), "original bundle");
  } finally { await f.cleanup(); }
});
