import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

for (const [platform, suffix, manifestName] of [
  ["windows-x64", "win-x64.exe", "latest.yml"],
  ["linux-x64", "linux-x86_64.AppImage", "latest-linux.yml"],
]) test(`release check validates ${platform} output and rejects missing metadata and damaged bytes`, () => {
  const directory = mkdtempSync(path.join(tmpdir(), "emc2-release-check-"));
  const script = fileURLToPath(new URL("./check-release-assets.ts", import.meta.url));
  const run = () => execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), script, platform],
    { cwd: directory, stdio: "pipe" });
  try {
    mkdirSync(path.join(directory, "release"));
    const version = "0.1.10-ci.100.1";
    const name = `Emc2-${version}-${suffix}`;
    const bytes = Buffer.from("synthetic installer, never executable");
    writeFileSync(path.join(directory, "package.json"), JSON.stringify({ version }));
    writeFileSync(path.join(directory, "release", name), bytes);
    assert.throws(run, "A missing manifest must fail before upload");
    const manifest = { version, files: [{ url: name, size: bytes.length, sha512: createHash("sha512").update(bytes).digest("base64") }] };
    writeFileSync(path.join(directory, "release", manifestName), JSON.stringify(manifest));
    assert.match(run().toString(), /PASS:/);
    writeFileSync(path.join(directory, "release", name), Buffer.alloc(bytes.length, 1));
    assert.throws(run, "Equal-length corruption must fail SHA512 verification");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
