import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { google } from "googleapis";
import { ImapFlow } from "imapflow";
import { createServer } from "node:http";
import { providers, SyncError, syncError } from "./providers.js";
import type { StoredAccount } from "./store.js";
import type { Mail } from "../shared/types.js";

const account: StoredAccount = { id: "synthetic", email: "inbox@example.com", provider: "gmail", credentials: {} };
const cachedMail = (id: string): Mail => ({
  id: `${account.id}:${id}`, accountId: account.id, remoteId: id, sender: "Sender", address: "sender@example.com", to: account.email,
  subject: "Saved subject", preview: "Saved body", body: "Saved body", date: 1700000000000, unread: true,
  category: "other", relevance: 1, reason: "Taught sorting", archived: false, snoozedUntil: 1800000000000,
});
const raw = Buffer.from("From: Sender <sender@example.com>\r\nTo: inbox@example.com\r\nSubject: Fresh mail\r\n\r\nSynthetic body");

test("known IMAP timeouts and body-read disconnects remain safe transient failures", () => {
  for (const [input, phase, code] of [
    ["CONNECT_TIMEOUT", "connect", "ETIMEDOUT"],
    ["GREETING_TIMEOUT", "connect", "ETIMEDOUT"],
    ["NoConnection", "read", "CONNECTION_CLOSED"],
    ["EConnectionClosed", "read", "CONNECTION_CLOSED"],
  ] as const) {
    const error = syncError(Object.assign(new Error("Synthetic private transport details"), { code: input }), "imap", phase);
    assert.deepEqual(error.failure, { kind: "transient", phase, code });
    assert.match(error.message, /temporarily unavailable/);
    assert.ok(!error.message.includes("Synthetic private"));
  }
});

test("cached Gmail uses paginated inbox/unread lists without metadata gets, keeps older mail and exposes batches", async () => {
  const cached = new Map(Array.from({ length: 120 }, (_, i) => { const m = cachedMail(String(i)); return [m.id, m]; }));
  let lists = 0, gets = 0;
  const batches: number[] = [];
  const started = performance.now();
  const gmailMock = mock.method(google, "gmail", () => ({ users: { messages: {
    list: async (input: { labelIds: string[]; pageToken?: string }, options: { timeout?: number; retry?: boolean }) => {
      assert.equal(options?.timeout, 30000); assert.equal(options.retry, false); lists++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (input.labelIds.includes("UNREAD")) return { data: { messages: [{ id: "119" }] } };
      const offset = input.pageToken ? 100 : 0;
      return { data: { messages: Array.from({ length: offset ? 20 : 100 }, (_, i) => ({ id: String(offset + i), threadId: `thread-${offset + i}` })), nextPageToken: offset ? undefined : "page2" } };
    },
    get: async () => { gets++; throw new Error("Cached bodies must not be fetched"); },
  } } }), {});
  try {
    const result = await providers.gmail.list(account, cached, (batch) => { batches.push(batch.length); });
    assert.equal(result.length, 120); assert.equal(gets, 0); assert.equal(lists, 3); assert.deepEqual(batches, [100, 20]);
    assert.equal(result.filter((m) => m.unread).length, 1);
    assert.equal(result[119].unread, true); assert.equal(result[0].threadId, "thread-0");
    assert.equal(result[0].body, "Saved body");
    console.log(`synthetic Gmail repeat: 120 cached, ${lists} lists, ${gets} gets, ${batches.length} visible batches, ${Math.round(performance.now() - started)}ms with 10ms/request`);
  } finally { gmailMock.mock.restore(); }
});

