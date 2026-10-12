import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import signMac from "./sign-mac.cjs";

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("macOS packaging signs only ad hoc without discovering certificates or profiles", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "emc2-sign-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const app = path.join(dir, "Example.app");
  mkdirSync(path.join(app, "Contents", "Frameworks", "Helper.app", "Contents"), { recursive: true });
  const identities = require("@electron/osx-sign/dist/cjs/util-identities");
  const profiles = require("@electron/osx-sign/dist/cjs/util-provisioning-profiles");
  const util = require("@electron/osx-sign/dist/cjs/util");
  const calls = [];
  const lookup = t.mock.method(identities, "findIdentities", async () => [
    new identities.Identity("Developer ID Application: Example-Org (SYNTHETIC)"),
  ]);
  const profile = t.mock.method(profiles, "preEmbedProvisioningProfile", async () => {
    assert.fail("Provisioning profiles must not be read");
  });
  t.mock.method(util, "execFileAsync", async (command, args) => {
    assert.equal(command, "codesign");
    calls.push(args);
    return "";
  });

  assert.equal(pkg.build.afterPack, "scripts/sign-mac.cjs");
  assert.equal(pkg.build.mac.identity, null);
  assert.equal(pkg.build.mac.notarize, false);
  assert.equal(pkg.build.dmg.sign, false);
  // Prove builder's disabled signing returns before certificate or keychain access.
  const { MacPackager } = require("app-builder-lib");
  t.mock.method(require("app-builder-lib/out/codeSign/macCodeSign"), "isSignAllowed", () => true);
  assert.equal(await MacPackager.prototype.sign.call({
    helper: { handleNullIdentity: () => false },
    get codeSigningInfo() { assert.fail("Builder must not access a signing keychain"); },
  }, app, pkg.build.mac), false);

  await signMac({ electronPlatformName: "darwin", appOutDir: dir, packager: { appInfo: { productFilename: "Example" } } });
  assert.equal(lookup.mock.callCount(), 0);
  assert.equal(profile.mock.callCount(), 0);
  const signing = calls.filter((args) => args.includes("--sign"));
  assert.equal(signing.length, 2);
  for (const args of signing) {
    assert.equal(args[args.indexOf("--sign") + 1], "-");
    assert.ok(args.includes("--timestamp=none"));
    assert.ok(!args.includes("--keychain"));
  }
  assert.ok(calls.some((args) => args.includes("--verify")));
});

test("the signing hook leaves other platforms untouched and propagates failure", async (t) => {
  const signer = require("@electron/osx-sign");
  const sign = t.mock.method(signer, "signAsync", async () => { throw new Error("Signing failed"); });
  await signMac({ electronPlatformName: "win32" });
  await signMac({ electronPlatformName: "linux" });
  assert.equal(sign.mock.callCount(), 0);
  await assert.rejects(signMac({ electronPlatformName: "darwin", appOutDir: "/synthetic", packager: { appInfo: { productFilename: "Example" } } }), /Signing failed/);
});
