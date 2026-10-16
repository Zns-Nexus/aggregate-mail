import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function parts(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  assert.ok(match, `Invalid stable version: ${version}`);
  return match.slice(1).map(Number);
}

export function nextReleaseVersion(current, tags) {
  let highest = parts(current);
  assert.ok(highest.every(Number.isSafeInteger), "Current version is out of range");
  for (const tag of tags) {
    const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
    if (!match) continue;
    const candidate = match.slice(1).map(Number);
    if (candidate.some((value) => !Number.isSafeInteger(value))) continue;
    if (candidate[0] > highest[0] || (candidate[0] === highest[0] && candidate[1] > highest[1]) ||
      (candidate[0] === highest[0] && candidate[1] === highest[1] && candidate[2] > highest[2]))
      highest = candidate;
  }
  assert.ok(Number.isSafeInteger(highest[2] + 1), "Next patch version is out of range");
  return `${highest[0]}.${highest[1]}.${highest[2] + 1}`;
}

if (import.meta.main) {
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const tags = execFileSync("git", ["tag", "--list", "v[0-9]*"], { encoding: "utf8" }).trim().split(/\s+/).filter(Boolean);
  console.log(nextReleaseVersion(version, tags));
}
