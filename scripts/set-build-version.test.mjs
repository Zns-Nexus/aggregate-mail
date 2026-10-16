import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ciVersion } from "./set-build-version.mjs";
import { nextReleaseVersion } from "./release-version.mjs";

const env = { GITHUB_REF: "refs/heads/main", GITHUB_RUN_ID: "100", GITHUB_RUN_NUMBER: "7", GITHUB_RUN_ATTEMPT: "1" };

test("CI versions change with each run and rerun; releases match their tag", () => {
  assert.equal(ciVersion("0.1.3", env), "0.1.3-ci.100.1");
  assert.equal(ciVersion("0.1.3", { ...env, GITHUB_RUN_ID: "101" }), "0.1.3-ci.101.1");
  assert.equal(ciVersion("0.1.3", { ...env, GITHUB_RUN_ATTEMPT: "2" }), "0.1.3-ci.100.2");
  assert.equal(ciVersion("0.1.3", { ...env, GITHUB_REF: "refs/tags/v0.1.3" }), "0.1.3");
  assert.throws(() => ciVersion("0.1.3", { ...env, GITHUB_REF: "refs/tags/v0.1.2" }));
  assert.throws(() => ciVersion("0.1.3", { ...env, GITHUB_RUN_ATTEMPT: "0" }));
});

test("reusable release builds use the checked-out tag instead of the caller's branch", () => {
  for (const EMC2_BUILD_REF of ["v0.1.3", "refs/tags/v0.1.3"])
    assert.equal(ciVersion("0.1.3", { ...env, EMC2_BUILD_REF }), "0.1.3");
  for (const EMC2_BUILD_REF of ["v0.1.2", "refs/tags/v0.1.2"])
    assert.throws(() => ciVersion("0.1.3", { ...env, EMC2_BUILD_REF }), /Release tag must match/);
  for (const EMC2_BUILD_REF of ["refs/heads/main", "1234567890abcdef"])
    assert.equal(ciVersion("0.1.3", { ...env, GITHUB_REF: "refs/tags/v0.1.2", EMC2_BUILD_REF }), "0.1.3-ci.100.1");
});

test("automatic releases select the next patch above both source version and stable tags", () => {
  assert.equal(nextReleaseVersion("0.1.10", ["v0.1.9", "v0.1.12", "v0.1.12-rc.1", "junk"]), "0.1.13");
  assert.equal(nextReleaseVersion("0.1.12", ["v0.1.9"]), "0.1.13");
  const automatic = { EMC2_BUILD_REF: "a".repeat(40), EMC2_RELEASE_VERSION: "0.1.13" };
  assert.equal(ciVersion("0.1.10", automatic, ["v0.1.12"]), "0.1.13");
  for (const EMC2_RELEASE_VERSION of ["9.9.9", "0.1.12"])
    assert.throws(() => ciVersion("0.1.10", { ...automatic, EMC2_RELEASE_VERSION }, ["v0.1.12"]), /next unused patch/);
  for (const EMC2_BUILD_REF of [undefined, "refs/heads/main", "v0.1.9", "refs/tags/v0.1.10"])
    assert.throws(() => ciVersion("0.1.10", { ...automatic, EMC2_BUILD_REF }, ["v0.1.12"]), /commit SHA/);
});

test("automatic CLI stamps the selected version and rejects invalid input before writes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "emc2-release-version-"));
  try {
    const dependencies = { example: "1.0.0" };
    const pkg = JSON.stringify({ version: "0.1.10", build: {}, dependencies });
    const lock = JSON.stringify({ version: "0.1.10", packages: { "": { version: "0.1.10", dependencies } } });
    writeFileSync(path.join(dir, "package.json"), pkg);
    writeFileSync(path.join(dir, "package-lock.json"), lock);
    const gitEnv = { ...process.env, GIT_AUTHOR_NAME: "Example", GIT_AUTHOR_EMAIL: "example@example.test", GIT_COMMITTER_NAME: "Example", GIT_COMMITTER_EMAIL: "example@example.test" };
    const git = (...args) => execFileSync("git", args, { cwd: dir, env: gitEnv, encoding: "utf8" });
    git("init", "--quiet");
    git("commit", "--quiet", "--allow-empty", "-m", "Synthetic release source");
    git("tag", "v0.1.12");
    const automatic = { ...process.env, ...env, EMC2_BUILD_REF: git("rev-parse", "HEAD").trim(), EMC2_RELEASE_VERSION: "0.1.13" };
    const script = fileURLToPath(new URL("./set-build-version.mjs", import.meta.url));
    for (const input of [{ ...automatic, EMC2_RELEASE_VERSION: "0.1.12" }, { ...automatic, EMC2_BUILD_REF: "refs/tags/v0.1.10" }]) {
      assert.throws(() => execFileSync(process.execPath, [script], { cwd: dir, env: input, stdio: "pipe" }));
      assert.equal(readFileSync(path.join(dir, "package.json"), "utf8"), pkg);
      assert.equal(readFileSync(path.join(dir, "package-lock.json"), "utf8"), lock);
    }
    assert.equal(execFileSync(process.execPath, [fileURLToPath(new URL("./release-version.mjs", import.meta.url))], { cwd: dir, encoding: "utf8" }).trim(), "0.1.13");
    execFileSync(process.execPath, [script], { cwd: dir, env: automatic, stdio: "pipe" });
    const stamped = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
    const stampedLock = JSON.parse(readFileSync(path.join(dir, "package-lock.json"), "utf8"));
    assert.equal(stamped.version, "0.1.13");
    assert.equal(stampedLock.version, stamped.version);
    assert.equal(stampedLock.packages[""].version, stamped.version);
    assert.deepEqual(stamped.dependencies, dependencies);
    assert.deepEqual(stampedLock.packages[""].dependencies, dependencies);
    assert.equal(stamped.build.buildVersion, "7.1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI updates both lockfile versions and native build metadata without changing dependencies", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "emc2-version-"));
  try {
    for (const [EMC2_BUILD_REF, expected] of [["", "0.1.3-ci.100.1"], ["v0.1.3", "0.1.3"], ["refs/tags/v0.1.3", "0.1.3"]]) {
      const dependencies = { example: "1.0.0" };
      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ version: "0.1.3", build: {}, dependencies }));
      writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify({ version: "0.1.3", packages: { "": { version: "0.1.3", dependencies } } }));
      execFileSync(process.execPath, [fileURLToPath(new URL("./set-build-version.mjs", import.meta.url))], { cwd: dir, env: { ...process.env, ...env, EMC2_BUILD_REF } });
      const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
      const lock = JSON.parse(readFileSync(path.join(dir, "package-lock.json"), "utf8"));
      assert.equal(pkg.version, expected);
      assert.equal(lock.version, pkg.version);
      assert.equal(lock.packages[""].version, pkg.version);
      assert.deepEqual(pkg.dependencies, dependencies);
      assert.deepEqual(lock.packages[""].dependencies, dependencies);
      assert.equal(pkg.build.buildNumber, "7");
      assert.equal(pkg.build.buildVersion, "7.1");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
