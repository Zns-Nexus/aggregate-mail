import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ImapFlow, type ImapFlowOptions } from "imapflow";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import type { Mail } from "../shared/types.js";

test("account onboarding keeps transport identities and Gmail mailbox semantics", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "emc2-onboarding-"));
  process.env.MAIL_DATA_DIR = directory;
  process.env.MAIL_CONFIG_PATH = path.join(directory, "settings.env");
  process.env.MAIL_DATA_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.MAIL_DESKTOP_TOKEN = "synthetic-desktop-token";
  process.env.GOOGLE_CLIENT_ID = "synthetic-client";
  process.env.GOOGLE_CLIENT_SECRET = "synthetic-secret";
  const connections: ImapFlow[] = [];
  const transports: object[] = [];
  let validationFailure = false;
  let folders = [{ path: "[Gmail]/All Mail", specialUse: "\\All" }];
  const moves: unknown[][] = [];
  const appends: unknown[][] = [];
  const created: string[] = [];
  let sends = 0;
  t.mock.method(ImapFlow.prototype, "connect", async function (this: ImapFlow) {
    connections.push(this);
    this.usable = true;
    if (validationFailure) throw new Error("synthetic authentication failure");
  });
  t.mock.method(ImapFlow.prototype, "mailboxOpen", async () => ({}));
  t.mock.method(ImapFlow.prototype, "logout", async () => true);
  t.mock.method(ImapFlow.prototype, "getMailboxLock", async function (this: ImapFlow) {
    this.mailbox = { uidValidity: 7n, exists: 0 } as typeof this.mailbox;
    return { release() {} };
  });
  t.mock.method(ImapFlow.prototype, "list", async () => folders);
  t.mock.method(ImapFlow.prototype, "messageMove", async (...args: unknown[]) => {
    moves.push(args);
    return true;
  });
  t.mock.method(ImapFlow.prototype, "mailboxCreate", async (folder: string) => created.push(folder));
  t.mock.method(ImapFlow.prototype, "append", async (...args: unknown[]) => appends.push(args));
  t.mock.method(nodemailer, "createTransport", (options: object) => {
    transports.push(options);
    return { verify: async () => true, sendMail: async () => { sends++; } };
  });
  t.mock.method(google.auth.OAuth2.prototype, "getToken", async () => ({ tokens: { refresh_token: "synthetic-refresh" } }));
  let googleEmail = "user@workspace.example";
  t.mock.method(google, "gmail", () => ({ users: { getProfile: async () => ({ data: { emailAddress: googleEmail } }) } }), {});
  const { startServer } = await import("./index.js");
  const { all, put, closeStore } = await import("./store.js");
  const { providers } = await import("./providers.js");
  const server = await startServer(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { "X-Desktop-Token": "synthetic-desktop-token", "Content-Type": "application/json" };
    const state = await (await fetch(`${base}/api/state`, { headers })).json() as { csrf: string };
    const mutationHeaders = { ...headers, "X-CSRF-Token": state.csrf };
    const connect = (input: object, h: HeadersInit = mutationHeaders) => fetch(`${base}/api/accounts/imap`, {
      method: "POST", headers: h, body: JSON.stringify(input),
    });
    const gmailInput = { provider: "gmail-imap", email: googleEmail, password: "abcd efgh ijkl mnop" };

    await t.test("Gmail and Workspace use fixed TLS hosts and normalize only Google grouping spaces", async () => {
      const result = await connect(gmailInput);
      assert.equal(result.status, 200, await result.text());
      const stored = all("account")[0];
      assert.equal(stored.provider, "gmail-imap");
      assert.equal(stored.credentials.password, "abcdefghijklmnop");
      assert.equal(stored.credentials.imapHost, "imap.gmail.com");
      assert.equal(stored.credentials.imapPort, 993);
      assert.equal(stored.credentials.smtpHost, "smtp.gmail.com");
      assert.equal(stored.credentials.smtpPort, 465);
      const options = (connections[0] as ImapFlow & { options: ImapFlowOptions }).options;
      assert.equal(options.logger, false);
      assert.equal(options.secure, true);
      assert.equal((transports[0] as { logger: boolean }).logger, false);
      const publicState = await (await fetch(`${base}/api/state`, { headers })).json() as { accounts: object[] };
      assert.ok(!("credentials" in publicState.accounts[0]));
    });
    await t.test("rejects malformed Google app passwords before any connection and keeps API guards", async () => {
      const count = connections.length;
      const rejected = await connect({ ...gmailInput, password: "ordinary-password" });
      assert.equal(rejected.status, 400);
      assert.match(await rejected.text(), /16.*app password/i);
      assert.equal(connections.length, count);
      assert.equal((await connect(gmailInput, headers as typeof mutationHeaders)).status, 403);
      assert.equal((await connect(gmailInput, { ...mutationHeaders, Origin: "https://example.invalid" })).status, 403);
    });
    await t.test("same transport reconnect preserves account and cached mail identities", async () => {
      const before = all("account")[0];
      const mail = { id: `${before.id}:7:1`, accountId: before.id, remoteId: "7:1", archived: false } as Mail;
      put("mail", mail.id, mail);
      assert.equal((await connect({ ...gmailInput, email: "USER@workspace.example" })).status, 200);
      assert.equal(all("account").length, 1);
      assert.equal(all("account")[0].id, before.id);
      assert.equal(all("mail")[0].id, mail.id);
    });
    await t.test("OAuth cannot replace or duplicate an IMAP identity", async () => {
      const initial = await fetch(`${base}/api/oauth/google`, { redirect: "manual" });
      const location = new URL(initial.headers.get("location")!);
      const cookie = initial.headers.get("set-cookie")!.split(";")[0];
      const response = await fetch(`${base}/api/oauth/google/callback?code=synthetic&state=${location.searchParams.get("state")}`, {
        headers: { Cookie: cookie }, redirect: "manual",
      });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /already connected|disconnect/i);
      assert.equal(all("account").length, 1);
      assert.equal(all("account")[0].provider, "gmail-imap");
    });
    await t.test("IMAP cannot duplicate an OAuth account, including case differences", async () => {
      googleEmail = "oauth@example.com";
      put("account", "oauth", { id: "oauth", email: googleEmail, provider: "gmail", credentials: { refreshToken: "synthetic-refresh" } });
      const count = connections.length;
      const response = await connect({ ...gmailInput, email: "OAUTH@example.com" });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /already connected|disconnect/i);
      assert.equal(connections.length, count);
      assert.equal(all("account").find((a) => a.id === "oauth")?.provider, "gmail");
    });
    await t.test("generic IMAP preserves password bytes and a failed check cannot replace credentials", async () => {
      const input = { provider: "imap", email: "custom@example.com", password: "  synthetic password  ", imapHost: "imap.example.com", smtpHost: "smtp.example.com" };
      assert.equal((await connect(input)).status, 200);
      const before = all("account").find((a) => a.email === input.email)!;
      assert.equal(before.credentials.password, input.password);
      validationFailure = true;
      assert.equal((await connect({ ...input, password: "replacement" })).status, 400);
      validationFailure = false;
      assert.deepEqual(all("account").find((a) => a.id === before.id), before);
    });
    await t.test("Gmail Done moves to special-use All Mail and fails closed when unavailable", async () => {
      const stored = all("account").find((a) => a.provider === "gmail-imap")!;
      const mail = all("mail")[0];
      await providers[stored.provider].update(stored, mail, "archive");
      assert.deepEqual(moves, [["1", "[Gmail]/All Mail", { uid: true }]]);
      assert.deepEqual(created, []);
      folders = [];
      await assert.rejects(providers[stored.provider].update(stored, mail, "archive"), /All Mail|archive/i);
      assert.equal(moves.length, 1);
      assert.deepEqual(created, []);
    });
    await t.test("Gmail SMTP does not append a second Sent copy; other IMAP still saves one", async () => {
      const stored = all("account").find((a) => a.provider === "gmail-imap")!;
      const count = connections.length;
      const input = { accountId: stored.id, to: "recipient@example.com", subject: "Synthetic", body: "Synthetic test mail" };
      await providers[stored.provider].send(stored, input);
      assert.equal(sends, 1);
      assert.equal(connections.length, count);
      assert.deepEqual(appends, []);
      const custom = all("account").find((a) => a.provider === "imap")!;
      await providers.imap.send(custom, input);
      assert.equal(sends, 2);
      assert.equal(appends.length, 1);
      assert.equal(appends[0][0], "Sent");
    });
    await t.test("connected Gmail sync uses the IMAP provider", async () => {
      t.mock.method(providers.gmail, "list", async () => []);
      const response = await fetch(`${base}/api/sync`, { method: "POST", headers: mutationHeaders });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { errors: [] });
      assert.equal(all("account").find((a) => a.provider === "gmail-imap")?.error, undefined);
    });
    await t.test("preset Gmail account cannot substitute another IMAP username or servers", async () => {
      const input = { ...gmailInput, email: "preset@example.com", username: "other@example.com", imapHost: "imap.example.com", smtpHost: "smtp.example.com" };
      const response = await connect(input);
      assert.equal(response.status, 200);
      const stored = all("account").find((a) => a.email === input.email)!;
      assert.equal(stored.credentials.username || stored.email, input.email);
      assert.equal(stored.credentials.imapHost, "imap.gmail.com");
      assert.equal(stored.credentials.smtpHost, "smtp.gmail.com");
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    closeStore();
    rmSync(directory, { recursive: true, force: true });
  }
});
