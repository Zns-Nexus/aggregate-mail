import { google } from "googleapis";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { Parser } from "htmlparser2";
import { imageSource } from "../shared/types.js";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { z } from "zod";
import type { GmailLabel, Mail, MailImage, Provider, SyncFailure } from "../shared/types.js";
import type { StoredAccount } from "./store.js";

export class SyncError extends Error {
  constructor(public failure: SyncFailure, provider: Provider) {
    const messages: Record<SyncFailure["kind"], string> = {
      auth: provider === "gmail"
        ? "Google sign-in was rejected. Continue with Google in Settings."
        : "Authentication was rejected. Replace the app password in Settings.",
      access: "Mailbox access was denied. Check provider permissions or administrator policy.",
      transient: "The provider or connection is temporarily unavailable. Retry connection later.",
      message: "An email could not be read. Retry connection to fetch it again.",
      unknown: "Sync failed. Retry connection; if it persists, check the safe failure details.",
    };
    super(messages[failure.kind]);
  }
}
export function syncError(error: unknown, provider: Provider, phase: SyncFailure["phase"]): SyncError {
  if (error instanceof SyncError) return error;
  const e = error as {
    code?: unknown; name?: unknown; status?: unknown; authenticationFailed?: boolean; serverResponseCode?: unknown;
    response?: { status?: unknown; data?: { error?: string | { errors?: { reason?: unknown }[] } } };
  } | null;
  const statusValue = e?.response?.status ?? e?.status ?? e?.code;
  const status = typeof statusValue === "number" && statusValue >= 400 && statusValue <= 599 ? statusValue : undefined;
  const detail = e?.response?.data?.error;
  const reasons = typeof detail === "object" && Array.isArray(detail?.errors) ? detail.errors.map((item) => item?.reason) : [];
  const rateLimit = status === 429 || reasons.some((reason) => ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "dailyLimitExceeded"].includes(typeof reason === "string" ? reason : ""));
  const codes = ["invalid_grant", "invalid_token", "EAUTH", "AUTHENTICATIONFAILED", "ETHROTTLE", "ETIMEDOUT", "ETIMEOUT", "ECONNRESET", "ECONNREFUSED", "ECONNABORTED", "EPIPE", "ENOTFOUND", "EAI_AGAIN", "INCOMPLETE_LIST", "CONNECTION_CLOSED", "READ_FAILED", "PARSE_FAILED", "CLEANUP_FAILED"];
  const candidate = typeof detail === "string" ? detail : e?.code ?? e?.serverResponseCode;
  let code = typeof candidate === "string" && codes.includes(candidate) ? candidate : "UNKNOWN";
  if ([e?.name, candidate].some((value) => value === "AbortError" || value === "TimeoutError") || candidate === "CONNECT_TIMEOUT" || candidate === "GREETING_TIMEOUT") code = "ETIMEDOUT";
  if (candidate === "NoConnection" || candidate === "EConnectionClosed") code = "CONNECTION_CLOSED";
  const auth = e?.authenticationFailed || status === 401 || ["invalid_grant", "invalid_token", "EAUTH", "AUTHENTICATIONFAILED"].includes(code);
  const transient = rateLimit || (status !== undefined && status >= 500) || ["ETHROTTLE", "ETIMEDOUT", "ETIMEOUT", "ECONNRESET", "ECONNREFUSED", "ECONNABORTED", "EPIPE", "ENOTFOUND", "EAI_AGAIN", "INCOMPLETE_LIST", "CONNECTION_CLOSED"].includes(code);
  const kind = auth ? "auth" : transient ? "transient" : status === 403 ? "access" : phase === "read" || phase === "parse" ? "message" : "unknown";
  if (code === "UNKNOWN") code = auth ? "AUTH_REJECTED" : rateLimit ? "RATE_LIMIT" : status === 403 ? "ACCESS_DENIED" : status ? "HTTP_ERROR" : phase === "parse" ? "PARSE_FAILED" : phase === "read" ? "READ_FAILED" : "UNKNOWN";
  return new SyncError({ kind, phase: code === "invalid_grant" || code === "invalid_token" ? "auth" : phase, code, ...(status ? { status } : {}) }, provider);
}
async function syncOperation<T>(provider: Provider, phase: SyncFailure["phase"], work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) { throw syncError(error, provider, phase); }
}
const imapFailures = new WeakMap<ImapFlow, { failed: Promise<never>; error?: SyncError }>();
async function imapOperation<T>(client: ImapFlow, work: () => Promise<T>): Promise<T> {
  const state = imapFailures.get(client)!;
  if (state.error) throw state.error;
  const result = await Promise.race([work(), state.failed]);
  if (state.error) throw state.error;
  return result;
}
async function* imapFetch(client: ImapFlow, ...args: Parameters<ImapFlow["fetch"]>) {
  const iterator = client.fetch(...args);
  try {
    while (true) {
      const next = await imapOperation(client, () => iterator.next());
      if (next.done) return;
      yield next.value;
    }
  } finally {
    // Closing the transport releases ImapFlow's command; return drains iterator backpressure.
    void iterator.return?.().catch(() => {});
  }
}

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

