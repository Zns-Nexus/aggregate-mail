import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { loadEnvFile } from "node:process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import express from "express";
import { google } from "googleapis";
import { z } from "zod";
import { all, put, putBatch, remove, account, transaction, type StoredAccount } from "./store.js";
import { mountDrafts } from "./drafts.js";
import { oauth, providers, presets, validateImap, listGmailLabels, syncError } from "./providers.js";
import { ImapWatch, sameImapAccount, type ImapWatchFactory } from "./imap-watch.js";
import {
  sendMail,
  updateMessage,
  messageActionSchema,
  runMailWork,
  findMail,
  assertMailAvailable,
  mailIsQuiesced,
  trackMailWork,
  quiesceMailWork,
  resumeMailWork,
} from "./mail-actions.js";
import { mountMcp, authorizeMcp } from "./mcp.js";
import { classify, sortMail, SortingUnavailable } from "./sorting.js";
import { companyLogo } from "./avatars.js";
import { companySvg, isFreeMail, normalizeDomain, syncLogos } from "./logos.js";
import { jevProviderOf, type Provider, type Mail, type SyncFailure } from "../shared/types.js";

const configPath = process.env.MAIL_CONFIG_PATH || ".env";
if (existsSync(configPath)) loadEnvFile(configPath);
const desktopEvents = new EventEmitter();
const app = express();
const appUrl = process.env.APP_URL || "http://127.0.0.1:5173";
const allowedOrigins = new Set([
  new URL(appUrl).origin,
  "http://127.0.0.1:3001",
  ...(process.env.MAIL_RENDERER_ORIGIN
    ? [process.env.MAIL_RENDERER_ORIGIN]
    : []),
]);
const csrf = randomBytes(32).toString("hex");
let syncing = false;
let syncRun: Promise<string[]> | undefined;
let wakeSync: (() => void) | undefined;
let imapWatch: ImapWatch | undefined;
const pendingAccounts = new Set<string>();
const scheduledAccounts = new Set<string>();
const activeAccounts = new Set<string>();
const accountSyncStatus = (id: string) => activeAccounts.has(id) ? "running" as const : pendingAccounts.has(id) ? "queued" as const : undefined;
let scanningLogos = false;
const assertNotSyncing = () => {
  assertMailAvailable();
  if (syncing)
    throw new Error("Wait for the current sync to finish, then try again.");
};
app.use("/mcp", authorizeMcp);
app.use(express.json({ limit: "2mb" }));
app.use("/mcp", (_req, res, next) => {
  if (mailIsQuiesced())
    return res.status(503).json({ error: "Mail is paused for an application update. Try again shortly." });
  next();
});
const mailRequest = (handler: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler =>
  (req, res, next) => { void trackMailWork(() => handler(req, res)).catch(next); };
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const host = req.hostname;
  if (host !== "127.0.0.1" && host !== "localhost")
    return res
      .status(403)
      .json({ error: "This app only accepts local requests." });
  if (req.headers.origin && !allowedOrigins.has(req.headers.origin))
    return res.status(403).json({ error: "Origin not allowed." });
  if (
    process.env.MAIL_DESKTOP_TOKEN &&
    !req.path.startsWith("/oauth/google") &&
    req.headers["x-desktop-token"] !== process.env.MAIL_DESKTOP_TOKEN
  )
    return res
      .status(403)
      .json({ error: "Open this inbox in Emc²." });
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers["x-csrf-token"] !== csrf
  )
    return res.status(403).json({ error: "Reload the app and try again." });
  if (mailIsQuiesced() && (req.path.startsWith("/oauth/") || !["GET", "HEAD"].includes(req.method)))
    return res.status(503).json({ error: "Mail is paused for an application update. Try again shortly." });
  if (
    syncing &&
    !["GET", "HEAD"].includes(req.method) &&
    !/^\/accounts\/[^/]+\/drafts(?:\/[^/]+)?\/?$/.test(req.path) &&
    !req.path.startsWith("/send") &&
    req.path !== "/mcp" &&
    !(req.method === "PATCH" && /^\/messages\/[^/]+$/.test(req.path) && req.body?.action === "read") &&
    !(req.method === "POST" && (["/accounts/imap", "/sync"].includes(req.path) || /^\/accounts\/[^/]+\/reconnect$/.test(req.path)))
  )
    return res
      .status(409)
      .json({ error: "Wait for the current sync to finish, then try again." });
  next();
});
mountDrafts(app);
app.get("/api/state", (_req, res) => {
  res.json({
    csrf,
    accounts: all("account").map(({ credentials: _credentials, ...a }) => ({ ...a, syncStatus: accountSyncStatus(a.id) })),
    messages: all("mail"),
    labels: all("label"),
    rules: all("rule"),
    googleConfigured: !!(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ),
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    jevConfigured: !!process.env.TYPESAFE_API_KEY,
    jevProvider: jevProviderOf(process.env.TYPESAFE_PROVIDER),
    aiConfigured: !!process.env.OPENAI_API_KEY,
    lastSync: all("meta")[0]?.lastSync || null,
    syncing,
  });
});
app.post("/api/config", (req, res) => {
  const value = z
    .string()
    .trim()
    .max(2000)
    .refine((v) => !/[\r\n]/.test(v), "Use a single-line credential");
  const input = z
    .object({
      googleClientId: value.optional(),
      googleClientSecret: value.optional(),
      openaiApiKey: value.optional(),
      jevApiKey: value.optional(),
      jevProvider: z
        .enum(["typesafe", "vercel", "openrouter"])
        .optional(),
    })
    .parse(req.body);
  const updates = {
    GOOGLE_CLIENT_ID: input.googleClientId,
    GOOGLE_CLIENT_SECRET: input.googleClientSecret,
    OPENAI_API_KEY: input.openaiApiKey,
    TYPESAFE_API_KEY: input.jevApiKey,
    TYPESAFE_PROVIDER: input.jevProvider,
  };
  const entries = Object.entries(updates).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
  const previous = existsSync(configPath)
    ? readFileSync(configPath, "utf8").split("\n")
    : [];
  const names = new Set(entries.map(([name]) => name));
  const settings = previous.filter(
    (line) => !names.has(line.split("=")[0].trim()),
  );
  settings.push(
    ...entries.map(([name, setting]) => `${name}=${JSON.stringify(setting)}`),
  );
  writeFileSync(`${configPath}.tmp`, `${settings.join("\n")}\n`, {
    mode: 0o600,
  });
  renameSync(`${configPath}.tmp`, configPath);
  for (const [name, setting] of entries) process.env[name] = setting;
  res.json({ ok: true });
});
app.get("/api/logo/:domain", async (req, res) => {
  // theSVG first, then the favicon service: a brand the library knows gets a
  // proper logo, and everything else keeps the mark its mail host publishes.
  const image =
    (await companySvg(req.params.domain)) ||
    (await companyLogo(req.params.domain));
  if (!image) {
    // Cacheable so a row without a logo is not asked for on every render.
    res.set("Cache-Control", "public, max-age=600");
    return res.status(404).end();
  }
  res.set("Content-Type", image.type);
  res.set("Cache-Control", "public, max-age=604800");
  // Third-party vector bytes are served from this origin, so they are kept
  // inert if the URL is ever opened as a document rather than as an image.
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  return res.send(image.body);
});
app.post("/api/logos/sync", mailRequest(async (_req, res) => {
  if (scanningLogos)
    return res.status(409).json({ error: "A logo scan is already running." });
  scanningLogos = true;
  try {
    const domains = new Set<string>();
    for (const m of all("mail")) {
      const domain = normalizeDomain(m.address);
      if (domain && !isFreeMail(domain)) domains.add(domain);
    }
    res.json(await syncLogos([...domains]));
  } finally {
    scanningLogos = false;
  }
}));
const oauthStates = new Map<string, number>();
function existingAccount(email: string, provider: Provider) {
  const matches = all("account").filter((a) => a.email.toLowerCase() === email.toLowerCase());
  if (matches.some((a) => a.provider !== provider))
    throw new Error("This email is already connected using another connection method. Keep that connection, or disconnect it before switching. Disconnecting removes its local mail cache.");
  return matches[0];
}
app.get("/api/oauth/google", (_req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    if (process.env.MAIL_DESKTOP_TOKEN)
      return res
        .type("text")
        .send(
          "Save your Google client ID and secret in Emc² Settings, then try again.",
        );
    return res.redirect(
      `${appUrl}/?error=${encodeURIComponent("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env and restart the server.")}`,
    );
  }
  const state = randomBytes(32).toString("hex");
  for (const [s, expiry] of oauthStates)
    if (expiry < Date.now()) oauthStates.delete(s);
  oauthStates.set(state, Date.now() + 600000);
  res.cookie("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600000,
    path: "/api/oauth/google/callback",
  });
  res.redirect(
    oauth().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      state,
      scope: ["https://www.googleapis.com/auth/gmail.modify"],
    }),
  );
});
app.get("/api/oauth/google/callback", mailRequest(async (req, res) => {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const cookie = req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("oauth_state="))
    ?.slice(12);
  const expiry = oauthStates.get(state);
  oauthStates.delete(state);
  res.clearCookie("oauth_state", { path: "/api/oauth/google/callback" });
  if (!expiry || expiry < Date.now() || state !== cookie)
    return res
      .status(400)
      .send("Invalid or expired sign-in. Return to the app and try again.");
  try {
    if (req.query.error) throw new Error("Google sign-in was cancelled.");
    const code = z.string().parse(req.query.code);
    const auth = oauth();
    const { tokens } = await auth.getToken(code);
    auth.setCredentials(tokens);
    const { data } = await google
      .gmail({ version: "v1", auth })
      .users.getProfile({ userId: "me" });
    const email = z.email().parse(data.emailAddress);
    const old = existingAccount(email, "gmail");
    const refreshToken = tokens.refresh_token || old?.credentials.refreshToken;
    if (!refreshToken)
      throw new Error(
        "Google did not return offline access. Reconnect and grant consent.",
      );
    const id = old?.id || randomUUID();
    put("account", id, {
      id,
      email,
      provider: "gmail",
      credentials: { refreshToken },
    });
    void requestSync([id], true);
    if (process.env.MAIL_DESKTOP_TOKEN) {
      desktopEvents.emit("oauth", null);
      res
        .type("text")
        .send(
          "Account connected. You can close this tab and return to Emc².",
        );
    } else res.redirect(`${appUrl}/?connected=1`);
  } catch (error) {
    if (process.env.MAIL_DESKTOP_TOKEN) {
      const message =
        error instanceof Error ? error.message : "Google connection failed.";
      desktopEvents.emit("oauth", message);
      res
        .status(400)
        .type("text")
        .send(`${message} Return to Emc² to try again.`);
      return;
    }
    res.redirect(
      `${appUrl}/?error=${encodeURIComponent(error instanceof Error ? error.message : "Google connection failed.")}`,
    );
  }
}));
const imapSchema = z.object({
  provider: z.enum(["gmail-imap", "icloud", "fastmail", "yahoo", "imap"]),
  email: z.email(),
  password: z.string().min(1).max(1000),
  username: z.string().max(320).optional(),
  imapHost: z
    .string()
    .regex(/^[a-zA-Z0-9.-]+$/)
    .max(253)
    .optional(),
  smtpHost: z
    .string()
    .regex(/^[a-zA-Z0-9.-]+$/)
    .max(253)
    .optional(),
  imapPort: z.number().int().min(1).max(65535).default(993),
  smtpPort: z.union([z.literal(465), z.literal(587)]).default(465),
});
app.post("/api/accounts/imap", mailRequest(async (req, res) => {
  const input = imapSchema.parse(req.body);
  if (input.provider === "gmail-imap") {
    input.password = input.password.replace(/ /g, "");
    if (!/^[a-z]{16}$/.test(input.password))
      throw new Error("Enter the 16-letter Google app password. Do not use your regular Google password.");
  }
  const old = existingAccount(input.email, input.provider);
  const id = old?.id || randomUUID();
  const credentials = {
    ...input,
    ...(input.provider === "imap" ? {} : presets[input.provider]),
    username: input.provider === "imap" ? input.username : input.email,
  };
  if (!credentials.imapHost || !credentials.smtpHost)
    throw new Error("Enter both IMAP and SMTP server names.");
  const a: StoredAccount = {
    id,
    email: input.email,
    provider: input.provider,
    credentials,
  };
  await validateImap(a);
  // Validation awaits the network; another connection can finish meanwhile.
  const current = existingAccount(input.email, input.provider);
  a.id = current?.id || id;
  a.hasSynced = current?.hasSynced;
  put("account", a.id, a);
  if (!mailIsQuiesced()) imapWatch?.reconcile(all("account"));
  void requestSync([a.id], true);
  res.json({ ok: true });
}));
app.post("/api/accounts/:id/reconnect", (req, res) => {
  const a = all("account").find((a) => a.id === req.params.id);
  if (!a) return res.status(404).json({ error: "Account not found." });
  if (req.body !== undefined && (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length))
    return res.status(400).json({ error: "Retry uses the saved account credentials. Do not include account data." });
  // A completed account can retry while peers run; active/pending clicks still share work.
  if (!activeAccounts.has(a.id) && !pendingAccounts.has(a.id)) scheduledAccounts.delete(a.id);
  void requestSync([a.id]);
  res.status(202).json({ status: accountSyncStatus(a.id), error: a.error, syncFailure: a.syncFailure });
});
app.delete("/api/accounts/:id", (req, res) => {
  transaction(() => {
    account(req.params.id);
    remove("account", req.params.id);
    for (const draft of all("draft").filter((draft) => draft.accountId === req.params.id))
      remove("draft", draft.id);
    for (const m of all("mail").filter((m) => m.accountId === req.params.id))
      remove("mail", m.id);
    for (const label of all("label").filter((label) => label.accountId === req.params.id))
      remove("label", `${label.accountId}:${label.id}`);
  });
  imapWatch?.reconcile(all("account"));
  res.json({ ok: true });
});
app.post("/api/sync", async (_req, res) => {
  res.json(await syncMail());
});
// The desktop process starts its own run while the window is hidden, so a
// background sync reports the same errors a request would.
export async function syncMail(): Promise<{ errors: string[] }> {
  assertMailAvailable();
  imapWatch?.reconcile(all("account"));
  return { errors: await requestSync(all("account").map((a) => a.id)) };
}

