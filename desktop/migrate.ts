import { cpSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const LEGACY_APP_NAME = "Aggregate Mail";
export const MIGRATION_MARKER = ".renamed-to-emc2";

// Local State holds the key that decrypts mail/key.protected.
const CARRIED_ENTRIES = ["mail", "settings.env", "Local State"] as const;

export type MigrationResult =
  | { migrated: true; carried: string[]; legacy: string }
  | {
      migrated: false;
      reason: "same-directory" | "legacy-missing" | "already-migrated";
      legacy: string;
    };

export function migrateLegacyUserData({
  appData,
  target,
}: {
  appData: string;
  target: string;
}): MigrationResult {
  const legacy = path.join(appData, LEGACY_APP_NAME);
  if (path.resolve(legacy) === path.resolve(target))
    return { migrated: false, reason: "same-directory", legacy };
  if (!existsSync(legacy)) return { migrated: false, reason: "legacy-missing", legacy };
  if (existsSync(path.join(target, MIGRATION_MARKER)))
    return { migrated: false, reason: "already-migrated", legacy };

  mkdirSync(target, { recursive: true });
  const carried: string[] = [];
  for (const entry of CARRIED_ENTRIES) {
    const from = path.join(legacy, entry);
    const to = path.join(target, entry);
    if (!existsSync(from) || existsSync(to)) continue;
    try {
      renameSync(from, to);
    } catch {
      cpSync(from, to, { recursive: true });
    }
    carried.push(entry);
  }
  writeFileSync(path.join(target, MIGRATION_MARKER), `${legacy}\n`);
  return { migrated: true, carried, legacy };
}