export async function listGmailLabels(a: StoredAccount): Promise<GmailLabel[]> {
  const result = await gmail(a).users.labels.list({ userId: "me" });
  return (result.data.labels || []).flatMap((label) =>
    label.id && label.name && (label.type === "user" || label.type === "system")
      ? [{ id: label.id, accountId: a.id, name: label.name, type: label.type }]
      : [],
  );
}

export async function updateGmailLabels(a: StoredAccount, m: Mail, labelIds: string[], customIds: string[]) {
  const api = gmail(a);
  const current = await api.users.messages.get({
    userId: "me", id: m.remoteId, format: "metadata", fields: "labelIds",
  });
  const removeLabelIds = (current.data.labelIds || []).filter((id) => customIds.includes(id) && !labelIds.includes(id));
  if (removeLabelIds.length > 100) throw new Error("Too many labels to remove at once. Update this message in Gmail.");
  const result = await api.users.messages.modify({
    userId: "me",
    id: m.remoteId,
    requestBody: {
      addLabelIds: labelIds,
      // Remove only this account's custom labels, including labels absent from an older cache.
      removeLabelIds,
    },
  });
  if (result.data.id !== m.remoteId) throw new Error("Gmail did not confirm the labels. Sync and try again.");
  return result.data.labelIds || [];
}
function imap(a: StoredAccount) {
  const client = new ImapFlow({
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
  let reject!: (error: SyncError) => void;
  const failed = new Promise<never>((_resolve, fail) => { reject = fail; });
  void failed.catch(() => {});
  const state: { failed: Promise<never>; error?: SyncError } = { failed };
  imapFailures.set(client, state);
  client.on("error", (error) => {
    state.error ||= syncError(error, a.provider, "connect");
    reject(state.error);
    client.close();
  });
  return client;
}
type Incoming = Omit<
  Mail,
  "category" | "relevance" | "reason" | "archived" | "snoozedUntil"
>;
export async function parse(
  a: StoredAccount,
  remoteId: string,
  source: Buffer,
  unread: boolean,
  date?: number,
): Promise<Incoming> {
  const m = await simpleParser(source, { skipImageLinks: true });
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
    images: extractImages(m.html || ""),
    date: date || m.date?.getTime() || Date.now(),
    unread,
    messageId: m.messageId,
    cc: Array.isArray(m.cc) ? m.cc.map((x) => x.text).join(", ") : m.cc?.text,
    replyTo: m.replyTo?.value[0]?.address,
    references:
      typeof m.references === "string" ? [m.references] : m.references,
  };
}
function extractImages(html: string): MailImage[] {
  const images: MailImage[] = [];
  const seen = new Set<string>();
  new Parser({
    onopentag(name, attributes) {
      if (name !== "img" || images.length >= 50) return;
      const src = imageSource(attributes.src || "");
      if (!src || seen.has(src)) return;
      seen.add(src);
      images.push({ src, alt: (attributes.alt || "").slice(0, 500) });
    },
  }).end(html);
  return images;
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
    list: (a: StoredAccount, cached: Map<string, Mail>, onBatch?: (batch: Incoming[]) => void, onWarning?: (warning: SyncFailure) => void, labels?: GmailLabel[]) => Promise<Incoming[]>;
    images: (a: StoredAccount, m: Mail) => Promise<MailImage[]>;
    update: (
      a: StoredAccount,
      m: Mail,
      action: "archive" | "read",
    ) => Promise<void>;
    send: (a: StoredAccount, input: SendInput) => Promise<void>;
  }
> = {
  gmail: {
    async list(a, cached, onBatch, _onWarning, labels) {
      const auth = oauth();
      auth.setCredentials({ refresh_token: a.credentials.refreshToken });
      // Bound token refresh as well as message reads, using request cancellation.
      auth.transporter.defaults.timeout = 30000;
      auth.transporter.defaults.retry = false;
      auth.transporter.defaults.retryConfig = { retry: 0 };
      const api = google.gmail({ version: "v1", auth });
      const options = { timeout: 30000, retry: false };
      const messages: Incoming[] = [];
      const unreadIds = new Set<string>();
      let pageToken: string | undefined;
      // Listing unread IDs replaces a metadata request for every cached message.
      if (cached.size) {
        do {
          const page = await syncOperation(a.provider, "list", () => api.users.messages.list({
            userId: "me", labelIds: ["INBOX", "UNREAD"], maxResults: 500, pageToken,
          }, options));
          for (const item of page.data.messages || []) unreadIds.add(item.id!);
          pageToken = page.data.nextPageToken || undefined;
        } while (pageToken);
      }
      const memberships = new Map<string, string[]>();
      // Refresh labels by membership lists without downloading cached messages.
      if (cached.size && labels) {
        for (const label of labels.filter((label) => !["INBOX", "UNREAD"].includes(label.id))) {
          do {
            const page = await syncOperation(a.provider, "list", () => api.users.messages.list({
              userId: "me", labelIds: ["INBOX", label.id], maxResults: 500, pageToken,
            }, options));
            for (const item of page.data.messages || []) {
              if (!item.id || !cached.has(`${a.id}:${item.id}`)) continue;
              const ids = memberships.get(item.id) || [];
              ids.push(label.id);
              memberships.set(item.id, ids);
            }
            pageToken = page.data.nextPageToken || undefined;
          } while (pageToken);
        }
      }
      do {
        const page = await syncOperation(a.provider, "list", () => api.users.messages.list({
          userId: "me",
          labelIds: ["INBOX"],
          maxResults: 100,
          pageToken,
        }, options));
        const items = page.data.messages || [];
        let pageBatch: Incoming[] = [];
        for (let offset = 0; offset < items.length; offset += 10) {
          const results = await Promise.allSettled(
            items.slice(offset, offset + 10).map(async (item) => {
              const previous = cached.get(`${a.id}:${item.id}`);
              if (previous) return {
                ...previous, unread: unreadIds.has(item.id!),
                ...(labels ? { labelIds: ["INBOX", ...(unreadIds.has(item.id!) ? ["UNREAD"] : []), ...(memberships.get(item.id!) || [])] } : {}),
                ...(item.threadId ? { threadId: item.threadId } : {}),
              };
              const result = await syncOperation(a.provider, "read", () => api.users.messages.get({
                userId: "me",
                id: item.id!,
                format: "raw",
              }, options));
              const unread = result.data.labelIds?.includes("UNREAD") || false;
              return {
                ...(await syncOperation(a.provider, "parse", () => parse(
                  a,
                  item.id!,
                  Buffer.from(result.data.raw!, "base64url"),
                  unread,
                  Number(result.data.internalDate),
                ))),
                threadId: result.data.threadId || undefined,
                labelIds: result.data.labelIds || [],
              };
            }),
          );
          const batch = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
          messages.push(...batch);
          pageBatch.push(...batch);
          const failure = results.find((result) => result.status === "rejected");
          // Fresh mail stays progressive; cached-only changes share a page write.
          if (failure || batch.some((m) => !cached.has(m.id))) {
            onBatch?.(pageBatch);
            pageBatch = [];
          }
          if (failure?.status === "rejected") throw failure.reason;
        }
        if (pageBatch.length) onBatch?.(pageBatch);
        pageToken = page.data.nextPageToken || undefined;
      } while (pageToken);
      return messages;
    },
    async images(a, m) {
      const result = await gmail(a).users.messages.get({
        userId: "me", id: m.remoteId, format: "raw",
      });
      if (!result.data.raw) throw new Error("Email source is unavailable.");
      return (await parse(a, m.remoteId, Buffer.from(result.data.raw, "base64url"), m.unread)).images!;
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
    async list(a: StoredAccount, cached: Map<string, Mail>, onBatch?: (batch: Incoming[]) => void, onWarning?: (warning: SyncFailure) => void) {
      const client = imap(a);
      let phase: SyncFailure["phase"] = "connect";
      try {
        await imapOperation(client, () => client.connect());
        const lock = await imapOperation(client, () => client.getMailboxLock("INBOX"));
        let changed = false;
        const mailboxChanged = () => { changed = true; };
        client.on("exists", mailboxChanged);
        client.on("expunge", mailboxChanged);
        try {
          phase = "list";
          const result: Incoming[] = [];
          if (!client.mailbox) throw Object.assign(new Error(), { code: "INCOMPLETE_LIST" });
          const { exists, uidValidity, uidNext } = client.mailbox;
          const validity = String(uidValidity);
          const complete = () => {
            if (changed || !client.mailbox || client.mailbox.exists !== exists || String(client.mailbox.uidValidity) !== validity || client.mailbox.uidNext !== uidNext)
              throw Object.assign(new Error(), { code: "INCOMPLETE_LIST" });
          };
          const incomplete = () => { throw Object.assign(new Error(), { code: "INCOMPLETE_LIST" }); };
          if (!exists) { complete(); return result; }
          const seen = new Set<number>();
          const missing: number[] = [];
          let batch: Incoming[] = [];
          // Drain flags first: ImapFlow cannot issue commands inside this iterator.
          for await (const m of imapFetch(client, "1:*", { uid: true, flags: true })) {
            if (!Number.isSafeInteger(m.uid) || m.uid <= 0 || seen.has(m.uid) || !m.flags) incomplete();
            seen.add(m.uid);
            const previous = cached.get(`${a.id}:${validity}:${m.uid}`);
            if (previous) {
              const incoming = { ...previous, unread: !m.flags?.has("\\Seen") };
              result.push(incoming); batch.push(incoming);
              if (batch.length === 100) { onBatch?.(batch); batch = []; }
            } else missing.push(m.uid);
          }
          if (batch.length) onBatch?.(batch);
          if (seen.size !== exists) incomplete();
          complete();
          phase = "read";
          for (let offset = 0; offset < missing.length; offset += 10) {
            const expected = new Set(missing.slice(offset, offset + 10));
            batch = [];
            for await (const m of imapFetch(client, [...expected].join(","), {
              uid: true, source: true, flags: true,
            }, { uid: true })) {
              if (!expected.delete(m.uid)) incomplete();
              if (!m.source) throw Object.assign(new Error(), { code: "READ_FAILED" });
              batch.push(await syncOperation(a.provider, "parse", () => parse(a, `${validity}:${m.uid}`, m.source!, !m.flags?.has("\\Seen"))));
            }
            result.push(...batch);
            onBatch?.(batch);
            if (expected.size) incomplete();
            complete();
          }
          await imapOperation(client, async () => {});
          complete();
          return result;
        } finally {
          client.off("exists", mailboxChanged);
          client.off("expunge", mailboxChanged);
          lock.release();
        }
      } catch (error) {
        throw syncError(error, a.provider, phase);
      } finally {
        try {
          if (client.usable) {
            const loggedOut: unknown = await imapOperation(client, () => client.logout());
            if (loggedOut === false) { client.close(); onWarning?.({ kind: "unknown", phase: "cleanup", code: "CLEANUP_FAILED" }); }
          } else client.close();
        } catch {
          client.close();
          onWarning?.({ kind: "unknown", phase: "cleanup", code: "CLEANUP_FAILED" });
        }
      }
    },
    async images(a: StoredAccount, m: Mail) {
      // An archived UID belongs to the old INBOX, never to the archive folder.
      if (m.archived) throw new Error("Images are unavailable for this older archived IMAP email.");
      const identifiers = /^(\d+):([1-9]\d*)$/.exec(m.remoteId);
      if (!identifiers) throw new Error("Email identifiers are unavailable. Sync and try again.");
      const client = imap(a);
      try {
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");
        try {
          if (!client.mailbox || String(client.mailbox.uidValidity) !== identifiers[1])
            throw new Error("Mailbox identifiers changed. Sync before loading images.");
          const result = await client.fetchOne(identifiers[2], { source: true }, { uid: true });
          if (!result || !result.source) throw new Error("Email source is unavailable.");
          const parsed = await parse(a, m.remoteId, result.source, m.unread);
          if (m.messageId && parsed.messageId !== m.messageId)
            throw new Error("Email identity changed. Images were not loaded.");
          return parsed.images!;
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
        const mailbox = m.archived && action === "read"
          ? (await client.list()).find((folder) => folder.specialUse === "\\Archive")?.path || "Archive"
          : "INBOX";
        const lock = await client.getMailboxLock(mailbox);
        try {
          const [validity, originalUid] = m.remoteId.split(":");
          let uid = originalUid;
          if (m.archived && action === "read") {
            if (!m.messageId) throw new Error("This archived email has no Message-ID. Mark it read in your provider.");
            // Moving IMAP mail changes its UID; never reuse the old inbox UID in the archive.
            const matches = await client.search({ header: { "message-id": m.messageId } }, { uid: true });
            if (!matches || matches.length !== 1)
              throw new Error("Could not identify this archived email. Mark it read in your provider.");
            uid = String(matches[0]);
            const candidate = await client.fetchOne(uid, { headers: ["message-id"] }, { uid: true });
            if (!candidate || !candidate.headers || (await simpleParser(candidate.headers)).messageId !== m.messageId)
              throw new Error("Could not identify this archived email. Mark it read in your provider.");
          } else if (
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
      let client: ImapFlow | undefined;
      const warnings: string[] = [];
      try {
        client = imap(a);
        await client.connect();
        const folders = await client.list();
        const sent =
          folders.find((f) => f.specialUse === "\\Sent")?.path || "Sent";
        if (!folders.some((f) => f.path === sent))
          await client.mailboxCreate(sent);
        if (!(await client.append(sent, raw, ["\\Seen"])))
          throw new Error("Sent copy was not saved.");
      } catch {
        warnings.push("saving a Sent copy failed");
      } finally {
        try {
          if (client?.usable) {
            if (Object.is(await client.logout(), false))
              warnings.push("closing the Sent-copy connection failed");
          } else client?.close();
        } catch {
          warnings.push("closing the Sent-copy connection failed");
        }
      }
      if (warnings.length)
        throw new SentCopyError(
          `Email was sent, but ${warnings.join(" and ")}. Do not resend.`,
        );
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
