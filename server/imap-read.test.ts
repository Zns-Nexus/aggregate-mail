import assert from "node:assert/strict";
import { test } from "node:test";
import { ImapFlow } from "imapflow";
import type { Mail } from "../shared/types.js";
import { providers } from "./providers.js";

test("IMAP read uses inbox UIDs or a unique archive Message-ID without opening a real connection", async (t) => {
  t.mock.method(ImapFlow.prototype, "connect", async () => {});
  t.mock.method(ImapFlow.prototype, "close", () => {});
  t.mock.method(ImapFlow.prototype, "list", async () => [{ path: "Saved", specialUse: "\\Archive" }]);
  const opened: string[] = [];
  t.mock.method(ImapFlow.prototype, "getMailboxLock", async function (this: ImapFlow, mailbox: string) {
    opened.push(mailbox);
    this.mailbox = { path: mailbox, delimiter: "/", flags: new Set(), uidValidity: 1n, uidNext: 100, exists: 1 };
    return { release() {} };
  });
  let matches = [77];
  t.mock.method(ImapFlow.prototype, "search", async (query: object, options: object) => {
    assert.deepEqual(query, { header: { "message-id": "<synthetic@example.com>" } });
    assert.deepEqual(options, { uid: true });
    return matches;
  });
  const seen: string[] = [];
  t.mock.method(ImapFlow.prototype, "messageFlagsAdd", async (uid: string, flags: string[], options: object) => {
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
});
