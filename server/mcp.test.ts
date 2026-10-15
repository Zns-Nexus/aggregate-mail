import { quietGmailRevision } from "./imap-watch-fixture.js";
import { request as httpRequest } from "node:http";
import type { StoredAccount } from "./store.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Mail, McpSettings } from "../shared/types.js";
import type { SendInput } from "./providers.js";

test("MCP HTTP authentication, tools and shared mail operations", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "aggregate-mcp-"));
  process.env.MAIL_DATA_DIR = directory;
  process.env.MAIL_CONFIG_PATH = path.join(directory, "settings.env");
  process.env.MAIL_DESKTOP_TOKEN = "test-desktop-token";
  process.env.MAIL_DATA_KEY = Buffer.alloc(32, 7).toString("base64");
  const { startServer } = await import("./index.js");
  const { all, put } = await import("./store.js");
  const { providers, SentCopyError } = await import("./providers.js");
  const { mcpSettings } = await import("./mcp.js");
  const sent: SendInput[] = [];
  const updates: string[] = [];
  t.mock.method(
    providers.gmail,
    "send",
    async (_account: StoredAccount, input: SendInput) => {
      sent.push(input);
    },
  );
  t.mock.method(
    providers.gmail,
    "update",
    async (_account: StoredAccount, _mail: Mail, action: string) => {
      updates.push(action);
    },
  );
  put("account", "a", {
    id: "a",
    email: "me@example.com",
    provider: "gmail",
    credentials: { refreshToken: "secret-not-for-clients" },
  });
  const mail: Mail = {
    id: "a:1",
    accountId: "a",
    remoteId: "1",
    sender: "Alice",
    address: "alice@example.com",
    to: '"Me" <me@example.com>, Bob <bob@example.com>',
    cc: "Carol <carol@example.com>",
    replyTo: "reply@example.com",
    subject: "Meeting",
    preview: "Discuss the plan",
    body: "Full plain-text body about the plan",
    date: 1700000000000,
    unread: true,
    category: "important",
    relevance: 3,
    reason: "Team",
    archived: false,
    snoozedUntil: null,
    messageId: "<message@example.com>",
    threadId: "thread",
    references: ["<parent@example.com>"],
  };
  put("mail", mail.id, mail);
  put("mail", "a:0", {
    ...mail,
    id: "a:0",
    date: mail.date - 1000,
    unread: false,
  });
  put("mail", "a:archive", {
    ...mail,
    id: "a:archive",
    archived: true,
    threadId: "different",
  });
  put("mail", "a:snooze", {
    ...mail,
    id: "a:snooze",
    snoozedUntil: Date.now() + 60000,
    threadId: "different",
  });
  let changes = 0;
  const server = await startServer(0, undefined, () => changes++, undefined, undefined, quietGmailRevision);
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const desktopHeaders = {
      "X-Desktop-Token": "test-desktop-token",
      "Content-Type": "application/json",
    };
    const state = (await (
      await fetch(`${base}/api/state`, { headers: desktopHeaders })
    ).json()) as { csrf: string };
    const settingsHeaders = { ...desktopHeaders, "X-CSRF-Token": state.csrf };
    const configure = async (input: object) => {
      const response = await fetch(`${base}/api/mcp`, {
        method: "PATCH",
        headers: settingsHeaders,
        body: JSON.stringify(input),
      });
      assert.equal(response.status, 200);
      return (await response.json()) as McpSettings;
    };
    let settings = mcpSettings();
    const request = (message: object, headers: Record<string, string> = {}) =>
      fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${settings.token}`,
          ...headers,
        },
        body: JSON.stringify(message),
      });
    const rpc = async (method: string, params: object = {}) => {
      const response = await request({ jsonrpc: "2.0", id: 1, method, params });
      assert.equal(response.status, 200);
      return (await response.json()) as {
        result: {
          content: { text: string }[];
          isError?: boolean;
          tools?: { name: string; inputSchema: object; annotations?: object }[];
          protocolVersion?: string;
        };
      };
    };
    const call = async (name: string, args: object = {}) =>
      (await rpc("tools/call", { name, arguments: args })).result;
    const decode = (result: { content: { text: string }[] }): unknown =>
      JSON.parse(result.content[0].text);

    await t.test(
      "off by default and settings require desktop token and CSRF",
      async () => {
        assert.deepEqual(settings, {
          enabled: false,
          allowSending: false,
          token: null,
        });
        assert.equal((await request({})).status, 404);
        assert.equal((await fetch(`${base}/api/mcp`)).status, 403);
        assert.equal(
          (
            await fetch(`${base}/api/mcp`, {
              method: "PATCH",
              headers: desktopHeaders,
              body: '{"enabled":true}',
            })
          ).status,
          403,
        );
        settings = await configure({ enabled: true });
        assert.match(settings.token!, /^[a-f0-9]{64}$/);
        assert.equal(settings.allowSending, false);
        assert.ok(
          !readFileSync(path.join(directory, "mail.sqlite")).includes(
            Buffer.from(settings.token!),
          ),
        );
      },
    );
    await t.test(
      "bearer token required; browser origins and foreign hosts rejected",
      async () => {
        assert.equal((await request({}, { Authorization: "" })).status, 401);
        assert.equal(
          (await request({}, { Authorization: "Bearer wrong" })).status,
          401,
        );
        assert.equal(
          (await request({}, { Origin: "https://attacker.example" })).status,
          403,
        );
        assert.equal(
          (await request({}, { Origin: "http://127.0.0.1:32145" })).status,
          403,
        );
        const hostStatus = await new Promise<number | undefined>(
          (resolve, reject) => {
            const req = httpRequest(
              `${base}/mcp`,
              {
                method: "POST",
                headers: {
                  Host: "attacker.example",
                  Authorization: `Bearer ${settings.token}`,
                },
              },
              (res) => {
                res.resume();
                resolve(res.statusCode);
              },
            );
            req.on("error", reject);
            req.end();
          },
        );
        assert.equal(hostStatus, 403);
        const malformed = await fetch(`${base}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        });
        assert.equal(malformed.status, 401);
        const initialized = await rpc("initialize", {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        });
        assert.equal(initialized.result.protocolVersion, "2025-03-26");
        assert.equal(
          (
            await request(
              { jsonrpc: "2.0", id: 1, method: "tools/list" },
              { Origin: "null" },
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await fetch(`${base}/mcp`, {
              headers: { Authorization: `Bearer ${settings.token}` },
            })
          ).status,
          405,
        );
      },
    );
    await t.test(
      "registered tools, account redaction, summaries, filters, pagination and search",
      async () => {
        const tools = (await rpc("tools/list")).result.tools!;
        assert.deepEqual(
          tools.map((v) => v.name).sort(),
          [
            "list_accounts",
            "list_emails",
            "search_emails",
            "read_email",
            "get_thread",
            "reply_to_email",
            "archive_email",
            "mark_read",
          ].sort(),
        );
        assert.deepEqual(
          tools.find((v) => v.name === "reply_to_email")!.annotations,
          { destructiveHint: false, openWorldHint: true },
        );
        assert.deepEqual(decode(await call("list_accounts")), [
          { id: "a", email: "me@example.com", provider: "gmail" },
        ]);
        const listed = decode(
          await call("list_emails", {
            category: "important",
            unreadOnly: true,
            accountId: "a",
          }),
        );
        assert.deepEqual(listed, {
          emails: [
            {
              id: mail.id,
              from: { name: "Alice", address: mail.address },
              to: mail.to,
              subject: mail.subject,
              preview: mail.preview,
              date: new Date(mail.date).toISOString(),
              unread: true,
              category: "important",
              relevance: 3,
              accountId: "a",
            },
          ],
          nextOffset: null,
        });
        assert.ok(
          !(await call("list_emails")).content[0].text.includes(
            "secret-not-for-clients",
          ),
        );
        const paged = decode(await call("list_emails", { limit: 1 })) as {
          nextOffset: number;
        };
        assert.equal(paged.nextOffset, 1);
        for (const category of ["archive", "snoozed"]) {
          const value = decode(await call("list_emails", { category })) as {
            emails: { category: string }[];
          };
          assert.equal(value.emails.length, 1);
          assert.equal(value.emails[0].category, category);
        }
        const search = decode(
          await call("search_emails", {
            query: "PLAIN-TEXT",
            category: "important",
          }),
        ) as { emails: unknown[] };
        assert.equal(search.emails.length, 2);
        assert.equal((await call("list_emails", { limit: 101 })).isError, true);
      },
    );
    await t.test(
      "read defaults to no mutation; markRead and archive share provider updates and notify UI",
      async () => {
        const read = decode(await call("read_email", { id: mail.id })) as {
          body: string;
          messageId: string;
          unread: boolean;
        };
        assert.equal(read.body, mail.body);
        assert.equal(read.messageId, mail.messageId);
        assert.equal(read.unread, true);
        assert.deepEqual(updates, []);
        await call("read_email", { id: mail.id, markRead: true });
        assert.deepEqual(updates, ["read"]);
        assert.equal(all("mail").find((m) => m.id === mail.id)!.unread, false);
        await call("archive_email", { id: mail.id });
        assert.deepEqual(updates, ["read", "archive"]);
        assert.equal(all("mail").find((m) => m.id === mail.id)!.archived, true);
        assert.equal(changes, 2);
        const thread = decode(await call("get_thread", { id: mail.id })) as {
          emails: { id: string }[];
        };
        assert.deepEqual(
          thread.emails.map((m) => m.id),
          ["a:0", mail.id],
        );
      },
    );
    await t.test(
      "reply blocked by default, then shared send receives threading and reply-all fields",
      async () => {
        const blocked = await call("reply_to_email", {
          id: mail.id,
          body: "Thanks",
        });
        assert.equal(blocked.isError, true);
        assert.match(blocked.content[0].text, /Sending replies is disabled/);
        assert.equal(sent.length, 0);
        settings = await configure({ allowSending: true });
        assert.deepEqual(
          decode(
            await call("reply_to_email", {
              id: mail.id,
              body: "Thanks",
              replyAll: true,
              cc: ["extra@example.com", "bob@example.com", "ME@example.com"],
            }),
          ),
          { ok: true },
        );
        assert.deepEqual(sent[0], {
          accountId: "a",
          to: "reply@example.com",
          cc: ["extra@example.com", "bob@example.com", "carol@example.com"],
          subject: "Re: Meeting",
          body: "Thanks",
          inReplyTo: mail.messageId,
          threadId: "thread",
          references: ["<parent@example.com>", mail.messageId],
        });
        put("mail", mail.id, { ...mail, subject: "Re: Meeting" });
        await call("reply_to_email", { id: mail.id, body: "Again" });
        assert.equal(sent[1].subject, "Re: Meeting");
        assert.deepEqual(sent[1].cc, []);
        assert.equal(changes, 4);
        const fromUi = await fetch(`${base}/api/send`, {
          method: "POST",
          headers: settingsHeaders,
          body: JSON.stringify(sent[0]),
        });
        assert.equal(fromUi.status, 200);
        assert.deepEqual(sent[2], sent[0]);
      },
    );
    await t.test(
      "Sent-copy warning is success; token rotation and disable revoke access",
      async () => {
        t.mock.method(providers.gmail, "send", async () => {
          throw new SentCopyError(
            "Email was sent, but saving a Sent copy failed. Do not resend.",
          );
        });
        const result = await call("reply_to_email", {
          id: mail.id,
          body: "Thanks",
        });
        assert.ok(!result.isError);
        assert.match(result.content[0].text, /Do not resend/);
        const previous = settings.token;
        settings = await configure({ regenerateToken: true });
        assert.notEqual(settings.token, previous);
        assert.equal(mcpSettings().token, settings.token);
        assert.equal(
          (await request({}, { Authorization: `Bearer ${previous}` })).status,
          401,
        );
        settings = await configure({ enabled: false });
        assert.equal((await request({})).status, 404);
        const retained = settings.token;
        settings = await configure({ enabled: true, allowSending: false });
        assert.equal(settings.token, retained);
        assert.equal(
          (await call("reply_to_email", { id: mail.id, body: "Blocked again" }))
            .isError,
          true,
        );
      },
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
