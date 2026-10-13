import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { google, type gmail_v1 } from "googleapis";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import type { Mail } from "../shared/types.js";

test("Trash actions use synthetic providers, safe targets and confirmed cache removal", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "emc2-trash-"));
  process.env.MAIL_DATA_DIR = directory;
  process.env.MAIL_CONFIG_PATH = path.join(directory, "settings.env");
  process.env.MAIL_DESKTOP_TOKEN = "synthetic-desktop";
  process.env.MAIL_DATA_KEY = Buffer.alloc(32, 8).toString("base64");
  const { put, all, closeStore } = await import("./store.js");
  const { updateMessage, messageActionSchema } = await import("./mail-actions.js");
  const { providers } = await import("./providers.js");
  const { startServer } = await import("./index.js");
  const account = { id: "a", email: "reader@example.com", provider: "imap" as const,
    credentials: { imapHost: "imap.example.com", password: "synthetic" } };
  const mail: Mail = {
    id: "a:1:5", accountId: "a", remoteId: "1:5", sender: "Sender",
    address: "sender@example.com", to: "reader@example.com", subject: "Synthetic",
    body: "Body", preview: "Body", date: 1700000000000, unread: true,
    category: "important", relevance: 2, reason: "", archived: false,
    snoozedUntil: null, messageId: "<synthetic@example.com>",
  };
  put("account", "a", account);
  put("account", "b", { ...account, id: "b" });
  put("mail", mail.id, mail);
  put("mail", "b:1:5", { ...mail, id: "b:1:5", accountId: "b" });
  let capabilities = ["MOVE"];
  let enabled: string[] = [];
  let folders: { path: string; specialUse?: string; flags: Set<string> }[] = [{ path: "Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }, { path: "Saved", specialUse: "\\Archive", flags: new Set(["\\Archive"]) }];
  let validity = 1n;
  let wrongMailbox = false;
  let matches: number[] = [77];
  let header = "Message-ID: <synthetic@example.com>\r\n\r\n";
  let candidateUid: number | undefined;
  let missingCandidate = false;
  let moveFails = false, logoutFails = false, releaseFails = false;
  let moveGate: Promise<void> | undefined;
  let locked = false, connects = 0, releases = 0, closes = 0;
  const opened: string[] = [];
  const moves: { uid: string; target: string }[] = [];
  const seen: string[] = [];
  t.mock.method(ImapFlow.prototype, "connect", async function (this: ImapFlow) {
    connects++;
    this.capabilities = new Map(capabilities.map((capability) => [capability, true]));
    this.enabled = new Set(enabled);
    this.usable = true;
  });
  t.mock.method(ImapFlow.prototype, "close", () => { closes++; });
  t.mock.method(ImapFlow.prototype, "logout", async () => {
    if (logoutFails) throw new Error("Synthetic logout failure");
    return true;
  });
  t.mock.method(ImapFlow.prototype, "list", async () => folders);
  t.mock.method(ImapFlow.prototype, "getMailboxLock", async function (this: ImapFlow, mailbox: string) {
    opened.push(mailbox);
    this.mailbox = { path: wrongMailbox ? "Unrelated" : mailbox, delimiter: "/", flags: new Set<string>(), uidValidity: validity, uidNext: 100, exists: 1 };
    locked = true;
    return { release() {
      locked = false; releases++;
      if (releaseFails) throw new Error("Synthetic release failure");
    } };
  });
  t.mock.method(ImapFlow.prototype, "search", async (query: object, options: object) => {
    assert.equal(locked, true);
    assert.deepEqual(query, { header: { "message-id": mail.messageId } });
    assert.deepEqual(options, { uid: true });
    return matches;
  });
  t.mock.method(ImapFlow.prototype, "fetchOne", async (uid: string, query: object, options: object): Promise<FetchMessageObject | false> => {
    assert.equal(locked, true);
    assert.deepEqual(query, { headers: ["message-id"] });
    assert.deepEqual(options, { uid: true });
    return missingCandidate ? false : { seq: 1, uid: candidateUid ?? Number(uid), headers: Buffer.from(header) };
  });
  t.mock.method(ImapFlow.prototype, "messageMove", async (uid: string, target: string, options: object) => {
    assert.equal(locked, true);
    assert.deepEqual(options, { uid: true });
    moves.push({ uid, target });
    await moveGate;
    return !moveFails;
  });
  t.mock.method(ImapFlow.prototype, "messageFlagsAdd", async (uid: string, flags: string[]) => {
    assert.deepEqual(flags, ["\\Seen"]);
    seen.push(uid);
    return true;
  });
  const deleted = t.mock.method(ImapFlow.prototype, "messageDelete", async () => { throw new Error("Hard delete forbidden"); });
  const copied = t.mock.method(ImapFlow.prototype, "messageCopy", async () => { throw new Error("COPY/EXPUNGE fallback forbidden"); });
  const created = t.mock.method(ImapFlow.prototype, "mailboxCreate", async () => { throw new Error("Folder creation forbidden"); });
  const closedMailbox = t.mock.method(ImapFlow.prototype, "mailboxClose", async () => { throw new Error("EXPUNGE forbidden"); });
  const api = google.gmail("v1");
  t.mock.method(google, "gmail", () => api, {});
  const gmailTrash: gmail_v1.Params$Resource$Users$Messages$Trash[] = [];
  let gmailFails = false;
  t.mock.method(api.users.messages, "trash", async (params: gmail_v1.Params$Resource$Users$Messages$Trash) => {
    gmailTrash.push(params);
    if (gmailFails) throw new Error("Synthetic Gmail rejection");
    return { data: { id: params.id } };
  });
  const gmailDelete = t.mock.method(api.users.messages, "delete", async () => { throw new Error("Gmail hard delete forbidden"); });
  const gmailBatchDelete = t.mock.method(api.users.messages, "batchDelete", async () => { throw new Error("Gmail hard delete forbidden"); });
  const gmailModify = t.mock.method(api.users.messages, "modify", async () => { throw new Error("Trash must use messages.trash"); });
  const server = await startServer(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const desktop = { "X-Desktop-Token": "synthetic-desktop", "Content-Type": "application/json" };
    const state = await (await fetch(`${base}/api/state`, { headers: desktop })).json() as { csrf: string };
    const headers = { ...desktop, "X-CSRF-Token": state.csrf };
    const patch = (id: string, input: object, requestHeaders = headers) => fetch(`${base}/api/messages/${encodeURIComponent(id)}`, {
      method: "PATCH", headers: requestHeaders, body: JSON.stringify(input),
    });

    await t.test("API authenticates Trash and deletes only after provider MOVE confirmation", async () => {
      assert.equal((await patch(mail.id, { action: "trash" }, { ...headers, "X-Desktop-Token": "wrong" })).status, 403);
      assert.equal((await patch(mail.id, { action: "trash" }, { ...headers, "X-CSRF-Token": "wrong" })).status, 403);
      assert.equal((await patch(mail.id, { action: "delete" })).status, 400);
      assert.equal(moves.length, 0);
      let finish = () => {};
      moveGate = new Promise<void>((resolve) => { finish = resolve; });
      const pending = updateMessage(mail.id, messageActionSchema.parse({ action: "trash" }));
      await new Promise(setImmediate);
      assert.ok(all("mail").some((cached) => cached.id === mail.id), "provider wait must retain mail");
      finish();
      await pending;
      moveGate = undefined;
      assert.equal(all("mail").some((cached) => cached.id === mail.id), false);
      assert.ok(all("mail").some((cached) => cached.id === "b:1:5"));
      assert.deepEqual(moves, [{ uid: "5", target: "Bin" }]);
      assert.deepEqual(opened, ["INBOX"]);
      assert.equal(locked, false);
      put("mail", mail.id, mail);
      const response = await patch(mail.id, { action: "trash" });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
      assert.equal(all("mail").some((cached) => cached.id === mail.id), false);
      assert.equal((await patch(mail.id, { action: "trash" })).status, 404);
    });

    await t.test("Gmail uses messages.trash including archived mail; rejection retains its cache", async () => {
      const gmailAccount = { ...account, id: "g", provider: "gmail" as const, credentials: { refreshToken: "synthetic" } };
      const gmailMail = { ...mail, id: "g:remote", accountId: "g", remoteId: "remote", archived: true };
      put("account", "g", gmailAccount);
      put("mail", gmailMail.id, gmailMail);
      gmailFails = true;
      assert.equal((await patch(gmailMail.id, { action: "trash" })).status, 400);
      assert.deepEqual(all("mail").find((cached) => cached.id === gmailMail.id), gmailMail);
      gmailFails = false;
      assert.equal((await patch(gmailMail.id, { action: "trash" })).status, 200);
      assert.deepEqual(gmailTrash, [{ userId: "me", id: "remote" }, { userId: "me", id: "remote" }]);
      assert.equal(all("mail").some((cached) => cached.id === gmailMail.id), false);
    });

    await t.test("absent, ambiguous and unsafe Trash folders or missing MOVE never mutate mail", async () => {
      put("mail", mail.id, mail);
      const before = moves.length;
      for (folders of [
        [], [{ path: "Trash", flags: new Set<string>() }],
        [{ path: "Bin A", flags: new Set(["\\Trash"]) }, { path: "Bin B", flags: new Set(["\\trash"]) }],
        // Real LIST results include name-inferred specialUse and only one winner for duplicates.
        [{ path: "Trash", specialUse: "\\Trash", flags: new Set<string>() }],
        [{ path: "Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }, { path: "Other Bin", flags: new Set(["\\Trash"]) }],
        [{ path: "Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }, { path: "Other Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }],
        [{ path: "", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }],
        [{ path: "INBOX", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }],
      ]) {
        await assert.rejects(updateMessage(mail.id, { action: "trash" }), /Trash folder/);
        assert.deepEqual(all("mail").find((cached) => cached.id === mail.id), mail);
      }
      folders = [{ path: "Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }, { path: "Saved", specialUse: "\\Archive", flags: new Set(["\\Archive"]) }];
      capabilities = [];
      await assert.rejects(updateMessage(mail.id, { action: "trash" }), /safe Move to Trash/);
      capabilities = ["MOVE"];
      assert.equal(moves.length, before);
    });

    await t.test("lowercase server flags identify Trash and archive folders", async () => {
      try {
        folders = [{ path: "Bin", flags: new Set(["\\trash"]) }, { path: "Saved", flags: new Set(["\\archive"]) }];
        await providers.imap.update(account, mail, "trash");
        assert.deepEqual(moves.at(-1), { uid: "5", target: "Bin" });
        await providers.imap.update(account, { ...mail, archived: true }, "trash");
        assert.equal(opened.at(-1), "Saved");
        assert.deepEqual(moves.at(-1), { uid: "77", target: "Bin" });
        folders = [{ path: "Google Bin", flags: new Set(["\\tRaSh"]) }, { path: "Everything", flags: new Set(["\\aLl"]) }];
        await providers["gmail-imap"].update({ ...account, provider: "gmail-imap" }, { ...mail, archived: true }, "trash");
        assert.equal(opened.at(-1), "Everything");
      } finally {
        folders = [{ path: "Bin", flags: new Set(["\\Trash"]) }, { path: "Saved", flags: new Set(["\\Archive"]) }];
      }
    });

    await t.test("native MOVE follows active IMAP4rev2, not merely advertised rev2", async () => {
      for (const protocol of [
        { capabilities: ["IMAP4rev2"], enabled: [] },
        { capabilities: ["IMAP4rev1", "IMAP4rev2"], enabled: ["IMAP4REV2"] },
      ]) {
        capabilities = protocol.capabilities;
        enabled = protocol.enabled;
        const before = moves.length;
        await providers.imap.update(account, mail, "trash");
        assert.equal(moves.length, before + 1);
      }
      capabilities = ["IMAP4rev1", "IMAP4rev2"];
      enabled = [];
      const before = moves.length;
      await assert.rejects(providers.imap.update(account, mail, "trash"), /safe Move to Trash/);
      assert.equal(moves.length, before);
      capabilities = ["MOVE"];
    });

    await t.test("malformed identifiers, stale UIDVALIDITY and mismatched inbox identity cannot trash another message", async () => {
      const before = moves.length, connectCount = connects;
      for (const remoteId of ["1", "1:*", "1:5,6", "1:5:6", "0:5", "1:0", "1:-5", "1:4294967296", "9007199254740993:5"]) {
        await assert.rejects(providers.imap.update(account, { ...mail, remoteId }, "trash"), /identifiers are unavailable/);
      }
      assert.equal(connects, connectCount, "invalid UID syntax must fail before connecting");
      wrongMailbox = true;
      await assert.rejects(updateMessage(mail.id, { action: "trash" }), /mailbox changed/);
      wrongMailbox = false;
      validity = 2n;
      await assert.rejects(updateMessage(mail.id, { action: "trash" }), /Mailbox identifiers changed/);
      validity = 1n;
      header = "Message-ID: <different@example.com>\r\n\r\n";
      await assert.rejects(updateMessage(mail.id, { action: "trash" }), /identity changed/);
      header = "Message-ID: <synthetic@example.com>\r\n\r\n";
      candidateUid = 6;
      await assert.rejects(updateMessage(mail.id, { action: "trash" }), /identity changed/);
      candidateUid = undefined;
      assert.equal(moves.length, before);
      assert.deepEqual(all("mail").find((cached) => cached.id === mail.id), mail);
      assert.equal(locked, false);
    });

    await t.test("archived Trash requires a unique source and exact Message-ID; old inbox UID is never reused", async () => {
      const archived = { ...mail, archived: true };
      const before = moves.length;
      const originalFolders = folders;
      try {
        for (const [provider, archiveFlag] of [["imap", "Archive"], ["gmail-imap", "All"]] as const) {
          folders = [{ path: "Bin", flags: new Set(["\\Trash"]) },
            { path: "A", flags: new Set([`\\${archiveFlag}`]) }, { path: "B", flags: new Set([`\\${archiveFlag.toLowerCase()}`]) }];
          await assert.rejects(providers[provider].update({ ...account, provider }, archived, "trash"), /unique archive/);
        }
        assert.equal(moves.length, before);
      } finally { folders = originalFolders; }
      for (folders of [
        [{ path: "Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }],
        [{ path: "Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }, { path: "Archive", flags: new Set<string>() }],
        [{ path: "Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }, { path: "Archive", specialUse: "\\Archive", flags: new Set<string>() }],
        [{ path: "Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }, { path: "A", specialUse: "\\Archive", flags: new Set(["\\Archive"]) }, { path: "B", flags: new Set(["\\Archive"]) }],
        [{ path: "Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }, { path: "A", specialUse: "\\Archive", flags: new Set(["\\Archive"]) }, { path: "B", specialUse: "\\Archive", flags: new Set(["\\Archive"]) }],
      ]) await assert.rejects(providers.imap.update(account, archived, "trash"), /unique archive/);
      folders = [{ path: "Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }, { path: "Saved", specialUse: "\\Archive", flags: new Set(["\\Archive"]) }];
      await assert.rejects(providers.imap.update(account, { ...archived, messageId: undefined }, "trash"), /no Message-ID/);
      await assert.rejects(providers.imap.update(account, { ...archived, messageId: "<bad\r\n@example.com>" }, "trash"), /invalid Message-ID/);
      for (matches of [[], [77, 78], [0], [4294967296]]) {
        await assert.rejects(providers.imap.update(account, archived, "trash"), /Could not identify/);
      }
      matches = [77];
      for (header of [
        "Message-ID: <other@example.com> (contains <synthetic@example.com>)\r\n\r\n",
        "Message-ID: <SYNTHETIC@example.com>\r\n\r\n",
        "Subject: Missing identity\r\n\r\n",
      ]) await assert.rejects(providers.imap.update(account, archived, "trash"), /Could not identify/);
      header = "Message-ID: <synthetic@example.com>\r\n\r\n";
      missingCandidate = true;
      await assert.rejects(providers.imap.update(account, archived, "trash"), /Could not identify/);
      missingCandidate = false;
      candidateUid = 78;
      await assert.rejects(providers.imap.update(account, archived, "trash"), /Could not identify/);
      candidateUid = undefined;
      assert.equal(moves.length, before);
      validity = 99n;
      put("mail", mail.id, archived);
      await updateMessage(mail.id, { action: "trash" });
      assert.equal(opened.at(-1), "Saved");
      assert.deepEqual(moves.at(-1), { uid: "77", target: "Bin" });
      assert.equal(all("mail").some((cached) => cached.id === mail.id), false);
      folders = [{ path: "Google Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }, { path: "Everything", specialUse: "\\All", flags: new Set(["\\All"]) }];
      await providers["gmail-imap"].update({ ...account, provider: "gmail-imap" }, archived, "trash");
      assert.equal(opened.at(-1), "Everything");
      assert.deepEqual(moves.at(-1), { uid: "77", target: "Google Bin" });
      validity = 1n;
      folders = [{ path: "Bin", specialUse: "\\Trash", flags: new Set(["\\Trash"]) }, { path: "Saved", specialUse: "\\Archive", flags: new Set(["\\Archive"]) }];
    });

    await t.test("failed moves retain mail; confirmed moves survive release/logout errors without retries", async () => {
      put("mail", mail.id, mail);
      moveFails = true;
      const before = moves.length;
      assert.equal((await patch(mail.id, { action: "trash" })).status, 400);
      assert.deepEqual(all("mail").find((cached) => cached.id === mail.id), mail);
      assert.equal(moves.length, before + 1);
      moveFails = false;
      logoutFails = true;
      releaseFails = true;
      await updateMessage(mail.id, { action: "trash" });
      assert.equal(all("mail").some((cached) => cached.id === mail.id), false);
      assert.equal(moves.length, before + 2);
      assert.equal(locked, false);
      assert.ok(closes > 0);
      logoutFails = false;
      releaseFails = false;
    });

    await t.test("snooze is local and read still only adds Seen", async () => {
      put("mail", mail.id, mail);
      const before = moves.length, connectCount = connects;
      await updateMessage(mail.id, { action: "snooze", until: Date.now() + 3600000 });
      assert.ok(all("mail").find((cached) => cached.id === mail.id)!.snoozedUntil);
      await updateMessage(mail.id, { action: "unsnooze" });
      assert.equal(all("mail").find((cached) => cached.id === mail.id)!.snoozedUntil, null);
      assert.equal(connects, connectCount);
      await updateMessage(mail.id, { action: "read" });
      assert.deepEqual(seen, ["5"]);
      assert.equal(moves.length, before);
      assert.equal(all("mail").find((cached) => cached.id === mail.id)!.unread, false);
    });
    for (const forbidden of [deleted, copied, created, closedMailbox, gmailDelete, gmailBatchDelete, gmailModify])
      assert.equal(forbidden.mock.callCount(), 0);
    assert.ok(releases > 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeStore();
    rmSync(directory, { recursive: true, force: true });
  }
});
