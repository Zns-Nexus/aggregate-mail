import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { google } from "googleapis";
import { ImapFlow, type ImapFlowOptions } from "imapflow";
import nodemailer from "nodemailer";
import { imap, providers } from "./providers.js";
import { ImapWatch, type ImapWatchFactory } from "./imap-watch.js";
import type { StoredAccount } from "./store.js";
import type { Mail, State } from "../shared/types.js";

const account = (id: string, provider: StoredAccount["provider"] = "imap"): StoredAccount => ({
  id, provider, email: `${id}@example.com`,
  credentials: { imapHost: "imap.example.com", password: "synthetic-password" },
});
const mail = (a: StoredAccount, id: string): Mail => ({
  id: `${a.id}:1:${id}`, accountId: a.id, remoteId: `1:${id}`,
  sender: "Synthetic", address: "sender@example.com", to: a.email,
  subject: "Synthetic", body: "Body", preview: "Body", date: 1700000000000,
  unread: true, category: "important", relevance: 2, reason: "Saved",
  archived: false, snoozedUntil: null,
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 3000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, "synthetic service postcondition timed out");
    await sleep(5);
  }
}

function syntheticWatch(a: StoredAccount) {
  // Construct the real account-safe client, then inject every external operation.
  const client = imap(a, true);
  let closes = 0;
  let closed = false;
  client.connect = async () => {};
  client.mailboxOpen = async (folder, options) => {
    assert.equal(folder, "INBOX");
    assert.deepEqual(options, { readOnly: true });
    client.emit("exists", { path: "INBOX" });
    client.emit("flags", { path: "INBOX" });
    return { path: "INBOX" } as Exclude<ImapFlow["mailbox"], false>;
  };
  client.close = () => { if (!closed) { closed = true; closes++; client.emit("close"); } };
  return { client, account: a, get closes() { return closes; } };
}

test("watch identity, selection, bounded reconnect and periodic recovery use synthetic IO", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const connections: ReturnType<typeof syntheticWatch>[] = [];
  const changes: string[] = [];
  const factory: ImapWatchFactory = (a) => {
    const watch = syntheticWatch(a);
    connections.push(watch);
    return watch.client;
  };
  const watcher = new ImapWatch((a) => changes.push(a.id), factory);
  const a = account("a"), b = account("b", "gmail-imap"), api = account("api", "gmail");
  try {
    watcher.reconcile([a, b, api]);
    await flush();
    assert.equal(connections.length, 2);
    const options = (connections[0].client as ImapFlow & { options: ImapFlowOptions }).options;
    assert.equal(options.logger, false); assert.equal(options.secure, true);
    assert.equal(options.socketTimeout, 30 * 60000); assert.equal(options.maxIdleTime, 5 * 60000);
    t.mock.timers.tick(100);
    assert.deepEqual(changes, ["a", "b"]);
    watcher.reconcile([{ ...a, hasSynced: true }, b, api]);
    assert.equal(connections.length, 2, "sync metadata must not replace connections");
    const old = connections[0];
    watcher.reconcile([{ ...a, credentials: { ...a.credentials, username: "replacement" } }, b]);
    await flush(); t.mock.timers.tick(100);
    assert.equal(old.closes, 1);
    old.client.emit("exists", { path: "INBOX" });
    assert.equal(old.client.listenerCount("exists"), 0);
    let current = connections.at(-1)!;
    current.client.emit("exists", { path: "Other" });
    t.mock.timers.tick(100);
    assert.deepEqual(changes, ["a", "b", "a"]);
    for (let retry = 0; retry < 6; retry++) {
      current.client.emit("error", new Error("Synthetic disconnect"));
      current.client.emit("close"); // Error/close must count as one disconnect.
      assert.equal(current.closes, 1);
      const before: number = connections.length;
      if (retry < 5) {
        const delay = Math.min(1000 * 2 ** retry, 30000);
        t.mock.timers.tick(delay - 1); assert.equal(connections.length, before);
        t.mock.timers.tick(1); await flush();
        assert.equal(connections.length, before + 1);
        t.mock.timers.tick(100);
        current = connections.at(-1)!;
      } else {
        t.mock.timers.tick(60000); await flush();
        assert.equal(connections.length, before, "automatic reconnect is exhausted");
      }
    }
    watcher.reconcile([connections.at(-1)!.account, b]);
    await flush();
    assert.equal(connections.length, 9, "periodic recovery opens one new window");
    const recovered = connections.at(-1)!;
    recovered.client.emit("close");
    watcher.close(); t.mock.timers.tick(60000); await flush();
    assert.equal(connections.length, 9, "shutdown clears reconnect timers");
    assert.equal(connections[1].closes, 1);
  } finally { watcher.close(); }
});

