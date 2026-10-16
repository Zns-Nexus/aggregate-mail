import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { Mail, State } from "../shared/types.js";
import { quietImapWatch, quietGmailRevision } from "./imap-watch-fixture.js";

test("local mail features persist encrypted preferences and pins without provider mutations", { timeout: 60000 }, async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "emc2-mail-features-"));
  Object.assign(process.env, {
    MAIL_DATA_DIR: directory, MAIL_CONFIG_PATH: path.join(directory, "absent.env"),
    MAIL_DATA_KEY: Buffer.alloc(32, 17).toString("base64"), MAIL_DESKTOP_TOKEN: "synthetic-token",
    GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", TYPESAFE_API_KEY: "", OPENAI_API_KEY: "",
  });
  const { all, put, closeStore } = await import("./store.js");
  const { providers } = await import("./providers.js");
  const { startServer, syncMail } = await import("./index.js");
  const mail: Mail = {
    id: "a:1", remoteId: "1", accountId: "a", sender: "Sender", address: "sender@example.com",
    to: "reader@example.com", subject: "Synthetic mail", body: "Body", preview: "Body", date: 1,
    unread: true, category: "important", relevance: 2, reason: "", archived: false, snoozedUntil: null,
  };
  let incoming = [mail];
  let release = () => {};
  let entered = () => {};
  let gate = Promise.resolve();
  for (const provider of Object.values(providers)) {
    t.mock.method(provider, "list", async () => { entered(); await gate; return incoming; });
    t.mock.method(provider, "update", async () => { assert.fail("Local feature called a provider mutation"); });
    t.mock.method(provider, "send", async () => { assert.fail("Local feature sent email"); });
  }
  put("account", "a", { id: "a", email: "reader@example.com", provider: "imap", hasSynced: false,
    credentials: { password: "synthetic-password" } });
  const server = await startServer(0, undefined, undefined, undefined, quietImapWatch, quietGmailRevision);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api`;
  const desktop = { "X-Desktop-Token": "synthetic-token", "Content-Type": "application/json" };
  const state = async () => (await (await fetch(`${base}/state`, { headers: desktop })).json()) as State & { csrf: string };
  const headers = { ...desktop, "X-CSRF-Token": (await state()).csrf };
  const request = (url: string, method: string, body: unknown, h: HeadersInit = headers) =>
    fetch(`${base}${url}`, { method, headers: h, body: JSON.stringify(body) });
  const preferences = { templates: [{ id: "t", name: "Follow up", subject: "Next steps", body: "Synthetic template private text" }],
    signatures: { a: "Synthetic signature private text" } };
  try {
    assert.deepEqual((await state()).composePreferences, { templates: [], signatures: {} });
    assert.equal((await request("/compose-preferences", "PUT", preferences)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/compose-preferences`, { headers: desktop })).json(), preferences);
    assert.deepEqual((await state()).composePreferences, preferences);
    const inspection = new DatabaseSync(path.join(directory, "mail.sqlite"), { readOnly: true });
    try {
      const encrypted = inspection.prepare("SELECT value FROM records WHERE kind='compose'").get();
      assert.ok(encrypted);
      assert.ok(!String(encrypted.value).includes(preferences.templates[0].body));
      assert.ok(!String(encrypted.value).includes(preferences.signatures.a));
    } finally { inspection.close(); }

    for (const body of [null, {}, { ...preferences, unknown: true }, { ...preferences, templates: [preferences.templates[0], preferences.templates[0]] },
      { ...preferences, signatures: { missing: "Signature" } },
      { ...preferences, signatures: { a: "x".repeat(10001) } },
      { ...preferences, templates: [{ ...preferences.templates[0], subject: "Subject\nInjected" }] }])
      assert.equal((await request("/compose-preferences", "PUT", body)).status, 400);
    assert.equal((await request("/compose-preferences", "PUT", preferences, desktop)).status, 403);
    assert.equal((await request("/compose-preferences", "PUT", preferences, { ...headers, Origin: "https://example.com" })).status, 403);
    assert.equal((await fetch(`${base}/compose-preferences`)).status, 403);
    assert.deepEqual(all("compose"), [preferences]);

    await syncMail();
    assert.equal((await state()).unreadArrivals, 0, "initial import is silent");
    const pin = (action: string, id = mail.id) => request(`/messages/${encodeURIComponent(id)}`, "PATCH", { action });
    assert.equal((await pin("pin")).status, 200);
    assert.equal(all("mail")[0].pinned, true);
    incoming = [{ ...mail, subject: "Refreshed subject" }, { ...mail, id: "a:2", remoteId: "2" }];
    await syncMail();
    assert.equal((await state()).messages.find((m) => m.id === mail.id)?.pinned, true);
    assert.equal((await state()).unreadArrivals, 1, "later unread arrival is counted once");
    await syncMail();
    assert.equal((await state()).unreadArrivals, 1, "repeat sync is silent");

    const started = new Promise<void>((resolve) => { entered = resolve; });
    gate = new Promise<void>((resolve) => { release = resolve; });
    const syncing = syncMail();
    await started;
    const unpinning = pin("unpin");
    release();
    await syncing;
    assert.equal((await unpinning).status, 200, "local pin action is allowed and ordered after sync");
    gate = Promise.resolve();
    assert.equal(all("mail").find((m) => m.id === mail.id)?.pinned, undefined);
    assert.equal((await pin("pin", "missing")).status, 404);
    assert.equal((await request(`/messages/${mail.id}`, "PATCH", { action: "pin", pinned: true })).status, 400);
    assert.equal((await request(`/messages/${mail.id}`, "PATCH", { action: "pin" }, desktop)).status, 403);
    assert.equal((await pin("pin")).status, 200);

    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const persisted = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { all, closeStore } from './server/store.ts';
      try {
        assert.equal(all('mail').find(m => m.id === 'a:1').pinned, true);
        assert.equal(all('compose')[0].templates[0].name, 'Follow up');
        assert.equal(all('compose')[0].signatures.a, 'Synthetic signature private text');
      } finally { closeStore(); }
    `], { env, encoding: "utf8", timeout: 30000 });
    assert.ifError(persisted.error);
    assert.equal(persisted.status, 0, persisted.stderr);
    assert.equal((await fetch(`${base}/accounts/a`, { method: "DELETE", headers })).status, 200);
    assert.deepEqual(all("compose")[0].signatures, {});
    assert.equal(all("mail").length, 0);
  } finally {
    release();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    closeStore();
    rmSync(directory, { recursive: true, force: true });
  }
});
