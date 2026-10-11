import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { google } from "googleapis";
import { ImapFlow } from "imapflow";
import { parse, providers } from "./providers.js";
import type { StoredAccount } from "./store.js";
import type { Mail } from "../shared/types.js";

const account: StoredAccount = {
  id: "a", email: "me@example.com", provider: "gmail", credentials: {},
};
const mail: Mail = {
  id: "a:abc", accountId: "a", remoteId: "abc", sender: "Sender", address: "sender@example.com",
  to: "me@example.com", subject: "Photo", body: "Stored original\n\n\nText", preview: "Text",
  date: 1700000000000, unread: true, category: "important", relevance: 3, reason: "Team",
  archived: false, snoozedUntil: null, messageId: "<photo@example.com>",
};
const source = (html: string, id = mail.messageId) => Buffer.from([
  "From: Sender <sender@example.com>", "To: me@example.com", "Subject: Photo",
  `Message-ID: ${id}`, "MIME-Version: 1.0", "Content-Type: multipart/alternative; boundary=part", "",
  "--part", "Content-Type: text/plain; charset=utf-8", "", "Original\n\n\nText",
  "--part", "Content-Type: text/html; charset=utf-8", "", html, "--part--", "",
].join("\r\n"));
const photo = { src: "https://images.example.com/photo.png?x=1&y=2", alt: "A photo" };
const html = `<p>Original</p><img src="https://images.example.com/photo.png?x=1&amp;y=2" alt="A photo">`;

test("MIME parsing keeps text and extracts bounded safe metadata without sender HTML", async () => {
  const parsed = await parse(account, "abc", source(html + [
    '<img src="https://images.example.com/photo.png?x=1&amp;y=2">',
    '<img src="http://images.example.com/insecure.png">', '<img src="cid:embedded">',
    '<img src="data:image/png;base64,aA==">', '<img src="https://127.0.0.1/private">',
    '<img src="https://user:secret@example.com/private">',
    '<script><img src="https://example.com/script"></script>',
    '<iframe src="https://example.com/frame"></iframe>',
  ].join("")), true);
  assert.equal(parsed.body, "Original\n\n\nText");
  assert.deepEqual(parsed.images, [photo]);
  assert.ok(!("html" in parsed));
  const many = await parse(account, "many", source(Array.from({ length: 80 }, (_, i) =>
    `<img src="https://example.com/${i}.png" alt="${"a".repeat(600)}">`).join("")), false);
  assert.equal(many.images?.length, 50);
  assert.equal(many.images?.[0].alt.length, 500);
  const noImages = await parse(account, "plain", source("<p>Plain</p>"), false);
  assert.deepEqual(noImages.images, []);
});

test("Gmail keeps cached metadata sync and loads exactly one stable ID on demand, including archives", async (t) => {
  const requests: object[] = [];
  t.mock.method(google as unknown as { gmail: () => unknown }, "gmail", () => ({ users: { messages: {
    list: async () => ({ data: { messages: [{ id: "abc" }] } }),
    get: async (input: { format: string }) => {
      requests.push(input);
      return { data: input.format === "raw" ? { raw: source(html).toString("base64url") } :
        { labelIds: ["INBOX"], threadId: "thread" } };
    },
  } } }));
  const cached = await providers.gmail.list(account, new Map([[mail.id, mail]]));
  assert.equal(cached[0].body, mail.body);
  assert.equal(cached[0].images, undefined);
  assert.deepEqual(requests, [{ userId: "me", id: "abc", format: "metadata", fields: "labelIds,threadId" }]);
  requests.length = 0;
  assert.deepEqual(await providers.gmail.images(account, { ...mail, archived: true }), [photo]);
  assert.deepEqual(requests, [{ userId: "me", id: "abc", format: "raw" }]);
  assert.equal(mail.body, "Stored original\n\n\nText");
});

