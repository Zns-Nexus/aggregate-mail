import { google } from "googleapis";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { z } from "zod";
import type { Mail, Provider } from "../shared/types.js";
import type { StoredAccount } from "./store.js";

export const presets = {
  "gmail-imap": {
    imapHost: "imap.gmail.com",
    smtpHost: "smtp.gmail.com",
    imapPort: 993,
    smtpPort: 465,
  },
  icloud: {
    imapHost: "imap.mail.me.com",
    smtpHost: "smtp.mail.me.com",
    imapPort: 993,
    smtpPort: 587,
  },
  fastmail: {
    imapHost: "imap.fastmail.com",
    smtpHost: "smtp.fastmail.com",
    imapPort: 993,
    smtpPort: 465,
  },
  yahoo: {
    imapHost: "imap.mail.yahoo.com",
    smtpHost: "smtp.mail.yahoo.com",
    imapPort: 993,
    smtpPort: 465,
  },
};
export function oauth() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL || "http://127.0.0.1:5173"}/api/oauth/google/callback`,
  );
}
function gmail(a: StoredAccount) {
  const auth = oauth();
  auth.setCredentials({ refresh_token: a.credentials.refreshToken });
  return google.gmail({ version: "v1", auth });
}
function imap(a: StoredAccount) {
  return new ImapFlow({
    host: a.credentials.imapHost!,
    port: a.credentials.imapPort || 993,
    secure: true,
    auth: {
      user: a.credentials.username || a.email,
      pass: a.credentials.password!,
    },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
}
type Incoming = Omit<
  Mail,
  "category" | "relevance" | "reason" | "archived" | "snoozedUntil"
>;
async function parse(
  a: StoredAccount,
  remoteId: string,
  source: Buffer,
  unread: boolean,
  date?: number,
): Promise<Incoming> {
  const m = await simpleParser(source);
  const from = m.from?.value[0];
  const body = m.text || "";
  return {
    id: `${a.id}:${remoteId}`,
    accountId: a.id,
    remoteId,
    sender: from?.name || from?.address || "Unknown sender",
    address: from?.address || "",
    to: Array.isArray(m.to)
      ? m.to.map((x) => x.text).join(", ")
      : m.to?.text || a.email,
    subject: m.subject || "(No subject)",
    preview: body.replace(/\s+/g, " ").slice(0, 220),
    body,
    date: date || m.date?.getTime() || Date.now(),
    unread,
    messageId: m.messageId,
    cc: Array.isArray(m.cc) ? m.cc.map((x) => x.text).join(", ") : m.cc?.text,
    replyTo: m.replyTo?.value[0]?.address,
    references:
      typeof m.references === "string" ? [m.references] : m.references,
  };
}
export async function validateImap(a: StoredAccount) {
  const client = imap(a);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    await smtp(a).verify();
  } finally {
    if (client.usable) await client.logout();
    else client.close();
  }
}
export class SentCopyError extends Error {}

// All providers expose the same read, update and send operations to the client.
export const providers: Record<
  Provider,
  {
    list: (a: StoredAccount, cached: Map<string, Mail>) => Promise<Incoming[]>;
    update: (
      a: StoredAccount,
      m: Mail,
      action: "archive" | "read",
    ) => Promise<void>;
    send: (a: StoredAccount, input: SendInput) => Promise<void>;
  }
> = {
  gmail: {
    async list(a, cached) {
      const api = gmail(a);
      const messages: Incoming[] = [];
      let pageToken: string | undefined;
      do {
        const page = await api.users.messages.list({
          userId: "me",
          labelIds: ["INBOX"],
          maxResults: 100,
          pageToken,
        });
        const items = page.data.messages || [];
        for (let offset = 0; offset < items.length; offset += 10) {
          const batch = await Promise.all(
            items.slice(offset, offset + 10).map(async (item) => {
              const previous = cached.get(`${a.id}:${item.id}`);
              const result = await api.users.messages.get({
                userId: "me",
                id: item.id!,
                format: previous ? "metadata" : "raw",
                ...(previous ? { fields: "labelIds,threadId" } : {}),
              });
              const unread = result.data.labelIds?.includes("UNREAD") || false;
              if (previous)
                return {
                  ...previous,
                  unread,
                  threadId: result.data.threadId || undefined,
                };
              return {
                ...(await parse(
                  a,
                  item.id!,
                  Buffer.from(result.data.raw!, "base64url"),
                  unread,
                  Number(result.data.internalDate),
                )),
                threadId: result.data.threadId || undefined,
              };
            }),
          );
          messages.push(...batch);
        }
        pageToken = page.data.nextPageToken || undefined;
      } while (pageToken);
      return messages;
    },
    async update(a, m, action) {
      await gmail(a).users.messages.modify({
        userId: "me",
        id: m.remoteId,
        requestBody: {
          removeLabelIds: [action === "archive" ? "INBOX" : "UNREAD"],
        },
      });
    },
    async send(a, input) {
      const raw = await new MailComposer({
        from: a.email,
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        text: input.body,
        inReplyTo: input.inReplyTo,
        references: input.references || input.inReplyTo,
      })
        .compile()
        .build();
      await gmail(a).users.messages.send({
        userId: "me",
        requestBody: {
          raw: raw.toString("base64url"),
          threadId: input.threadId,
        },
      });
    },
  },
  "gmail-imap": imapProvider(),
  icloud: imapProvider(),
  fastmail: imapProvider(),
  yahoo: imapProvider(),
  imap: imapProvider(),
};
function smtp(a: StoredAccount) {
  return nodemailer.createTransport({
    host: a.credentials.smtpHost,
    port: a.credentials.smtpPort,
    secure: a.credentials.smtpPort === 465,
    requireTLS: a.credentials.smtpPort !== 465,
    auth: { user: a.email, pass: a.credentials.password },
    logger: false,
    debug: false,
    connectionTimeout: 15000,
    socketTimeout: 30000,
  });
}
function imapProvider() {
  return {
    async list(a: StoredAccount) {
      const client = imap(a);
      try {
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");
        try {
          const result: Incoming[] = [];
          if (!client.mailbox || !client.mailbox.exists) return result;
          const validity = String(client.mailbox.uidValidity);
          // shortcut: full inbox fetch each sync, upgrade to incremental UID sync for large mailboxes.
          for await (const m of client.fetch("1:*", {
            uid: true,
            source: true,
            flags: true,
          })) {
            if (m.source)
              result.push(
                await parse(
                  a,
                  `${validity}:${m.uid}`,
                  m.source,
                  !m.flags?.has("\\Seen"),
                ),
              );
          }
          return result;
        } finally {
          lock.release();
        }
      } finally {
        if (client.usable) await client.logout();
        else client.close();
      }
    },
    async update(a: StoredAccount, m: Mail, action: "archive" | "read") {
      const client = imap(a);
      try {
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");
        try {
          const [validity, uid] = m.remoteId.split(":");
          if (
            !client.mailbox ||
            String(client.mailbox.uidValidity) !== validity
          )
            throw new Error(
              "Mailbox identifiers changed. Sync before changing this email.",
            );
          if (action === "read") {
            if (!(await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true })))
              throw new Error(
                "Could not mark this email as read. Sync and try again.",
              );
          } else {
            const folders = await client.list();
            const googleImap = a.provider === "gmail-imap";
            const archive =
              folders.find((f) => f.specialUse === (googleImap ? "\\All" : "\\Archive"))?.path ||
              (googleImap ? null : "Archive");
            if (!archive)
              throw new Error("Gmail All Mail is unavailable. Enable it in IMAP before archiving.");
            if (!folders.some((f) => f.path === archive))
              await client.mailboxCreate(archive);
            if (!(await client.messageMove(uid, archive, { uid: true })))
              throw new Error(
                "Could not archive this email. Sync and try again.",
              );
          }
        } finally {
          lock.release();
        }
      } finally {
        if (client.usable) await client.logout();
        else client.close();
      }
    },
    async send(a: StoredAccount, input: SendInput) {
      const raw = await new MailComposer({
        from: a.email,
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        text: input.body,
        inReplyTo: input.inReplyTo,
        references: input.references || input.inReplyTo,
      })
        .compile()
        .build();
      await smtp(a).sendMail({
        envelope: { from: a.email, to: [input.to, ...(input.cc || [])] },
        raw,
      });
      // Gmail SMTP saves Sent itself; appending over IMAP would duplicate it.
      if (a.provider === "gmail-imap") return;
      const client = imap(a);
      try {
        await client.connect();
        const folders = await client.list();
        const sent =
          folders.find((f) => f.specialUse === "\\Sent")?.path || "Sent";
        if (!folders.some((f) => f.path === sent))
          await client.mailboxCreate(sent);
        await client.append(sent, raw, ["\\Seen"]);
      } catch {
        throw new SentCopyError(
          "Email was sent, but saving a Sent copy failed. Do not resend.",
        );
      } finally {
        if (client.usable) await client.logout();
        else client.close();
      }
    },
  };
}
export const sendSchema = z.object({
  accountId: z.string(),
  to: z.email().max(320),
  cc: z.array(z.email().max(320)).max(100).optional(),
  references: z
    .array(
      z
        .string()
        .max(998)
        .refine((v) => !/[\r\n]/.test(v)),
    )
    .max(100)
    .optional(),
  subject: z
    .string()
    .max(998)
    .refine((v) => !/[\r\n]/.test(v), "Subject must be one line"),
  body: z.string().min(1).max(1000000),
  inReplyTo: z
    .string()
    .max(998)
    .refine((v) => !/[\r\n]/.test(v))
    .optional(),
  threadId: z.string().max(100).optional(),
});
export type SendInput = z.infer<typeof sendSchema>;
