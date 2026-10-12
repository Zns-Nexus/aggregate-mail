import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Mail } from "../shared/types.js";
import type { StoredAccount } from "./store.js";

test("a background sync reports new unread mail once per run", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "emc2-notifications-"));
  process.env.MAIL_DATA_DIR = directory;
  process.env.MAIL_CONFIG_PATH = path.join(directory, "absent.env");
  process.env.MAIL_DESKTOP_TOKEN = "test-desktop-token";
  process.env.MAIL_DATA_KEY = Buffer.alloc(32, 12).toString("base64");
  process.env.TYPESAFE_API_KEY = "";
  process.env.OPENAI_API_KEY = "";
  const { startServer } = await import("./index.js");
  const { put } = await import("./store.js");
  const { providers } = await import("./providers.js");
  const account = (id: string): StoredAccount => ({
    id,
    email: `${id}@example.com`,
    provider: "imap",
    credentials: {},
  });
  const mail = (a: StoredAccount, id: string, unread = true): Mail => ({
    id: `${a.id}:${id}`,
    accountId: a.id,
    remoteId: id,
    sender: "Synthetic Sender",
    address: "sender@example.com",
    to: a.email,
    subject: "Please review",
    preview: "Synthetic mail",
    body: "Synthetic body",
    date: 1700000000000,
    unread,
    category: "important",
    relevance: 2,
    reason: "Saved sorting",
    archived: false,
    snoozedUntil: null,
  });
  const first = account("a");
  put("account", first.id, first);
  const inbox: Mail[] = [mail(first, "imported")];
  let offline = false;
  t.mock.method(providers.imap, "list", async (a: StoredAccount) => {
    if (offline) throw new Error("Synthetic connection failure");
    return inbox.filter((m) => m.accountId === a.id);
  });
  const notifications: number[] = [];
  let changes = 0;
  const server = await startServer(
    0,
    undefined,
    () => changes++,
    (count) => notifications.push(count),
  );
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const headers = {
      "X-Desktop-Token": "test-desktop-token",
      "Content-Type": "application/json",
    };
    const csrf = (
      (await (await fetch(`${origin}/api/state`, { headers })).json()) as {
        csrf: string;
      }
    ).csrf;
    const sync = async () => {
      const response = await fetch(`${origin}/api/sync`, {
        method: "POST",
        headers: { ...headers, "X-CSRF-Token": csrf },
      });
      assert.equal(response.status, 200);
      return (await response.json()) as { errors: string[] };
    };
    // The first run imports the mailbox, so its mail is not news.
    assert.deepEqual((await sync()).errors, []);
    assert.deepEqual(notifications, []);
    inbox.push(mail(first, "new"), mail(first, "read", false), mail(first, "another"));
    offline = true;
    assert.equal((await sync()).errors.length, 1);
    assert.deepEqual(notifications, []);
    offline = false;
    await sync();
    // A second run with nothing new does not repeat the same count.
    await sync();
    assert.deepEqual(notifications, [2]);
    assert.ok(changes > 0);
    // An account whose cache starts empty notifies once it has synced.
    const second = account("b");
    put("account", second.id, second);
    inbox.push(mail(second, "first"));
    await sync();
    assert.deepEqual(notifications, [2]);
    inbox.push(mail(second, "second"));
    await sync();
    assert.deepEqual(notifications, [2, 1]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
