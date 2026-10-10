import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LEGACY_APP_NAME, MIGRATION_MARKER, migrateLegacyUserData } from "./migrate.js";

function sandbox() {
  const root = mkdtempSync(path.join(tmpdir(), "emc2-migrate-"));
  const appData = path.join(root, "appData");
  const legacy = path.join(appData, LEGACY_APP_NAME);
  const target = path.join(appData, "Emc\u00b2");
  mkdirSync(legacy, { recursive: true });
  return {
    appData,
    legacy,
    target,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("carries mail and settings into the renamed folder and leaves the old one behind", () => {
  const { appData, legacy, target, cleanup } = sandbox();
  try {
    mkdirSync(path.join(legacy, "mail"));
    writeFileSync(path.join(legacy, "mail", "mail.sqlite"), "store");
    writeFileSync(path.join(legacy, "settings.env"), "MAIL_USER=owner@example.com\n");
    writeFileSync(path.join(legacy, "Local State"), '{"os_crypt":{"encrypted_key":"blob"}}');
    mkdirSync(path.join(legacy, "ShaderCache"));

    const result = migrateLegacyUserData({ appData, target });

    assert.deepEqual(result, {
      migrated: true,
      carried: ["mail", "settings.env", "Local State"],
      legacy,
    });
    assert.equal(existsSync(path.join(target, "mail", "mail.sqlite")), true);
    assert.equal(existsSync(path.join(target, "settings.env")), true);
    // Without Local State the moved mail/key.protected cannot be decrypted.
    assert.equal(existsSync(path.join(target, "Local State")), true);
    assert.equal(existsSync(path.join(target, MIGRATION_MARKER)), true);
    assert.equal(existsSync(path.join(legacy, "mail")), false);
    assert.deepEqual(readdirSync(legacy), ["ShaderCache"]);
  } finally {
    cleanup();
  }
});

test("runs once", () => {
  const { appData, legacy, target, cleanup } = sandbox();
  try {
    writeFileSync(path.join(legacy, "settings.env"), "MAIL_USER=owner@example.com\n");
    assert.equal(migrateLegacyUserData({ appData, target }).migrated, true);
    writeFileSync(path.join(legacy, "settings.env"), "second run");
    const second = migrateLegacyUserData({ appData, target });
    assert.deepEqual(second, { migrated: false, reason: "already-migrated", legacy });
    assert.equal(existsSync(path.join(legacy, "settings.env")), true);
  } finally {
    cleanup();
  }
});

test("does not replace data the renamed folder already holds", () => {
  const { appData, legacy, target, cleanup } = sandbox();
  try {
    mkdirSync(path.join(legacy, "mail"));
    writeFileSync(path.join(legacy, "mail", "mail.sqlite"), "old");
    mkdirSync(path.join(target, "mail"), { recursive: true });
    writeFileSync(path.join(target, "mail", "mail.sqlite"), "current");

    const result = migrateLegacyUserData({ appData, target });

    assert.deepEqual(result, { migrated: true, carried: [], legacy });
    assert.equal(existsSync(path.join(target, "mail", "mail.sqlite")), true);
    assert.equal(existsSync(path.join(legacy, "mail", "mail.sqlite")), true);
  } finally {
    cleanup();
  }
});

test("does nothing without a pre-rename folder", () => {
  const root = mkdtempSync(path.join(tmpdir(), "emc2-migrate-"));
  try {
    const result = migrateLegacyUserData({
      appData: root,
      target: path.join(root, "Emc\u00b2"),
    });
    assert.deepEqual(result, {
      migrated: false,
      reason: "legacy-missing",
      legacy: path.join(root, LEGACY_APP_NAME),
    });
    assert.equal(existsSync(path.join(root, "Emc\u00b2")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does nothing when the folders are the same", () => {
  const root = mkdtempSync(path.join(tmpdir(), "emc2-migrate-"));
  try {
    const target = path.join(root, LEGACY_APP_NAME);
    mkdirSync(target, { recursive: true });
    assert.deepEqual(migrateLegacyUserData({ appData: root, target }), {
      migrated: false,
      reason: "same-directory",
      legacy: target,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
