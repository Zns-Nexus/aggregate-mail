import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import type { Account, Mail, Rule, McpSettings, GmailLabel } from "../shared/types.js";

const dataPath = process.env.MAIL_DATA_DIR || ".data";
mkdirSync(dataPath, { recursive: true, mode: 0o700 });
const keyPath = path.join(dataPath, "key");
if (!process.env.MAIL_DATA_KEY && !existsSync(keyPath))
  writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
const key = process.env.MAIL_DATA_KEY
  ? Buffer.from(process.env.MAIL_DATA_KEY, "base64")
  : readFileSync(keyPath);
const db = new DatabaseSync(path.join(dataPath, "mail.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, value TEXT NOT NULL, PRIMARY KEY(kind,id))",
);

// Account secrets and message content are encrypted with a local installation key.
export function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
function decrypt(value: string): unknown {
  const data = Buffer.from(value, "base64");
  const cipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString(
      "utf8",
    ),
  );
}
type Records = {
  account: StoredAccount;
  mail: Mail;
  label: GmailLabel;
  rule: Rule;
  meta: { lastSync: number };
  mcp: McpSettings;
};
export type StoredAccount = Account & {
  credentials: {
    refreshToken?: string;
    password?: string;
    imapHost?: string;
    smtpHost?: string;
    imapPort?: number;
    smtpPort?: number;
    username?: string;
  };
};
export function all<K extends keyof Records>(kind: K): Records[K][] {
  return db
    .prepare("SELECT value FROM records WHERE kind=?")
    .all(kind)
    .map((row) => decrypt(String(row.value)) as Records[K]);
}
export function put<K extends keyof Records>(
  kind: K,
  id: string,
  value: Records[K],
) {
  db.prepare("INSERT OR REPLACE INTO records VALUES (?,?,?)").run(
    kind,
    id,
    encrypt(value),
  );
}
export function remove(kind: keyof Records, id: string) {
  db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
}
export function account(id: string) {
  const found = all("account").find((a) => a.id === id);
  if (!found) throw new Error("Account not found.");
  return found;
}
