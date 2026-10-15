import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { google } from "googleapis";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import type { State } from "../shared/types.js";
import type { StoredAccount } from "./store.js";
import { quietImapWatch, quietGmailRevision } from "./imap-watch-fixture.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

test("account names stay local and survive reconnect, sync and restart", { timeout: 60000 }, async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "emc2-account-name-"));
  process.env.MAIL_DATA_DIR = directory;
  process.env.MAIL_CONFIG_PATH = path.join(directory, "absent.env");
  process.env.MAIL_DATA_KEY = Buffer.alloc(32, 11).toString("base64");
  process.env.MAIL_DESKTOP_TOKEN = "synthetic-desktop-token";
  process.env.GOOGLE_CLIENT_ID = "synthetic-client";
  process.env.GOOGLE_CLIENT_SECRET = "synthetic-secret";
  process.env.TYPESAFE_API_KEY = "";
  process.env.OPENAI_API_KEY = "";
  const { all, put, remove, account, closeStore } = await import("./store.js");
  const { providers } = await import("./providers.js");
  const { startServer, syncMail } = await import("./index.js");
  let validationGate = Promise.resolve();
  let validationStarted = () => {};
  let tokenGate = Promise.resolve();
  let tokenStarted = () => {};
  let refreshToken: string | undefined = "synthetic-new-refresh";
  let syncGate = Promise.resolve();
  let syncStarted = () => {};
  let syncFails = false;
  let providerCalls = 0;
  const connectMock = t.mock.method(ImapFlow.prototype, "connect", async () => {
    validationStarted();
    await validationGate;
  });
  t.mock.method(ImapFlow.prototype, "mailboxOpen", async () => ({}));
  t.mock.method(ImapFlow.prototype, "close", () => {});
  const smtpMock = t.mock.method(nodemailer, "createTransport", () => ({ verify: async () => true }));
  const tokenMock = t.mock.method(google.auth.OAuth2.prototype, "getToken", async () => {
    tokenStarted();
    await tokenGate;
    return { tokens: { refresh_token: refreshToken } };
  });
  const googleMock = t.mock.method(google, "gmail", () => ({ users: {
    getProfile: async () => ({ data: { emailAddress: "google@example.com" } }),
    labels: { list: async () => ({ data: { labels: [] } }) },
  } }), {});
  for (const provider of Object.values(providers)) t.mock.method(provider, "list", async () => {
    providerCalls++;
    syncStarted();
    await syncGate;
    if (syncFails) throw new Error("synthetic sync failure");
    return [];
  });
  const fixture = (id: string, provider: StoredAccount["provider"]): StoredAccount => ({
    id, email: provider === "gmail" ? "google@example.com" : "imap@example.com", provider,
    name: "Original", hasSynced: false, error: "Previous failure",
    credentials: provider === "gmail" ? { refreshToken: "synthetic-refresh" } : {
      password: "synthetic-password", imapHost: "imap.example.com", smtpHost: "smtp.example.com",
      imapPort: 993, smtpPort: 465, username: "synthetic-user",
    },
  });
  const server = await startServer(0, undefined, undefined, undefined, quietImapWatch, quietGmailRevision);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const desktop = { "X-Desktop-Token": "synthetic-desktop-token", "Content-Type": "application/json" };
  const state = async () => (await (await fetch(`${base}/api/state`, { headers: desktop })).json()) as State & { csrf: string };
  const headers = { ...desktop, "X-CSRF-Token": (await state()).csrf };
  const rename = (id: string, body: unknown, h: HeadersInit = headers) => fetch(`${base}/api/accounts/${id}`, {
    method: "PATCH", headers: h, body: JSON.stringify(body),
  });
  const connection = () => fetch(`${base}/api/accounts/imap`, {
    method: "POST", headers, body: JSON.stringify({ provider: "imap", email: "imap@example.com",
      password: "synthetic-replacement", imapHost: "imap.example.com", smtpHost: "smtp.example.com", username: "synthetic-user" }),
  });
  const oauthCallback = async () => {
    const initial = await fetch(`${base}/api/oauth/google`, { redirect: "manual" });
    const location = new URL(initial.headers.get("location")!);
    const cookie = initial.headers.get("set-cookie")!.split(";")[0];
    return fetch(`${base}/api/oauth/google/callback?code=synthetic&state=${location.searchParams.get("state")}`, {
      headers: { Cookie: cookie }, redirect: "manual",
    });
  };
  t.beforeEach(() => {
    for (const a of all("account")) remove("account", a.id);
    put("account", "imap", fixture("imap", "imap"));
    put("account", "google", fixture("google", "gmail"));
  });
  try {
    await t.test("trim, save, clear and maximum length preserve all other fields without provider work", async () => {
      const before = account("imap");
      const counts = [providerCalls, connectMock.mock.callCount(), smtpMock.mock.callCount(), tokenMock.mock.callCount(), googleMock.mock.callCount()];
      const response = await rename("imap", { name: "  Work 東京  " });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
      assert.deepEqual(account("imap"), { ...before, name: "Work 東京" });
      const visible = (await state()).accounts.find((a) => a.id === "imap")!;
      assert.equal(visible.name, "Work 東京");
      assert.equal("credentials" in visible, false);
      assert.equal((await rename("imap", { name: ` ${"a".repeat(80)} ` })).status, 200);
      assert.equal(account("imap").name?.length, 80);
      for (const name of ["", "   "]) {
        assert.equal((await rename("imap", { name })).status, 200);
        const { name: _name, ...expected } = before;
        assert.deepEqual(account("imap"), expected);
      }
      assert.deepEqual([providerCalls, connectMock.mock.callCount(), smtpMock.mock.callCount(), tokenMock.mock.callCount(), googleMock.mock.callCount()], counts);
      assert.equal(account("google").name, "Original");
    });

    await t.test("invalid input, unknown accounts and authentication/CSRF boundaries never write", async () => {
      const before = all("account");
      for (const body of [null, [], "name", {}, { name: null }, { name: 12 }, { name: true }, { name: [] },
        { name: "a".repeat(81) }, { name: "\nWork" }, { name: "Work\t" }, { name: "A\u0000B" },
        { name: "A\u007fB" }, { name: "A\u0085B" }, { name: "A\u202eB" }, { name: "A\u2028B" },
        { name: "Work", email: "other@example.com" }, { name: "Work", credentials: {} }, { name: "Work", id: "google" }]) {
        assert.equal((await rename("imap", body)).status, 400, JSON.stringify(body));
      }
      assert.equal((await fetch(`${base}/api/accounts/imap`, { method: "PATCH", headers, body: "{" })).status, 400);
      assert.equal((await rename("missing", { name: "Work" })).status, 404);
      assert.equal((await rename("imap", { name: "Work" }, { "Content-Type": "application/json", "X-CSRF-Token": headers["X-CSRF-Token"] })).status, 403);
      assert.equal((await rename("imap", { name: "Work" }, desktop)).status, 403);
      assert.equal((await rename("imap", { name: "Work" }, { ...headers, Origin: "https://untrusted.example" })).status, 403);
      // Node fetch replaces Host, so use a raw request to exercise the host guard.
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const request = httpRequest(`${base}/api/accounts/imap`, { method: "PATCH", headers: { ...headers, Host: "untrusted.example" } }, (response) => {
          response.resume();
          response.once("end", () => resolve(response.statusCode));
        });
        request.once("error", reject);
        request.end(JSON.stringify({ name: "Work" }));
      });
      assert.equal(status, 403);
      assert.deepEqual(all("account"), before);
    });

    for (const fails of [false, true]) await t.test(`rename and clear during ${fails ? "failed" : "successful"} sync survive status writes`, async () => {
      const entered = deferred(), release = deferred();
      syncGate = release.promise;
      syncStarted = entered.resolve;
      syncFails = fails;
      const before = all("account");
      const syncing = syncMail();
      try {
        await entered.promise;
        assert.equal((await rename("imap", { name: "During sync" })).status, 200);
        assert.equal((await rename("google", { name: "" })).status, 200);
      } finally {
        release.resolve();
        await syncing;
        syncGate = Promise.resolve();
        syncFails = false;
      }
      assert.equal(account("imap").name, "During sync");
      assert.equal(account("google").name, undefined);
      for (const a of before) {
        const current = account(a.id);
        assert.deepEqual(current.credentials, a.credentials);
        assert.equal(current.email, a.email);
        assert.equal(current.provider, a.provider);
        assert.equal(current.hasSynced, !fails);
        assert.equal(!!current.error, fails);
      }
    });

    await t.test("IMAP reconnect finishing after rename uses the latest name and retains identity and sync history", async () => {
      const entered = deferred(), release = deferred(), syncEntered = deferred(), syncRelease = deferred();
      validationGate = release.promise;
      validationStarted = entered.resolve;
      syncGate = syncRelease.promise;
      syncStarted = syncEntered.resolve;
      const before = account("imap");
      const reconnecting = connection();
      try {
        await entered.promise;
        assert.equal((await rename("imap", { name: "Latest IMAP" })).status, 200);
        release.resolve();
        assert.equal((await reconnecting).status, 200);
        await syncEntered.promise;
        const current = account("imap");
        assert.equal(current.name, "Latest IMAP");
        assert.equal(current.id, before.id);
        assert.equal(current.email, before.email);
        assert.equal(current.provider, before.provider);
        assert.equal(current.hasSynced, before.hasSynced);
        assert.equal(current.credentials.password, "synthetic-replacement");
        assert.equal(current.credentials.username, before.credentials.username);
      } finally {
        release.resolve();
        syncRelease.resolve();
        await reconnecting;
        await syncMail();
        validationGate = syncGate = Promise.resolve();
      }
      assert.equal(account("imap").name, "Latest IMAP");
    });

    for (const token of ["synthetic-new-refresh", undefined]) await t.test(`OAuth reconnect preserves a concurrent ${token ? "rename" : "clear"} and ${token ? "replaces" : "retains"} refresh credentials`, async () => {
      const entered = deferred(), release = deferred(), syncEntered = deferred(), syncRelease = deferred();
      tokenGate = release.promise;
      tokenStarted = entered.resolve;
      refreshToken = token;
      syncGate = syncRelease.promise;
      syncStarted = syncEntered.resolve;
      const before = account("google");
      const reconnecting = oauthCallback();
      const name = token ? "Latest Google" : "";
      try {
        await entered.promise;
        assert.equal((await rename("google", { name })).status, 200);
        release.resolve();
        assert.equal((await reconnecting).status, 200);
        await syncEntered.promise;
        const current = account("google");
        assert.equal(current.name, name || undefined);
        assert.equal(current.id, before.id);
        assert.equal(current.email, before.email);
        assert.equal(current.provider, before.provider);
        assert.equal(current.hasSynced, before.hasSynced);
        assert.equal(current.credentials.refreshToken, token || before.credentials.refreshToken);
      } finally {
        release.resolve();
        syncRelease.resolve();
        await reconnecting;
        await syncMail();
        tokenGate = syncGate = Promise.resolve();
      }
      assert.equal(account("google").name, name || undefined);
    });

    await t.test("a fresh service process reads the name from the encrypted store without exposing credentials", async () => {
      assert.equal((await rename("imap", { name: "Persisted" })).status, 200);
      assert.equal((await rename("google", { name: "" })).status, 200);
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
        import assert from 'node:assert/strict';
        import { startServer } from './server/index.ts';
        import { closeStore } from './server/store.ts';
        import { quietImapWatch, quietGmailRevision } from './server/imap-watch-fixture.ts';
        const server = await startServer(0, undefined, undefined, undefined, quietImapWatch, quietGmailRevision);
        try {
          const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/state', { headers: { 'X-Desktop-Token': 'synthetic-desktop-token' } });
          assert.equal(response.status, 200);
          const { accounts } = await response.json();
          assert.equal(accounts.find(a => a.id === 'imap').name, 'Persisted');
          assert.equal('name' in accounts.find(a => a.id === 'google'), false);
          assert.ok(accounts.every(a => !('credentials' in a)));
          console.log('restart readback passed');
        } finally {
          await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
          closeStore();
        }
      `], { env, encoding: "utf8", timeout: 30000 });
      assert.ifError(result.error);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /restart readback passed/);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    closeStore();
    rmSync(directory, { recursive: true, force: true });
  }
});
