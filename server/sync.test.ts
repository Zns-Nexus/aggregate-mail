import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { google } from "googleapis";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { quietImapWatch } from "./imap-watch-fixture.js";
import type { Mail, State } from "../shared/types.js";
import type { StoredAccount } from "./store.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}
const fixture = (id: string, provider: StoredAccount["provider"] = "imap"): StoredAccount => ({
  id, email: `${id}@example.com`, provider, credentials: {},
});
const mail = (a: StoredAccount, id = "one"): Mail => ({
  id: `${a.id}:${id}`, accountId: a.id, remoteId: id,
  sender: "Synthetic Sender", address: "sender@example.com", to: a.email,
  subject: "Please review", preview: "Synthetic mail", body: "Synthetic body",
  date: 1700000000000, unread: true, category: "important", relevance: 2,
  reason: "Saved sorting", archived: false, snoozedUntil: null,
});
const aiAnswer = () => new Response(JSON.stringify({ model: "synthetic", answers: {
  category: { type: "choice", choice: "other" }, relevance: { type: "score", score: 0 }, reason: { type: "choice", choice: "Newsletter" },
} }));

// The subprocess releases SQLite handles before the parent removes its profile.
if (!process.env.EMC2_SYNC_TEST_CHILD) {
  test("synthetic sync service regressions", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "emc2-sync-"));
    try {
      const env: NodeJS.ProcessEnv = { ...process.env, EMC2_SYNC_TEST_CHILD: "1", MAIL_DATA_DIR: directory,
        MAIL_CONFIG_PATH: path.join(directory, "absent.env"), MAIL_DESKTOP_TOKEN: "synthetic-token",
        GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret",
        TYPESAFE_API_KEY: "", OPENAI_API_KEY: "" };
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, ["--import", "tsx", "--test", fileURLToPath(import.meta.url)], {
        env,
        encoding: "utf8", timeout: 30000,
      });
      assert.match(result.stdout, /account connection, progress, coalescing and recovery/);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      console.log(result.stdout.trim());
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
} else {
  test("account connection, progress, coalescing and recovery", async (t) => {
    const { providers } = await import("./providers.js");
    const { all, put, remove } = await import("./store.js");
    const { startServer } = await import("./index.js");
    mock.method(ImapFlow.prototype, "connect", async () => {});
    mock.method(ImapFlow.prototype, "mailboxOpen", async () => ({}));
    mock.method(ImapFlow.prototype, "close", () => {});
    mock.method(nodemailer, "createTransport", () => ({ verify: async () => true }));
    mock.method(google, "gmail", () => ({ users: { labels: { list: async () => ({ data: { labels: [] } }) } } }), {});
    let onMailChanged: (() => void) | undefined;
    const server = await startServer(0, undefined, () => onMailChanged?.(), undefined, quietImapWatch);
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const headers = { "X-Desktop-Token": "synthetic-token", "Content-Type": "application/json", "X-CSRF-Token": "" };
    const networkFetch = globalThis.fetch;
    const state = async () => (await (await networkFetch(`${origin}/api/state`, { headers })).json()) as State & { csrf: string };
    headers["X-CSRF-Token"] = (await state()).csrf;
    const request = (route: string, body = {}, method = "POST") => networkFetch(`${origin}/api${route}`, { method, headers, body: JSON.stringify(body) });
    const add = (email: string) => request("/accounts/imap", {
      provider: "imap", email, password: "synthetic-password", imapHost: "imap.example.com", smtpHost: "smtp.example.com",
    });
    const clear = () => {
      for (const kind of ["account", "mail", "rule"] as const)
        for (const record of all(kind)) remove(kind, record.id);
    };
    t.beforeEach(clear);
    try {
      await t.test("second and third accounts start while the first is pending; duplicate sync coalesces and guards remain", async () => {
        const first = fixture("first");
        put("account", first.id, first);
        const entered = deferred(), release = deferred(), secondStarted = deferred(), releaseSecond = deferred(), thirdStarted = deferred();
        const calls: string[] = [];
        let active = 0, peak = 0;
        providers.imap.list = async (a) => {
          calls.push(a.email); peak = Math.max(peak, ++active);
          if (a.id === first.id) { entered.resolve(); await release.promise; }
          else if (a.email === "second@example.com") { secondStarted.resolve(); await releaseSecond.promise; }
          else thirdStarted.resolve();
          active--;
          return [];
        };
        const pending = request("/sync");
        await entered.promise;
        let duplicate: Promise<Response> | undefined;
        let queuedRead: Promise<Response> | undefined;
        try {
          assert.equal((await add("second@example.com")).status, 200);
          await secondStarted.promise;
          assert.equal((await add("third@example.com")).status, 200);
          assert.equal(calls.length, 2, "the third account must wait for a slot");
          releaseSecond.resolve();
          await thirdStarted.promise;
          assert.equal((await state()).syncing, true);
          duplicate = request("/sync");
          assert.equal((await request("/rules", { sender: "sender@example.com", instruction: "Keep", category: "important", relevance: 2 })).status, 409);
          queuedRead = request(`/messages/${first.id}:one`, { action: "read" }, "PATCH");
          assert.equal((await networkFetch(`${origin}/api/sync`, { method: "POST", headers: { "X-Desktop-Token": "synthetic-token" } })).status, 403);
          assert.equal((await networkFetch(`${origin}/api/state`)).status, 403);
          assert.equal((await networkFetch(`${origin}/api/state`, { headers: { ...headers, Origin: "https://untrusted.example" } })).status, 403);
        } finally {
          release.resolve();
          releaseSecond.resolve();
          if (queuedRead) assert.equal((await queuedRead).status, 404);
          await pending;
          if (duplicate) assert.equal((await duplicate).status, 200);
        }
        assert.equal(calls.length, 3);
        assert.equal(peak, 2);
        assert.equal((await state()).syncing, false);
        clear();
      });
      await t.test("Google callback schedules during pending sync and reconnect cannot restore old credentials", async () => {
        const a = { ...fixture("google", "gmail"), credentials: { refreshToken: "old-synthetic" } };
        put("account", a.id, a);
        const entered = deferred(), release = deferred(), newAccountStarted = deferred();
        const tokens: string[] = [];
        providers.gmail.list = async (account) => {
          tokens.push(account.credentials.refreshToken!);
          if (tokens.length === 1) { entered.resolve(); await release.promise; }
          if (account.id !== a.id) newAccountStarted.resolve();
          return [];
        };
        mock.method(google.auth.OAuth2.prototype, "getToken", async () => ({ tokens: { refresh_token: "new-synthetic" } }));
        let profileEmail = a.email;
        const gmailMock = mock.method(google, "gmail", () => ({ users: { getProfile: async () => ({ data: { emailAddress: profileEmail } }), labels: { list: async () => ({ data: { labels: [] } }) } } }), {});
        const connectGoogle = async () => {
          const entry = await networkFetch(`${origin}/api/oauth/google`, { redirect: "manual" });
          const location = entry.headers.get("location")!;
          const oauthState = new URL(location).searchParams.get("state")!;
          const cookie = entry.headers.get("set-cookie")!.split(";")[0];
          const callback = await networkFetch(`${origin}/api/oauth/google/callback?state=${oauthState}&code=synthetic-code`, { headers: { Cookie: cookie } });
          assert.equal(callback.status, 200);
        };
        const pending = request("/sync");
        await entered.promise;
        try {
          await connectGoogle();
          assert.equal(all("account")[0].credentials.refreshToken, "new-synthetic");
          profileEmail = "oauth-second@example.com";
          await connectGoogle();
          await newAccountStarted.promise;
          assert.equal(all("account").length, 2);
        } finally { release.resolve(); await pending; gmailMock.mock.restore(); }
        assert.deepEqual(tokens, ["old-synthetic", "new-synthetic", "new-synthetic"]);
        assert.equal(all("account").find((account) => account.id === a.id)?.credentials.refreshToken, "new-synthetic");
        clear();
      });
      await t.test("fetched Gmail batches are visible while later fetching and every configured AI judgement are pending", async () => {
        const a = fixture("progress", "gmail"); put("account", a.id, a);
        const fetched = deferred(), finishFetch = deferred(), sorting = deferred(), finishSorting = deferred();
        providers.gmail.list = async (account, _cached, onBatch) => {
          const batch = [mail(account)]; onBatch?.(batch); fetched.resolve();
          await finishFetch.promise;
          return [...batch, ...Array.from({ length: 17 }, (_, i) => mail(account, String(i)))];
        };
        let modelCalls = 0, modelActive = 0, modelPeak = 0;
        process.env.TYPESAFE_API_KEY = "synthetic-key";
        globalThis.fetch = async (url, init) => {
          if (String(url).startsWith(origin)) return networkFetch(url, init);
          assert.equal(String(url), "https://api.typesafe.ai/v1/systemone");
          modelCalls++; modelPeak = Math.max(modelPeak, ++modelActive); sorting.resolve(); await finishSorting.promise;
          modelActive--; return aiAnswer();
        };
        const pending = request("/sync");
        await fetched.promise;
        try {
          assert.equal((await state()).messages.length, 1);
          assert.equal((await state()).messages[0].reason, "May need your attention");
          finishFetch.resolve(); await sorting.promise;
          assert.equal((await state()).messages.length, 18);
          assert.equal((await state()).syncing, true);
        } finally {
          finishFetch.resolve(); finishSorting.resolve(); await pending;
          globalThis.fetch = networkFetch; process.env.TYPESAFE_API_KEY = "";
        }
        assert.equal(modelCalls, 18); assert.equal(modelPeak, 6);
        console.log("synthetic Gmail first sync: 1 visible during fetch, 18 visible during AI, 18 AI calls, peak 6");
        assert.ok((await state()).messages.every((m) => m.reason === "Newsletter"));
        clear();
      });
      await t.test("provider failure keeps cached mail, exposes error, clears flags and allows retry", async () => {
        const a = fixture("failure"); put("account", a.id, a);
        const cached = mail(a); put("mail", cached.id, cached);
        providers.imap.list = async () => { throw new Error("Synthetic provider timeout"); };
        const response = await request("/sync");
        assert.equal(response.status, 200);
        const result = await response.json() as { errors: string[] };
        assert.equal(result.errors.length, 1);
        assert.deepEqual(all("mail"), [cached]);
        assert.equal((await state()).syncing, false);
        assert.ok((await state()).accounts[0].error);
        providers.imap.list = async () => [cached];
        assert.equal((await request("/sync")).status, 200);
        assert.equal((await state()).accounts[0].error, undefined);
        clear();
      });
      await t.test("background connection reports AI failure in account state and retains local mail", async () => {
        let syncCalls = 0;
        providers.imap.list = async (a) => { syncCalls++; return [mail(a)]; };
        const failed = deferred(), release = deferred(), completed = deferred();
        process.env.TYPESAFE_API_KEY = "synthetic-key";
        globalThis.fetch = async () => { failed.resolve(); await release.promise; return new Response("", { status: 503 }); };
        let pending: Promise<void> | undefined;
        try {
          assert.equal((await add("ai-failure@example.com")).status, 200);
          await failed.promise;
          // A second sync can arrive after completion and clear the warning being tested.
          onMailChanged = completed.resolve;
          pending = completed.promise;
          assert.equal((await state()).syncing, true);
          release.resolve();
          await pending;
          const result = await state();
          assert.equal(result.syncing, false);
          assert.equal(syncCalls, 1);
          assert.match(result.accounts[0].error || "", /Jev could not sort mail/);
          assert.equal(result.messages[0].reason, "May need your attention");
        } finally {
          release.resolve(); if (pending) await pending;
          onMailChanged = undefined;
          globalThis.fetch = networkFetch; process.env.TYPESAFE_API_KEY = "";
        }
        clear();
      });
      await t.test("partial fetch failure preserves cached mail and still sorts fetched mail; successful retry reconciles archive and snooze", async () => {
        const a = fixture("partial"); put("account", a.id, a);
        const cached = { ...mail(a, "cached"), snoozedUntil: 1800000000000 };
        const absent = mail(a, "absent");
        put("mail", cached.id, cached); put("mail", absent.id, absent);
        providers.imap.list = async (account, _cached, onBatch) => {
          onBatch?.([mail(account)]); throw new Error("Synthetic later-page failure");
        };
        let modelCalls = 0;
        process.env.TYPESAFE_API_KEY = "synthetic-key";
        globalThis.fetch = async () => { modelCalls++; return aiAnswer(); };
        try { assert.equal((await request("/sync")).status, 200); }
        finally { globalThis.fetch = networkFetch; process.env.TYPESAFE_API_KEY = ""; }
        assert.equal(modelCalls, 1);
        assert.deepEqual(all("mail").find((m) => m.id === cached.id), cached);
        assert.equal(all("mail").find((m) => m.id === absent.id)?.archived, false);
        assert.ok(all("mail").some((m) => m.id === `${a.id}:one`));
        assert.equal(all("mail").find((m) => m.id === `${a.id}:one`)?.reason, "Newsletter");
        providers.imap.list = async () => [{ ...cached, unread: false }, mail(a)];
        await request("/sync");
        const updated = all("mail").find((m) => m.id === cached.id)!;
        assert.equal(updated.unread, false); assert.equal(updated.snoozedUntil, cached.snoozedUntil);
        assert.equal(updated.reason, cached.reason);
        assert.equal(all("mail").find((m) => m.id === absent.id)?.archived, true);
        clear();
      });
      await t.test("late completion cannot recreate a removed account or its mail", async () => {
        const a = fixture("removed"); put("account", a.id, a);
        const entered = deferred(), release = deferred();
        providers.imap.list = async () => { entered.resolve(); await release.promise; return [mail(a)]; };
        const pending = request("/sync"); await entered.promise;
        remove("account", a.id); release.resolve(); await pending;
        assert.deepEqual(all("account"), []); assert.deepEqual(all("mail"), []);
      });
    } finally {
      globalThis.fetch = networkFetch;
      mock.restoreAll();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
}
