// Cuts a release locally: bumps the version, builds the Windows installer,
// prints its checksum, and publishes it to GitHub when a release lane exists.
// GitCafe hosts the source but runs no CI and has no release downloads, so the
// installer has to live somewhere that serves binaries.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packagePath = path.join(root, "package.json");
const releaseDir = path.join(root, "release");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const publish = !args.includes("--no-publish");
const level = ["major", "minor", "patch"].find((name) => args.includes(`--${name}`));

const run = (command, commandArgs, options = {}) =>
  execFileSync(command, commandArgs, {
    cwd: root,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
  });

function githubRepo() {
  let remotes = "";
  try {
    remotes = run("git", ["remote", "-v"], { capture: true });
  } catch {
    return null;
  }
  for (const line of remotes.split("\n")) {
    const match = line.match(
      /(?:github\.com[/:])([^/\s]+)\/([^\s/]+?)(?:\.git)?\s+\(push\)/,
    );
    if (match) return `${match[1]}/${match[2]}`;
  }
  return null;
}

const current = JSON.parse(readFileSync(packagePath, "utf8"));
const [major, minor, patch] = current.version.split(".").map(Number);
const version = !level
  ? current.version
  : {
      major: `${major + 1}.0.0`,
      minor: `${major}.${minor + 1}.0`,
      patch: `${major}.${minor}.${patch + 1}`,
    }[level];
const tag = `v${version}`;
const repo = githubRepo();

console.log(`Emc² ${current.version} -> ${version}`);
console.log(`Release lane: ${repo ? `GitHub ${repo}` : "none found"}`);
if (!level && releaseDir && !args.includes("--rebuild"))
  console.log("No --major/--minor/--patch given, rebuilding the current version.");

if (dryRun) {
  console.log("\nDry run: nothing was built, written or published.");
  process.exit(0);
}

if (version !== current.version) {
  writeFileSync(
    packagePath,
    `${JSON.stringify({ ...current, version }, null, 2)}\n`,
  );
}
run("npm", ["run", "package"]);

const newest = (directory, match) =>
  readdirSync(directory)
    .filter(match)
    .map((name) => ({
      name,
      path: path.join(directory, name),
      time: statSync(path.join(directory, name)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time)[0];
const installer = newest(releaseDir, (name) => /\.exe$/.test(name));
if (!installer)
  throw new Error("No installer was produced in release/.");
const digest = createHash("sha256")
  .update(readFileSync(installer.path))
  .digest("hex");
console.log(`\n${installer.name}`);
console.log(`sha256 ${digest}`);
console.log(
  `size   ${(statSync(installer.path).size / 1024 / 1024).toFixed(1)} MB`,
);

if (!publish) process.exit(0);
if (!repo) {
  console.log(
    "\nNo GitHub remote, so nothing was published. Add one and re-run, or upload the installer yourself.",
  );
  process.exit(0);
}
const blockmap = newest(releaseDir, (name) => /\.exe\.blockmap$/.test(name));
try {
  run("gh", [
    "release",
    "create",
    tag,
    installer.path,
    ...(blockmap ? [blockmap.path] : []),
    "--repo",
    repo,
    "--title",
    `${current.name} ${version}`,
    "--generate-notes",
  ]);
  console.log(`\nPublished ${tag} to ${repo}.`);
} catch {
  console.log(
    `\nCould not publish to ${repo}. Check that it exists and that gh is signed in, then retry:\n  gh release create ${tag} release/*.exe --repo ${repo} --generate-notes`,
  );
}
console.log(
  `\nCommit the version bump when you are ready:\n  git commit -am "Release ${version}" && git push --follow-tags`,
);
