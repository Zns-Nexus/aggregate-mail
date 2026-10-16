import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("automatic release builds the triggering SHA and writes its tag only after builds pass", () => {
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}[\s\S]*release_version:/);
  assert.match(workflow, /needs: \[version, build\]/);
  assert.ok(workflow.indexOf("needs: [version, build]") < workflow.indexOf("name: Create the release tag"));
  assert.match(workflow, /git push origin "refs\/tags\/\$\{TAG\}"/);
  assert.doesNotMatch(workflow, /npm version|git commit|HEAD:main|git push origin[^\n]*main/);
});

test("publication preserves downloaded artifacts and grants write access only to publishing", () => {
  const publish = workflow.slice(workflow.indexOf("\n  publish:"));
  assert.ok(publish.indexOf("actions/checkout@") < publish.indexOf("actions/download-artifact@"));
  assert.match(workflow.slice(0, workflow.indexOf("\n  publish:")), /permissions:\n  contents: read/);
  assert.doesNotMatch(workflow.slice(0, workflow.indexOf("\n  publish:")), /contents: write/);
  assert.ok(publish.indexOf("sha256sum") < publish.indexOf("git tag"));
  assert.match(workflow, /!startsWith\(github.event.head_commit.message, 'Release '\)/);
});

test("the publishing tag command retries the same commit and rejects a different commit", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "emc2-release-tag-"));
  try {
    const source = path.join(dir, "source");
    const remote = path.join(dir, "remote.git");
    execFileSync("git", ["init", "--bare", "--quiet", remote]);
    execFileSync("git", ["init", "--quiet", source]);
    const env = { ...process.env, GIT_AUTHOR_NAME: "Example", GIT_AUTHOR_EMAIL: "example@example.test", GIT_COMMITTER_NAME: "Example", GIT_COMMITTER_EMAIL: "example@example.test" };
    const git = (...args) => execFileSync("git", args, { cwd: source, env, encoding: "utf8", stdio: "pipe" }).trim();
    git("remote", "add", "origin", remote);
    git("commit", "--quiet", "--allow-empty", "-m", "Synthetic release source");
    const sha = git("rev-parse", "HEAD");
    const command = workflow.match(/- name: Create the release tag[\s\S]*?run: \|\n([\s\S]*?)(?=      - name: Publish the release)/)[1].replace(/^ {10}/gm, "");
    const run = (commit) => execFileSync("bash", ["-e", "-c", command], { cwd: source, env: { ...env, RELEASE_VERSION: "0.1.11", GITHUB_SHA: commit }, stdio: "pipe" });
    run(sha);
    assert.equal(git("--git-dir", remote, "rev-parse", "refs/tags/v0.1.11^{commit}"), sha);
    run(sha);
    git("commit", "--quiet", "--allow-empty", "-m", "Another synthetic source");
    assert.throws(() => run(git("rev-parse", "HEAD")));
    assert.equal(git("--git-dir", remote, "rev-parse", "refs/tags/v0.1.11^{commit}"), sha);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
