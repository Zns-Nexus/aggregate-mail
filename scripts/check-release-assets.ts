import assert from "node:assert/strict";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { validateCandidate, verifyInstaller } from "../desktop/updates.js";

const platform = process.argv[2];
assert.ok(platform === "windows-x64" || platform === "linux-x64", "Expected windows-x64 or linux-x64");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const windows = platform === "windows-x64";
const name = `Emc2-${version}-${windows ? "win-x64.exe" : "linux-x86_64.AppImage"}`;
const manifestName = windows ? "latest.yml" : "latest-linux.yml";
const installer = path.resolve("release", name);
const asset = async (filename: string) => ({
  name: filename,
  size: (await lstat(path.resolve("release", filename))).size,
  browser_download_url: `https://github.com/screen-devs/aggregate-mail/releases/download/v${version}/${filename}`,
});
const candidate = validateCandidate({
  version, asset: await asset(name), manifest: await asset(manifestName),
}, await readFile(path.resolve("release", manifestName), "utf8"));
await verifyInstaller(installer, candidate);
console.log(`PASS: ${name} matches updater version, architecture, size and SHA512`);