function requestSync(ids: string[], reconnect = false): Promise<string[]> {
  if (mailIsQuiesced()) return Promise.resolve([]);
  for (const id of ids) {
    if (reconnect || !scheduledAccounts.has(id)) pendingAccounts.add(id);
    scheduledAccounts.add(id);
  }
  if (syncRun) {
    wakeSync?.();
    return syncRun;
  }
  syncing = true;
  let newUnread = 0;
  syncRun = runMailWork(async () => {
    const errors: string[] = [];
    const active = new Map<string, Promise<void>>();
    try {
      while (pendingAccounts.size || active.size) {
        for (const id of pendingAccounts) {
          if (active.size >= 2) break;
          if (active.has(id)) continue;
          pendingAccounts.delete(id);
          const a = all("account").find((a) => a.id === id);
          if (!a) continue;
          activeAccounts.add(id);
          active.set(id, syncAccount(a, errors, (count) => { newUnread += count; })
            .catch((error) => {
              const failure = syncError(error, a.provider, "sync");
              const message = `${a.email}: ${failure.message}`;
              errors.push(message);
              const current = all("account").find((current) => current.id === a.id);
              if (current && isDeepStrictEqual(current.credentials, a.credentials))
                put("account", a.id, { ...current, error: message, syncFailure: failure.failure });
            })
            .finally(() => { active.delete(id); activeAccounts.delete(id); if (active.size || pendingAccounts.size) desktopEvents.emit("mail-changed"); }));
        }
        if (active.size) {
          // Wake for a new account too; keep every active run until it settles.
          await Promise.race([...active.values(), new Promise<void>((resolve) => { wakeSync = resolve; })]);
          wakeSync = undefined;
        }
      }
      put("meta", "sync", { lastSync: Date.now() });
      return errors;
    } finally {
      syncing = false;
      syncRun = undefined;
      scheduledAccounts.clear();
      desktopEvents.emit("mail-changed");
      if (newUnread) desktopEvents.emit("new-mail", newUnread);
    }
  });
  return syncRun;
}

