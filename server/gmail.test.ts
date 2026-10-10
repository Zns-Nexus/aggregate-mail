import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { google, type gmail_v1 } from "googleapis";
import type { Mail } from "../shared/types.js";

test("Gmail labels and ordered read-on-open requests use synthetic provider data", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "emc2-gmail-"));
  process.env.MAIL_DATA_DIR = directory;
  process.env.MAIL_CONFIG_PATH = path.join(directory, "settings.env");
  process.env.MAIL_DESKTOP_TOKEN = "test-desktop-token";
  process.env.MAIL_DATA_KEY = Buffer.alloc(32, 8).toString("base64");
  const { all, put } = await import("./store.js");
  const { startServer } = await import("./index.js");
  const { listGmailLabels } = await import("./providers.js");
  const api = google.gmail("v1");
  t.mock.method(google, "gmail", () => api, {});
  const account = { id: "a", email: "me@example.com", provider: "gmail" as const, credentials: { refreshToken: "synthetic-token" } };
  put("account", account.id, account);
  put("label", "a:old", { id: "old", accountId: "a", name: "Removed", type: "user" });
  put("label", "b:Label_1", { id: "Label_1", accountId: "b", name: "Other account", type: "user" });
  put("label", "b:Foreign", { id: "Foreign", accountId: "b", name: "Foreign", type: "user" });
  const mail: Mail = {
    id: "a:cached", accountId: "a", remoteId: "cached", sender: "Alice",
    address: "alice@example.com", to: "me@example.com", subject: "Meeting",
    body: "Discuss the plan", preview: "Discuss the plan", date: 1700000000000,
    unread: true, archived: false, category: "important", relevance: 2,
    reason: "Team", snoozedUntil: null,
  };
  put("mail", mail.id, mail);
  put("mail", "a:vanished", { ...mail, id: "a:vanished", remoteId: "vanished", labelIds: ["INBOX", "Label_1"] });
  const remote = new Map<string, string[]>([
    ["cached", ["INBOX", "UNREAD", "Label_1"]],
    ["fresh", ["INBOX", "Label_2"]],
    ["archived", ["UNREAD", "Label_1"]],
  ]);
  let catalogFails = false;
  t.mock.method(api.users.labels, "list", async () => {
    if (catalogFails) throw new Error("offline");
    return { data: { labels: [
      { id: "INBOX", name: "Inbox", type: "system" },
      { id: "UNREAD", name: "Unread", type: "system" },
      { id: "Label_1", name: "Team", type: "user" },
      { id: "Label_2", name: "Personal", type: "user" },
      { name: "No ID", type: "user" },
    ] } };
  });
  let syncGate = Promise.resolve();
  let syncStarted = () => {};
  t.mock.method(api.users.messages, "list", async (params: gmail_v1.Params$Resource$Users$Messages$List) => {
    assert.deepEqual(params.labelIds, ["INBOX"]);
    syncStarted();
    await syncGate;
    return { data: { messages: [{ id: params.pageToken ? "fresh" : "cached" }], nextPageToken: params.pageToken ? undefined : "page2" } };
  });
  t.mock.method(api.users.messages, "get", async (params: gmail_v1.Params$Resource$Users$Messages$Get) => {
    const labelIds = remote.get(params.id!) || [];
    return { data: { labelIds, threadId: "thread", internalDate: "1700000000000", raw: Buffer.from(
      "From: Alice <alice@example.com>\r\nTo: Me <me@example.com>\r\nSubject: Fresh\r\n\r\nSynthetic body",
    ).toString("base64url") } };
  });
  let modifyFails = false;
  const modifications: gmail_v1.Params$Resource$Users$Messages$Modify[] = [];
  t.mock.method(api.users.messages, "modify", async (params: gmail_v1.Params$Resource$Users$Messages$Modify) => {
    modifications.push(params);
    if (modifyFails) throw new Error("provider offline");
    const current = remote.get(params.id!) || [];
    const labels = [...new Set([...current, ...(params.requestBody?.addLabelIds || [])])]
      .filter((id) => !params.requestBody?.removeLabelIds?.includes(id));
    remote.set(params.id!, labels);
    return { data: { id: params.id, ...(labels.length ? { labelIds: labels } : {}) } };
  });
  const server = await startServer(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const desktop = { "X-Desktop-Token": "test-desktop-token", "Content-Type": "application/json" };
    const state = await (await fetch(`${base}/api/state`, { headers: desktop })).json() as { csrf: string };
    const headers = { ...desktop, "X-CSRF-Token": state.csrf };
    const sync = () => fetch(`${base}/api/sync`, { method: "POST", headers });
    const update = (id: string, input: object) => fetch(`${base}/api/messages/${encodeURIComponent(id)}`, {
      method: "PATCH", headers, body: JSON.stringify(input),
    });

    await t.test("sync stores names and label IDs for cached and fresh messages without account collisions", async () => {
      const response = await sync();
      assert.deepEqual(await response.json(), { errors: [] });
      assert.equal(all("label").some((label) => label.id === "old"), false);
      assert.equal(all("label").filter((label) => label.id === "Label_1").length, 2);
      assert.equal(all("label").find((label) => label.accountId === "b" && label.id === "Label_1")?.name, "Other account");
      assert.deepEqual(all("mail").find((m) => m.id === mail.id)?.labelIds, remote.get("cached"));
      assert.deepEqual(all("mail").find((m) => m.remoteId === "fresh")?.labelIds, ["INBOX", "Label_2"]);
      assert.equal(all("mail").find((m) => m.remoteId === "vanished")?.archived, true);
      assert.deepEqual(all("mail").find((m) => m.remoteId === "vanished")?.labelIds, ["Label_1"]);
      assert.equal((await listGmailLabels(account)).length, 4);
      catalogFails = true;
      const failed = await (await sync()).json() as { errors: string[] };
      assert.equal(failed.errors.length, 1);
      assert.equal(all("label").filter((label) => label.accountId === "a").length, 4);
      catalogFails = false;
    });

    await t.test("editing changes only this account's custom labels and rejects system/foreign labels", async () => {
      for (const labelIds of [["INBOX"], ["Foreign"]]) {
        assert.equal((await update(mail.id, { action: "labels", labelIds })).status, 400);
      }
      assert.equal(modifications.length, 0);
      const response = await update(mail.id, { action: "labels", labelIds: ["Label_2", "Label_2"] });
      assert.equal(response.status, 200);
      assert.deepEqual(modifications.at(-1)?.requestBody, { addLabelIds: ["Label_2"], removeLabelIds: ["Label_1"] });
      assert.deepEqual(remote.get("cached"), ["INBOX", "UNREAD", "Label_2"]);
      const before = all("mail").find((m) => m.id === mail.id);
      modifyFails = true;
      assert.equal((await update(mail.id, { action: "labels", labelIds: [] })).status, 400);
      assert.deepEqual(all("mail").find((m) => m.id === mail.id), before);
      modifyFails = false;
      assert.equal((await update(mail.id, { action: "labels", labelIds: [] })).status, 200);
      assert.deepEqual(remote.get("cached"), ["INBOX", "UNREAD"]);
      put("mail", "a:empty", { ...mail, id: "a:empty", remoteId: "empty", archived: true, unread: false, labelIds: ["Label_1"] });
      remote.set("empty", ["Label_1"]);
      assert.equal((await update("a:empty", { action: "labels", labelIds: [] })).status, 200);
      assert.deepEqual(all("mail").find((m) => m.id === "a:empty")?.labelIds, [], "Gmail may omit labelIds after the final label is removed");
    });

    await t.test("read queued during sync runs afterward, remains read on next sync and retries provider failures", async () => {
      let finishSync = () => {};
      syncGate = new Promise<void>((resolve) => { finishSync = resolve; });
      const started = new Promise<void>((resolve) => { syncStarted = resolve; });
      const syncing = sync();
      await started;
      const arrived = new Promise<void>((resolve) => server.once("request", () => resolve()));
      const modificationsBeforeRead = modifications.length;
      const reading = update(mail.id, { action: "read" });
      await arrived;
      assert.equal(modifications.length, modificationsBeforeRead, "read must wait for the running sync");
      finishSync();
      await syncing;
      assert.equal((await reading).status, 200);
      assert.equal(all("mail").find((m) => m.id === mail.id)?.unread, false);
      assert.deepEqual(remote.get("cached"), ["INBOX"]);
      await sync();
      assert.equal(all("mail").find((m) => m.id === mail.id)?.unread, false);
      const count = modifications.length;
      await update(mail.id, { action: "read" });
      assert.equal(modifications.length, count, "already-read requests are idempotent");
      put("mail", "a:archived", { ...mail, id: "a:archived", remoteId: "archived", archived: true, labelIds: ["UNREAD", "Label_1"] });
      modifyFails = true;
      assert.equal((await update("a:archived", { action: "read" })).status, 400);
      assert.equal(all("mail").find((m) => m.id === "a:archived")?.unread, true);
      modifyFails = false;
      assert.equal((await update("a:archived", { action: "read" })).status, 200);
      assert.deepEqual(remote.get("archived"), ["Label_1"]);
      const archived = all("mail").find((m) => m.id === "a:archived");
      assert.equal(archived?.archived, true);
      assert.equal(archived?.unread, false);
      assert.deepEqual(archived?.labelIds, ["Label_1"]);
    });

    await t.test("disconnect removes only the account's label cache", async () => {
      assert.equal((await fetch(`${base}/api/accounts/a`, { method: "DELETE", headers })).status, 200);
      assert.equal(all("label").some((label) => label.accountId === "a"), false);
      assert.equal(all("label").filter((label) => label.accountId === "b").length, 2);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