test("IMAP refuses archived or changed UIDs and checks the requested source identity", async (t) => {
  let connects = 0, fetches = 0, releases = 0, logouts = 0;
  let validity = "123", mime = source(html);
  t.mock.method(ImapFlow.prototype, "connect", async function (this: ImapFlow) {
    connects++;
    this.usable = true;
  });
  t.mock.method(ImapFlow.prototype, "getMailboxLock", async function (this: ImapFlow, folder: string) {
    assert.equal(folder, "INBOX");
    Object.assign(this, { mailbox: { uidValidity: BigInt(validity) } });
    return { path: folder, release() { releases++; } };
  });
  t.mock.method(ImapFlow.prototype, "fetchOne", async (uid: unknown, query: unknown, options: unknown) => {
    fetches++;
    assert.equal(uid, "7");
    assert.deepEqual(query, { source: true });
    assert.deepEqual(options, { uid: true });
    return { source: mime } as Awaited<ReturnType<ImapFlow["fetchOne"]>>;
  });
  t.mock.method(ImapFlow.prototype, "logout", async () => { logouts++; });
  const imapAccount: StoredAccount = { ...account, provider: "imap", credentials: { imapHost: "imap.example.com" } };
  const imapMail = { ...mail, remoteId: "123:7" };
  await assert.rejects(providers.imap.images(imapAccount, { ...imapMail, archived: true }), /archived IMAP/);
  await assert.rejects(providers.imap.images(imapAccount, { ...imapMail, remoteId: "bad" }), /identifiers/);
  assert.equal(connects, 0);
  validity = "999";
  await assert.rejects(providers.imap.images(imapAccount, imapMail), /identifiers changed/);
  assert.equal(fetches, 0);
  validity = "123";
  assert.deepEqual(await providers.imap.images(imapAccount, imapMail), [photo]);
  mime = source(html, "<different@example.com>");
  await assert.rejects(providers.imap.images(imapAccount, imapMail), /identity changed/);
  assert.equal(releases, 3);
  assert.equal(logouts, 3);
});

test("image API protects access, caches one message and preserves concurrent mail actions and text", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "emc2-images-"));
  process.env.MAIL_DATA_DIR = directory;
  process.env.MAIL_CONFIG_PATH = path.join(directory, "settings.env");
  process.env.MAIL_DESKTOP_TOKEN = "test-only-images-token";
  const { startServer } = await import("./index.js");
  const { all, put } = await import("./store.js");
  put("account", account.id, account);
  put("mail", mail.id, mail);
  put("mail", "a:other", { ...mail, id: "a:other", remoteId: "other" });
  let calls = 0;
  t.mock.method(providers.gmail, "images", async (a: StoredAccount, m: Mail) => {
    calls++;
    assert.equal(a.id, "a");
    assert.equal(m.remoteId, "abc");
    put("mail", mail.id, { ...mail, archived: true, unread: false });
    return [photo];
  });
  const server = await startServer(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { "X-Desktop-Token": "test-only-images-token" };
    const route = `${base}/api/messages/${encodeURIComponent(mail.id)}/images`;
    const state = await (await fetch(`${base}/api/state`, { headers })).json() as { csrf: string };
    assert.equal(calls, 0);
    assert.equal((await fetch(route, { method: "POST" })).status, 403);
    assert.equal((await fetch(route, { method: "POST", headers })).status, 403);
    const authorized = { ...headers, "X-CSRF-Token": state.csrf };
    assert.equal((await fetch(route, { method: "POST", headers: { ...authorized, Origin: "https://untrusted.example.com" } })).status, 403);
    const revealed = await fetch(route, { method: "POST", headers: authorized });
    assert.equal(revealed.status, 200);
    assert.deepEqual(await revealed.json(), { images: [photo] });
    const stored = all("mail").find((m) => m.id === mail.id)!;
    assert.equal(stored.body, mail.body);
    assert.equal(stored.archived, true);
    assert.equal(stored.unread, false);
    assert.deepEqual(stored.images, [photo]);
    assert.equal(all("mail").find((m) => m.id === "a:other")?.images, undefined);
    await fetch(route, { method: "POST", headers: authorized });
    assert.equal(calls, 1);
    assert.equal((await fetch(`${base}/api/messages/missing/images`, { method: "POST", headers: authorized })).status, 400);
    const page = await fetch(`${base}/`);
    const csp = page.headers.get("content-security-policy")!;
    assert.match(csp, /img-src 'self' data: https:/);
    assert.match(csp, /script-src 'self'; style-src 'self'/);
    assert.match(csp, /connect-src 'self'; object-src 'none'/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
