import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ciVersion } from "./set-build-version.mjs";

const env = { GITHUB_REF: "refs/heads/main", GITHUB_RUN_ID: "100", GITHUB_RUN_NUMBER: "7", GITHUB_RUN_ATTEMPT: "1" };

test("CI versions change with each run and rerun; releases match their tag", () => {
  assert.equal(ciVersion("0.1.3", env), "0.1.3-ci.100.1");
  assert.equal(ciVersion("0.1.3", { ...env, GITHUB_RUN_ID: "101" }), "0.1.3-ci.101.1");
  assert.equal(ciVersion("0.1.3", { ...env, GITHUB_RUN_ATTEMPT: "2" }), "0.1.3-ci.100.2");
  assert.equal(ciVersion("0.1.3", { ...env, GITHUB_REF: "refs/tags/v0.1.3" }), "0.1.3");
  assert.throws(() => ciVersion("0.1.3", { ...env, GITHUB_REF: "refs/tags/v0.1.2" }));
  assert.throws(() => ciVersion("0.1.3", { ...env, GITHUB_RUN_ATTEMPT: "0" }));
});

test("CLI updates both lockfile versions and native build metadata without changing dependencies", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "emc2-version-"));
  try {
    const dependencies = { example: "1.0.0" };
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ version: "0.1.3", build: {}, dependencies }));
    writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify({ version: "0.1.3", packages: { "": { version: "0.1.3", dependencies } } }));
    execFileSync(process.execPath, [fileURLToPath(new URL("./set-build-version.mjs", import.meta.url))], { cwd: dir, env: { ...process.env, ...env } });
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
    const lock = JSON.parse(readFileSync(path.join(dir, "package-lock.json"), "utf8"));
    assert.equal(pkg.version, "0.1.3-ci.100.1");
    assert.equal(lock.version, pkg.version);
    assert.equal(lock.packages[""].version, pkg.version);
    assert.deepEqual(pkg.dependencies, dependencies);
    assert.deepEqual(lock.packages[""].dependencies, dependencies);
    assert.equal(pkg.build.buildNumber, "7");
    assert.equal(pkg.build.buildVersion, "7.1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
