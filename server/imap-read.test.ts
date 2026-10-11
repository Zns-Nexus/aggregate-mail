import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import type { Mail } from "../shared/types.js";
import { providers } from "./providers.js";

test("IMAP read uses inbox UIDs or an exact archive Message-ID without opening a real connection", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "emc2-imap-read-"));
  process.env.MAIL_DATA_DIR = directory;
  process.env.MAIL_DATA_KEY = Buffer.alloc(32, 8).toString("base64");
  // shortcut: the store holds SQLite until exit; add cleanup when it exposes a close operation.
  const { put } = await import("./store.js");
  const { findMail, updateMessage } = await import("./mail-actions.js");
  t.mock.method(ImapFlow.prototype, "connect", async () => {});
  t.mock.method(ImapFlow.prototype, "close", () => {});
  t.mock.method(ImapFlow.prototype, "list", async () => [{ path: "Saved", specialUse: "\\Archive" }]);
  const opened: string[] = [];
  let locked = false;
  t.mock.method(ImapFlow.prototype, "getMailboxLock", async function (this: ImapFlow, mailbox: string) {
    opened.push(mailbox);
    this.mailbox = { path: mailbox, delimiter: "/", flags: new Set(), uidValidity: 1n, uidNext: 100, exists: 1 };
    locked = true;
    return { release() { locked = false; } };
  });
  let matches = [77];
  t.mock.method(ImapFlow.prototype, "search", async (query: object, options: object) => {
    assert.deepEqual(query, { header: { "message-id": "<synthetic@example.com>" } });
    assert.deepEqual(options, { uid: true });
    return matches;
  });
  const exact = { seq: 1, uid: 77, headers: Buffer.from("Message-ID: <synthetic@example.com>\r\n\r\n") };
  let candidate: FetchMessageObject | false = exact;
  t.mock.method(ImapFlow.prototype, "fetchOne", async (uid: string, query: object, options: object) => {
    assert.equal(locked, true);
    assert.equal(opened.at(-1), "Saved");
    assert.equal(uid, "77");
    assert.deepEqual(query, { headers: ["message-id"] });
    assert.deepEqual(options, { uid: true });
    return candidate;
  });
  const seen: string[] = [];
  t.mock.method(ImapFlow.prototype, "messageFlagsAdd", async (uid: string, flags: string[], options: object) => {
    assert.equal(locked, true);
    assert.deepEqual(flags, ["\\Seen"]);
    assert.deepEqual(options, { uid: true });
    seen.push(uid);
    return true;
  });
  const account = { id: "a", email: "me@example.com", provider: "imap" as const, credentials: { imapHost: "imap.example.com", password: "synthetic-password" } };
  const mail: Mail = {
    id: "a:1:5", accountId: "a", remoteId: "1:5", sender: "Sender",
    address: "sender@example.com", to: "me@example.com", subject: "Subject",
    body: "Body", preview: "Body", date: 1700000000000, unread: true,
    category: "important", relevance: 2, reason: "Team", archived: false,
    snoozedUntil: null, messageId: "<synthetic@example.com>",
  };
  await providers.imap.update(account, mail, "read");
  await providers.imap.update(account, { ...mail, archived: true }, "read");
  assert.deepEqual(opened, ["INBOX", "Saved"]);
  assert.deepEqual(seen, ["5", "77"]);
  for (matches of [[], [77, 78]]) {
    await assert.rejects(providers.imap.update(account, { ...mail, archived: true }, "read"), /Could not identify/);
  }
  await assert.rejects(providers.imap.update(account, { ...mail, archived: true, messageId: undefined }, "read"), /no Message-ID/);
  await assert.rejects(providers.imap.update(account, { ...mail, remoteId: "2:5" }, "read"), /Mailbox identifiers changed/);
  assert.deepEqual(seen, ["5", "77"], "ambiguous or missing identities must never mark another message read");

  const archived = { ...mail, archived: true };
  put("account", account.id, account);
  put("mail", archived.id, archived);
  matches = [77];
  for (candidate of [
    { ...exact, headers: Buffer.from("Message-ID: <other@example.com> (copied from <synthetic@example.com>)\r\n\r\n") },
    { ...exact, headers: Buffer.from("Message-ID: <SYNTHETIC@example.com>\r\n\r\n") },
    { ...exact, headers: Buffer.from("Subject: No identity\r\n\r\n") },
    { seq: 1, uid: 77 },
    false as const,
  ]) {
    await assert.rejects(updateMessage(archived.id, { action: "read" }), /Could not identify/);
    assert.deepEqual(seen, ["5", "77"], "rejected archive candidates must not receive Seen");
    assert.deepEqual(findMail(archived.id), archived, "rejected archive candidates must leave cached mail unchanged");
    assert.equal(locked, false, "failure must release the archive lock");
  }
  candidate = exact;
  await updateMessage(archived.id, { action: "read" });
  assert.deepEqual(seen, ["5", "77", "77"]);
  assert.equal(findMail(archived.id).unread, false);
  assert.equal(locked, false);
  t.mock.method(ImapFlow.prototype, "list", async () => [{ path: "Saved", specialUse: "\\All" }]);
  await providers["gmail-imap"].update({ ...account, provider: "gmail-imap" }, archived, "read");
  assert.equal(opened.at(-1), "Saved");
  assert.equal(seen.at(-1), "77");
});