async function syncAccount(
  a: StoredAccount,
  errors: string[],
  onNewUnread: (count: number) => void,
) {
  const currentAccount = () => all("account").find((current) => sameImapAccount(current, a));
  const existing = new Map(
    all("mail").filter((m) => m.accountId === a.id).map((m) => [m.id, m]),
  );
  const hasSynced = a.hasSynced ?? existing.size > 0;
  const rules = all("rule");
  const fresh = new Map<string, Mail>();
  const received = new Set<string>();
  const saveBatch: NonNullable<Parameters<typeof providers.gmail.list>[2]> = (batch) => {
    if (!currentAccount()) return;
    const changed: [string, Mail][] = [];
    for (const m of batch) {
      if (received.has(m.id)) continue;
      received.add(m.id);
      const previous = existing.get(m.id);
      const saved = {
        ...m,
        ...(previous
          ? { category: previous.category, relevance: previous.relevance, reason: previous.reason }
          : sortMail(m, rules)),
        archived: false,
        snoozedUntil: previous?.snoozedUntil || null,
      };
      if (!isDeepStrictEqual(previous, saved)) changed.push([m.id, saved]);
    }
    putBatch("mail", changed);
    for (const [id, saved] of changed) if (!existing.has(id)) fresh.set(id, saved);
    if (changed.length) desktopEvents.emit("mail-changed");
  };
  let error: string | undefined;
  let syncFailure: SyncFailure | undefined;
  let syncWarning: SyncFailure | undefined;
  try {
    const labels = a.provider === "gmail" ? await listGmailLabels(a) : undefined;
    if (!currentAccount()) return;
    if (labels) {
      putBatch("label", labels.map((label) => [`${a.id}:${label.id}`, label]));
      for (const old of all("label").filter((label) => label.accountId === a.id && !labels.some((current) => current.id === label.id)))
        remove("label", `${a.id}:${old.id}`);
    }
    const incoming = await providers[a.provider].list(a, existing, saveBatch, (warning) => { syncWarning = warning; }, labels);
    if (!currentAccount()) return;
    // Also support a provider returning its final batch without a progress callback.
    saveBatch(incoming);
    const ids = new Set(incoming.map((m) => m.id));
    const archived: [string, Mail][] = [...existing.values()]
      .filter((m) => !m.archived && !ids.has(m.id)).map((m) => [m.id, { ...m, archived: true, labelIds: m.labelIds?.filter((id) => id !== "INBOX") }]);
    putBatch("mail", archived);
    if (archived.length) desktopEvents.emit("mail-changed");
  } catch (failure) {
    const safe = syncError(failure, a.provider, "sync");
    error = `${a.email}: ${safe.message}`;
    syncFailure = safe.failure;
    errors.push(error);
  }
  if (fresh.size && (process.env.TYPESAFE_API_KEY || process.env.OPENAI_API_KEY)) {
    const messages = [...fresh.values()];
    let cursor = 0;
    let stopped = false;
    await Promise.all(Array.from({ length: Math.min(6, messages.length) }, async () => {
      while (cursor < messages.length && !stopped && currentAccount()) {
        const m = messages[cursor++];
        try {
          const sorting = await classify(m, rules);
          if (currentAccount()) put("mail", m.id, { ...m, ...sorting });
        } catch (sortingFailure) {
          if (stopped) return;
          stopped = true;
          const warning = sortingFailure instanceof SortingUnavailable
            ? sortingFailure.message
            : "AI sorting unavailable. Mail was synced using local sorting.";
          errors.push(warning);
          if (!error) error = warning;
        }
      }
    }));
  }
  // A first import fills an empty cache, so only a later sync reports arrivals.
  if (!error && currentAccount()) {
    const arrived = [...fresh.values()].filter((m) => m.unread).length;
    if (arrived && hasSynced) onNewUnread(arrived);
  }
  const current = currentAccount();
  // A reconnect owns its new credentials and status, even if the old run finishes later.
  if (current && isDeepStrictEqual(current.credentials, a.credentials))
    put("account", a.id, {
      ...current,
      hasSynced: error ? current.hasSynced ?? hasSynced : true,
      error,
      syncFailure,
      syncWarning,
    });
}
app.post("/api/messages/:id/images", mailRequest(async (req, res) => {
  const mail = findMail(z.string().parse(req.params.id));
  if (mail.images !== undefined) return res.json({ images: mail.images });
  const a = account(mail.accountId);
  const images = await providers[a.provider].images(a, mail);
  // Read current state again so an overlapping mail action is not overwritten.
  assertNotSyncing();
  const current = findMail(mail.id);
  put("mail", mail.id, { ...current, images });
  res.json({ images });
}));
app.post("/api/messages/:id/content", mailRequest(async (req, res) => {
  const mail = findMail(z.string().parse(req.params.id));
  if (mail.html !== undefined) return res.json({ html: mail.html, images: mail.images });
  const a = account(mail.accountId);
  const content = await providers[a.provider].content(a, mail);
  assertNotSyncing();
  const current = findMail(mail.id);
  if (current.accountId !== mail.accountId || current.remoteId !== mail.remoteId || current.messageId !== mail.messageId)
    throw new Error("Email identity changed. Content was not cached.");
  // Preserve image recovery and mail actions completed during the source fetch.
  const updated = { ...current, html: current.html === undefined ? content.html : current.html,
    images: current.images ?? content.images };
  put("mail", mail.id, updated);
  res.json({ html: updated.html, images: updated.images });
}));
app.patch("/api/messages/:id", async (req, res) => {
  const input = messageActionSchema.parse(req.body);
  if (!all("mail").some((m) => m.id === req.params.id))
    return res.status(404).json({ error: "Message not found." });
  await updateMessage(req.params.id, input);
  res.json({ ok: true });
});
app.post("/api/send", async (req, res) => {
  res.json(await sendMail(req.body));
});
app.post("/api/rules", (req, res) => {
  const input = z
    .object({
      sender: z.email(),
      instruction: z.string().min(1).max(500),
      category: z.enum(["important", "other"]),
      relevance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    })
    .parse(req.body);
  const previous = all("rule").find(
    (r) => r.sender.toLowerCase() === input.sender.toLowerCase(),
  );
  const id = previous?.id || randomUUID();
  put("rule", id, { ...input, id });
  for (const m of all("mail"))
    if (m.address.toLowerCase() === input.sender.toLowerCase())
      put("mail", m.id, {
        ...m,
        category: input.category,
        relevance: input.relevance,
        reason: input.instruction,
      });
  res.json({ ok: true });
});
app.delete("/api/rules/:id", (req, res) => {
  remove("rule", req.params.id);
  const rules = all("rule");
  for (const m of all("mail"))
    put("mail", m.id, { ...m, ...sortMail(m, rules) });
  res.json({ ok: true });
});
mountMcp(app, assertNotSyncing, () => desktopEvents.emit("mail-changed"));
const staticPath = process.env.MAIL_STATIC_DIR || path.resolve("dist");
app.use((_req, res, next) => {
  res.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  next();
});
app.use(express.static(staticPath));
app.get("/{*path}", (_req, res) =>
  res.sendFile(path.join(staticPath, "index.html")),
);
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((x) => x.message).join("; ")
        : error instanceof Error
          ? error.message
          : "Request failed.";
    res.status(400).json({ error: message });
  },
);
export function startServer(
  port: number,
  onAccountConnected?: (error: string | null) => void,
  onMailChanged?: () => void,
  onNewMail?: (count: number) => void,
  watchClient?: ImapWatchFactory,
): Promise<Server> {
  if (onAccountConnected) desktopEvents.on("oauth", onAccountConnected);
  if (onMailChanged) desktopEvents.on("mail-changed", onMailChanged);
  if (onNewMail) desktopEvents.on("new-mail", onNewMail);
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => {
      imapWatch = new ImapWatch((a) => {
        if (all("account").some((current) => sameImapAccount(current, a)))
          void requestSync([a.id], true);
      }, watchClient);
      imapWatch.reconcile(all("account"));
      resolve(server);
    });
    server.once("error", reject);
    // A restarted server, such as the macOS keychain relaunch, must not leave
    // the previous window's listeners subscribed.
    server.once("close", () => {
      imapWatch?.close();
      imapWatch = undefined;
      if (onAccountConnected) desktopEvents.off("oauth", onAccountConnected);
      if (onMailChanged) desktopEvents.off("mail-changed", onMailChanged);
      if (onNewMail) desktopEvents.off("new-mail", onNewMail);
    });
  });
}
export async function quiesceMail(timeout: number) {
  // Block admission before closing watchers, including already queued sync and MCP sends.
  const drained = quiesceMailWork(timeout);
  imapWatch?.close();
  await drained;
}
export function resumeMail() {
  resumeMailWork();
  imapWatch?.reconcile(all("account"));
}
if (!process.env.MAIL_DESKTOP_TOKEN)
  void startServer(3001)
    .then(() => console.log("Mail server listening at http://127.0.0.1:3001"))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