test("Gmail token, list and raw read timeouts abort actual transport and do not retry", async (t) => {
  for (const phase of ["token", "list", "raw"] as const) {
    await t.test(phase, async () => {
      let aborted!: () => void;
      const closed = new Promise<void>((resolve) => { aborted = resolve; });
      const server = createServer((req, res) => {
        req.resume();
        res.on("close", () => { if (!res.writableEnded) aborted(); });
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address(); assert.ok(address && typeof address === "object");
      const originalGmail = google.gmail;
      const originalTimeout = AbortSignal.timeout;
      const timeoutMock = mock.method(AbortSignal, "timeout", (ms: number) => {
        assert.equal(ms, 30000); return originalTimeout(40);
      });
      let stalledCalls = 0;
      const gmailMock = mock.method(google, "gmail", (options: Parameters<typeof google.gmail>[0]) => {
        assert.ok(typeof options === "object" && options && typeof options.auth === "object");
        const auth = options.auth as InstanceType<typeof google.auth.OAuth2>;
        assert.equal(auth.transporter.defaults.timeout, 30000);
        assert.equal(auth.transporter.defaults.retryConfig?.retry, 0);
        auth.transporter.defaults.fetchImplementation = async (url, init) => {
          const token = String(url).includes("/token");
          const list = String(url).split("?")[0].endsWith("/messages");
          if ((phase === "token" && token) || (phase === "list" && list) || (phase === "raw" && !token && !list)) {
            stalledCalls++;
            return fetch(`http://127.0.0.1:${address.port}`, init);
          }
          return new Response(JSON.stringify(token
            ? { access_token: "synthetic-access", expires_in: 3600, token_type: "Bearer" }
            : { messages: [{ id: "one" }] }), { headers: { "Content-Type": "application/json" } });
        };
        return originalGmail.call(google, options);
      }, {});
      try {
        await assert.rejects(providers.gmail.list({ ...account, credentials: { refreshToken: "synthetic-refresh" } }, new Map()), (error: unknown) => {
          assert.ok(error instanceof SyncError);
          assert.deepEqual(error.failure, { kind: "transient", phase: phase === "raw" ? "read" : "list", code: "ETIMEDOUT" });
          assert.match(error.message, /temporarily unavailable/);
          return true;
        });
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([closed, new Promise<void>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Transport did not close")), 1000); })]);
        } finally { clearTimeout(timer); }
        assert.equal(stalledCalls, 1);
        console.log(`synthetic Gmail ${phase}: transport closed after abort, 1 attempt`);
      } finally {
        gmailMock.mock.restore(); timeoutMock.mock.restore();
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    });
  }
});

test("fresh Gmail batches appear before the next page, and all in-flight gets settle on failure", async () => {
  let observed = 0, active = 0, peak = 0, settled = 0;
  const visible: { id: string }[][] = [];
  const gmailMock = mock.method(google, "gmail", () => ({ users: { messages: {
    list: async (input: { labelIds: string[]; pageToken?: string }) => {
      if (input.labelIds.includes("UNREAD")) return { data: {} };
      if (input.pageToken) { assert.equal(observed, 10); return { data: { messages: [{ id: "last" }] } }; }
      return { data: { messages: Array.from({ length: 10 }, (_, i) => ({ id: String(i) })), nextPageToken: "next" } };
    },
    get: async (input: { id: string; format: string }, options: { timeout: number; retry: boolean }) => {
      assert.equal(input.format, "raw"); assert.equal(options.timeout, 30000); assert.equal(options.retry, false);
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5)); active--; settled++;
      return { data: { raw: raw.toString("base64url"), labelIds: ["UNREAD"], internalDate: "1700000000000" } };
    },
  } } }), {});
  try {
    const result = await providers.gmail.list(account, new Map(), (batch) => { observed += batch.length; visible.push(batch); });
    assert.equal(result.length, 11); assert.equal(observed, 11); assert.equal(peak, 10); assert.equal(settled, 11);
    assert.deepEqual(visible.map((batch) => batch.length), [10, 1]);
  } finally { gmailMock.mock.restore(); }
  let outstanding = 0;
  const failureMock = mock.method(google, "gmail", () => ({ users: { messages: {
    list: async (input: { labelIds: string[] }) => ({ data: { messages: input.labelIds.includes("UNREAD") ? [] : [{ id: "bad" }, { id: "slow" }] } }),
    get: async (input: { id: string }) => {
      if (input.id === "bad") throw new Error("Synthetic read timeout");
      outstanding++;
      await new Promise((resolve) => setTimeout(resolve, 20)); outstanding--;
      return { data: { raw: raw.toString("base64url") } };
    },
  } } }), {});
  try {
    await assert.rejects(providers.gmail.list(account, new Map()), (error: unknown) => {
      assert.ok(error instanceof SyncError);
      assert.deepEqual(error.failure, { kind: "message", phase: "read", code: "READ_FAILED" });
      assert.ok(!error.message.includes("Synthetic read timeout"));
      return true;
    });
    assert.equal(outstanding, 0, "the scheduler must not release a slot with provider work still running");
  } finally { failureMock.mock.restore(); }
});

test("IMAP refreshes flags without downloading cached bodies and drains metadata before UID body fetch", async () => {
  const calls: { range: string; source?: boolean }[] = [];
  let iterating = false, bytes = 0;
  const mocks = [
    mock.method(ImapFlow.prototype, "connect", async () => {}),
    mock.method(ImapFlow.prototype, "getMailboxLock", async function (this: ImapFlow) {
      this.mailbox = { exists: 3, uidValidity: BigInt(42) } as NonNullable<ImapFlow["mailbox"]>;
      return { release() {} };
    }),
    mock.method(ImapFlow.prototype, "close", () => {}),
    mock.method(ImapFlow.prototype, "fetch", async function* (range: string, query: { source?: boolean }, options?: { uid?: boolean }) {
      assert.equal(iterating, false, "no IMAP command inside another fetch iterator");
      calls.push({ range, source: query.source }); iterating = true;
      if (query.source) assert.equal(options?.uid, true);
      const uids = query.source ? range.split(",").map(Number) : [1, 2, 3];
      try {
        for (const uid of uids) {
          if (query.source) bytes += raw.length;
          yield { uid, flags: new Set(uid === 2 ? ["\\Seen"] : []), source: query.source ? raw : undefined };
        }
      } finally { iterating = false; }
    }),
  ];
  try {
    const cached = new Map([1, 2].map((uid) => { const m = cachedMail(`42:${uid}`); return [m.id, m]; }));
    let batches = 0;
    const result = await providers.imap.list(account, cached, () => { batches++; });
    assert.equal(result.length, 3); assert.equal(bytes, raw.length); assert.ok(batches >= 2);
    assert.deepEqual(calls, [{ range: "1:*", source: undefined }, { range: "3", source: true }]);
    assert.equal(result.find((m) => m.remoteId === "42:2")?.unread, false);
    assert.equal(result.find((m) => m.remoteId === "42:1")?.body, "Saved body");
    calls.length = 0; bytes = 0;
    const completeCache = new Map(result.map((m) => [m.id, { ...cachedMail(m.remoteId), ...m }]));
    await providers.imap.list(account, completeCache);
    assert.equal(bytes, 0); assert.equal(calls.length, 1);
    console.log("synthetic IMAP repeat: 3 cached bodies, 0 body bytes, 1 flag fetch");
  } finally { mocks.forEach((m) => m.mock.restore()); }
});