test("pending watch replacement and connection/selection rejection cannot revive stale clients", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const connect = deferred(), opened: string[] = [], changed: string[] = [];
  const connections: ReturnType<typeof syntheticWatch>[] = [];
  const factory: ImapWatchFactory = (a) => {
    const watch = syntheticWatch(a); connections.push(watch);
    if (connections.length === 1) watch.client.connect = () => connect.promise;
    else if (connections.length === 2) watch.client.connect = async () => { throw new Error("Synthetic connect failure"); };
    else if (connections.length === 3) watch.client.mailboxOpen = async () => { throw new Error("Synthetic select failure"); };
    else {
      const open = watch.client.mailboxOpen;
      watch.client.mailboxOpen = async (...args) => { opened.push(a.credentials.username!); return open(...args); };
    }
    return watch.client;
  };
  const watcher = new ImapWatch((a) => changed.push(a.id), factory);
  const a = account("a");
  try {
    watcher.reconcile([a]); await flush();
    watcher.reconcile([{ ...a, credentials: { ...a.credentials, username: "current" } }]);
    connect.resolve(); await flush();
    assert.equal(connections[0].closes, 1); assert.equal(connections[1].closes, 1);
    assert.deepEqual(opened, []); assert.deepEqual(changed, []);
    t.mock.timers.tick(1000); await flush();
    assert.equal(connections[2].closes, 1);
    t.mock.timers.tick(1999); assert.equal(connections.length, 3);
    t.mock.timers.tick(1); await flush(); t.mock.timers.tick(100);
    assert.deepEqual(opened, ["current"]); assert.deepEqual(changed, ["a"]);
    watcher.reconcile([]);
    connections.at(-1)!.client.emit("exists", { path: "INBOX" });
    t.mock.timers.tick(60000); await flush();
    assert.equal(connections.length, 4); assert.deepEqual(changed, ["a"]);
  } finally { watcher.close(); }
});

