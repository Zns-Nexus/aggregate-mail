import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";

test("SMTP acceptance survives Sent-copy and connection cleanup failures", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "emc2-send-"));
  process.env.MAIL_DATA_DIR = directory;
  process.env.MAIL_DATA_KEY = Buffer.alloc(32, 7).toString("base64");
  const { put } = await import("./store.js");
  const { sendMail } = await import("./mail-actions.js");
  put("account", "synthetic", {
    id: "synthetic",
    email: "sender@example.com",
    provider: "imap",
    credentials: { imapHost: "imap.example.com", smtpHost: "smtp.example.com" },
  });
  const input = {
    accountId: "synthetic",
    to: "recipient@example.com",
    subject: "Synthetic test",
    body: "Synthetic message",
  };
  try {
    for (const scenario of [
      { name: "accepted with copy and logout", copy: true, logout: true },
      { name: "Sent-copy failure", copy: false, logout: true },
      { name: "logout failure after saved copy", copy: true, logout: false },
      { name: "copy and logout both fail", copy: false, logout: false },
      { name: "append returns false", copy: false, logout: true, appendFalse: true },
      { name: "Sent-copy connection fails", copy: false, logout: true, connect: false },
      { name: "connection and close both fail", copy: false, logout: true, connect: false, close: false },
    ]) {
      await t.test(scenario.name, async (t) => {
        let sends = 0;
        let logouts = 0;
        let closes = 0;
        t.mock.method(nodemailer, "createTransport", () => ({
          sendMail: async () => { sends++; return { accepted: [input.to] }; },
        }));
        t.mock.method(ImapFlow.prototype, "connect", async function (this: ImapFlow) {
          if (scenario.connect === false) throw new Error("Synthetic connection failure");
          this.usable = true;
        });
        t.mock.method(ImapFlow.prototype, "list", async () => [
          { path: "Sent", specialUse: "\\Sent" },
        ]);
        t.mock.method(ImapFlow.prototype, "append", async () => {
          if (scenario.appendFalse) return false;
          if (!scenario.copy) throw new Error("Synthetic append failure");
          return { uid: 1 };
        });
        t.mock.method(ImapFlow.prototype, "logout", async () => {
          logouts++;
          if (!scenario.logout) throw new Error("Synthetic logout failure");
        });
        t.mock.method(ImapFlow.prototype, "close", () => {
          closes++;
          if (scenario.close === false) throw new Error("Synthetic close failure");
        });
        const result = await sendMail(input);
        assert.equal(result.ok, true);
        assert.equal(sends, 1);
        assert.equal(logouts, scenario.connect === false ? 0 : 1);
        assert.equal(closes, scenario.connect === false ? 1 : 0);
        if (scenario.copy && scenario.logout) assert.equal(result.warning, undefined);
        else {
          assert.match(result.warning!, /Email was sent/);
          assert.match(result.warning!, /Do not resend/);
          if (!scenario.copy) assert.match(result.warning!, /Sent copy failed/);
          if (!scenario.logout || scenario.close === false) assert.match(result.warning!, /connection failed/);
        }
      });
    }
    await t.test("SMTP rejection stays a failure and never opens IMAP", async (t) => {
      t.mock.method(nodemailer, "createTransport", () => ({
        sendMail: async () => { throw new Error("Synthetic SMTP rejection"); },
      }));
      const connect = t.mock.method(ImapFlow.prototype, "connect", async () => {});
      await assert.rejects(sendMail(input), /Synthetic SMTP rejection/);
      assert.equal(connect.mock.callCount(), 0);
    });
    await t.test("invalid input never submits to SMTP", async (t) => {
      const transport = t.mock.method(nodemailer, "createTransport", () => {
        throw new Error("Must not submit invalid input");
      });
      await assert.rejects(sendMail({ ...input, to: "invalid" }));
      assert.equal(transport.mock.callCount(), 0);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