test("IMAP live service journey: import, arrival/read, isolation, bursts, failures and lifecycle", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "emc2-live-"));
  process.env.MAIL_DATA_DIR = directory;
  process.env.MAIL_CONFIG_PATH = path.join(directory, "absent.env");
  process.env.MAIL_DATA_KEY = Buffer.alloc(32, 11).toString("base64");
  process.env.MAIL_DESKTOP_TOKEN = "synthetic-live-token";
  process.env.TYPESAFE_API_KEY = ""; process.env.OPENAI_API_KEY = "";
  const { all, put, closeStore } = await import("./store.js");
  const { startServer } = await import("./index.js");
  const connections: ReturnType<typeof syntheticWatch>[] = [];
  const factory: ImapWatchFactory = (a) => {
    const watch = syntheticWatch(a); connections.push(watch); return watch.client;
  };
  const a = account("a"), b = account("b", "gmail-imap"), api = account("api", "gmail");
  for (const record of [a, b, api]) put("account", record.id, record);
  const inboxes = new Map([[a.id, [mail(a, "1")]], [b.id, [mail(b, "1")]], [api.id, [] as Mail[]]]);
  const calls: StoredAccount[] = [];
  let active = 0, peak = 0;
  let firstImportFails = true;
  let list: (a: StoredAccount, batch?: (mail: Mail[]) => void) => Promise<Mail[]> = async (a, batch) => {
    if (a.id === "b" && firstImportFails) {
      firstImportFails = false; batch?.(inboxes.get(a.id)!);
      throw new Error("Synthetic first-import partial failure");
    }
    return inboxes.get(a.id)!;
  };
  const listIO = async (a: StoredAccount, _cached: Map<string, Mail>, batch?: (mail: Mail[]) => void) => {
    calls.push(a); peak = Math.max(peak, ++active);
    try { return await list(a, batch); } finally { active--; }
  };
  for (const provider of ["imap", "gmail-imap", "gmail"] as const) t.mock.method(providers[provider], "list", listIO);
  t.mock.method(google, "gmail", () => ({ users: { labels: { list: async () => ({ data: { labels: [] } }) } } }), {});
  // Registration validation also uses only synthetic IO.
  t.mock.method(ImapFlow.prototype, "connect", async () => {});
  t.mock.method(ImapFlow.prototype, "mailboxOpen", async () => ({}));
  t.mock.method(ImapFlow.prototype, "close", () => {});
  t.mock.method(nodemailer, "createTransport", () => ({ verify: async () => true }));
  const notifications: number[] = [];
  let changed = 0;
  const server = await startServer(0, undefined, () => changed++, (count) => notifications.push(count), factory);
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const networkFetch = globalThis.fetch;
  const headers = { "X-Desktop-Token": "synthetic-live-token", "X-CSRF-Token": "", "Content-Type": "application/json" };
  const state = async () => (await (await networkFetch(`${origin}/api/state`, { headers })).json()) as State & { csrf: string };
  headers["X-CSRF-Token"] = (await state()).csrf;
  const request = (route: string, body = {}, method = "POST") => networkFetch(`${origin}/api${route}`, { headers, method, body: JSON.stringify(body) });
  const idle = () => until(async () => !(await state()).syncing);
  const watcher = (id: string) => connections.findLast((w) => w.account.id === id)!;
  const event = (id: string, name = "exists") => watcher(id).client.emit(name, { path: "INBOX" });
  const settledEvent = async (id: string, name = "exists") => {
    const before = calls.length;
    event(id, name); await until(() => calls.length > before); await idle();
  };
  let closed = false;
  try {
    await t.test("first import suppresses arrivals; watches both IMAP transports, API stays polling", async () => {
      await until(() => !!all("account").find((a) => a.id === "a")?.hasSynced && !!all("account").find((a) => a.id === "b")?.error);
      await idle();
      assert.equal(connections.length, 2);
      assert.deepEqual(calls.map((a) => a.id).sort(), ["a", "b"]);
      assert.deepEqual(notifications, []); assert.equal(all("mail").length, 2);
      assert.equal(all("account").find((a) => a.id === "b")?.hasSynced, false);
      inboxes.get("b")!.push(mail(b, "2"));
      await settledEvent("b");
      assert.equal(all("account").find((a) => a.id === "b")?.hasSynced, true);
      assert.deepEqual(notifications, [], "a partial first import does not enable arrivals");
    });
    await t.test("post-import arrival reaches callback once; flags refresh only A and expunge archives", async () => {
      inboxes.get("a")!.push(mail(a, "2"));
      const before = calls.length;
      for (const name of ["exists", "flags", "expunge", "exists"]) event("a", name);
      await until(() => calls.length > before); await idle();
      assert.deepEqual(calls.slice(before).map((a) => a.id), ["a"]);
      assert.deepEqual(notifications, [1]);
      inboxes.get("a")![0] = { ...inboxes.get("a")![0], unread: false };
      await settledEvent("a", "flags");
      const result = await state();
      assert.equal(result.messages.find((m) => m.id === "a:1:1")?.unread, false);
      assert.equal(result.messages.find((m) => m.id === "b:1:1")?.unread, true);
      inboxes.set("a", inboxes.get("a")!.slice(1));
      await settledEvent("a", "expunge");
      assert.equal(all("mail").find((m) => m.id === "a:1:1")?.archived, true);
      await settledEvent("a"); assert.deepEqual(notifications, [1]);
      const count = calls.length; await sleep(250);
      assert.equal(calls.length, count, "sync produces no watch-event feedback loop");
      assert.ok(changed > 0);
    });
    await t.test("events during active sync coalesce one follow-up; max two accounts and reads stay serialized", async () => {
      const entered = deferred(), release = deferred();
      let first = true;
      list = async (account) => {
        const snapshot = [...inboxes.get(account.id)!];
        if (account.id === "a" && first) { first = false; entered.resolve(); await release.promise; }
        return snapshot;
      };
      const before = calls.length;
      event("a"); await entered.promise;
      inboxes.get("a")!.push(mail(a, "3"));
      let providerReads = 0;
      t.mock.method(providers.imap, "update", async () => { assert.equal(active, 0); providerReads++; });
      const read = request("/messages/a:1:2", { action: "read" }, "PATCH");
      for (let i = 0; i < 30; i++) { event("a", "flags"); event("b"); }
      await until(() => calls.slice(before).some((a) => a.id === "b"));
      assert.equal(providerReads, 0);
      release.resolve(); await until(() => calls.slice(before).filter((a) => a.id === "a").length === 2);
      await idle(); assert.equal((await read).status, 200);
      assert.deepEqual(calls.slice(before).map((a) => a.id).sort(), ["a", "a", "b"]);
      assert.equal(peak, 2); assert.equal(providerReads, 1);
      assert.equal(all("mail").find((m) => m.id === "a:1:2")?.unread, false);
      assert.deepEqual(notifications, [1, 1]);
      list = async (a) => inboxes.get(a.id)!;
    });
    await t.test("periodic sync keeps existing watches and polls Gmail API", async () => {
      const count = connections.length, before = calls.length;
      assert.equal((await request("/sync")).status, 200);
      assert.deepEqual(calls.slice(before).map((a) => a.id).sort(), ["a", "api", "b"]);
      assert.equal(connections.length, count);
      assert.deepEqual(notifications, [1, 1]);
    });
    await t.test("partial failures retain cache without notification; duplicate batches count once", async () => {
      list = async (a, batch) => {
        if (a.id === "a") { batch?.([mail(a, "4"), mail(a, "4")]); throw new Error("Synthetic partial failure"); }
        return inboxes.get(a.id)!;
      };
      await settledEvent("a");
      assert.ok(all("account").find((a) => a.id === "a")?.error);
      assert.ok(all("mail").some((m) => m.id === "a:1:4"));
      assert.equal(all("mail").find((m) => m.id === "a:1:3")?.archived, false);
      assert.deepEqual(notifications, [1, 1]);
      inboxes.get("a")!.push(mail(a, "4"));
      list = async (a, batch) => {
        const incoming = inboxes.get(a.id)!;
        if (a.id === "a") { incoming.push(mail(a, "5")); batch?.([mail(a, "5"), mail(a, "5")]); }
        return incoming;
      };
      await settledEvent("a"); assert.deepEqual(notifications, [1, 1, 1]);
      list = async (a) => inboxes.get(a.id)!;
    });
    await t.test("replacement drops old connection and late cache writes; removal and shutdown stop events", async () => {
      const old = watcher("a"), entered = deferred(), release = deferred();
      list = async (a, batch) => {
        if (a.id === "a" && a.credentials.password === "synthetic-password") {
          entered.resolve(); await release.promise;
          batch?.([mail(a, "old-credentials")]); return [mail(a, "old-credentials")];
        }
        return inboxes.get(a.id)!;
      };
      event("a"); await entered.promise;
      assert.equal((await request("/accounts/imap", { provider: "imap", email: a.email, password: "replacement-password", imapHost: "imap.example.com", smtpHost: "smtp.example.com" })).status, 200);
      assert.equal(old.closes, 1);
      const before = calls.length;
      old.client.emit("exists", { path: "INBOX" });
      await sleep(150); release.resolve();
      await until(() => calls.length > before); await idle();
      assert.equal(all("mail").some((m) => m.remoteId.endsWith("old-credentials")), false);
      assert.equal(all("account").find((a) => a.id === "a")?.credentials.password, "replacement-password");
      assert.deepEqual(notifications, [1, 1, 1]);
      const current = watcher("a");
      assert.equal((await request("/accounts/a", {}, "DELETE")).status, 200);
      assert.equal(current.closes, 1); assert.equal(all("mail").some((m) => m.accountId === "a"), false);
      const count = calls.length;
      current.client.emit("flags", { path: "INBOX" });
      // Pending events must be canceled by shutdown.
      event("b");
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      closed = true;
      assert.equal(watcher("b").closes, 1);
      event("b"); await sleep(250); assert.equal(calls.length, count);
    });
  } finally {
    if (!closed) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    closeStore(); rmSync(directory, { recursive: true, force: true });
  }
});
