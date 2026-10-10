import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { loadEnvFile } from "node:process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import express from "express";
import { google } from "googleapis";
import { z } from "zod";
import { all, put, remove, account, type StoredAccount } from "./store.js";
import { oauth, providers, presets, validateImap } from "./providers.js";
import {
  sendMail,
  updateMessage,
  messageActionSchema,
} from "./mail-actions.js";
import { mountMcp, authorizeMcp } from "./mcp.js";
import { classify, sortMail, SortingUnavailable, type Sorting } from "./sorting.js";
import { companyLogo } from "./avatars.js";
import { companySvg, isFreeMail, normalizeDomain, syncLogos } from "./logos.js";
import { jevProviderOf } from "../shared/types.js";

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
let scanningLogos = false;
const assertNotSyncing = () => {
  if (syncing)
    throw new Error("Wait for the current sync to finish, then try again.");
};
app.use("/mcp", authorizeMcp);
app.use(express.json({ limit: "2mb" }));
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
  if (
    syncing &&
    !["GET", "HEAD"].includes(req.method) &&
    !req.path.startsWith("/send") &&
    req.path !== "/mcp"
  )
    return res
      .status(409)
      .json({ error: "Wait for the current sync to finish, then try again." });
  next();
});
app.get("/api/state", (_req, res) => {
  res.json({
    csrf,
    accounts: all("account").map(({ credentials: _credentials, ...a }) => a),
    messages: all("mail"),
    rules: all("rule"),
    googleConfigured: !!(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ),
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    jevConfigured: !!process.env.TYPESAFE_API_KEY,
    jevProvider: jevProviderOf(process.env.TYPESAFE_PROVIDER),
    aiConfigured: !!process.env.OPENAI_API_KEY,
    lastSync: all("meta")[0]?.lastSync || null,
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
app.post("/api/logos/sync", async (_req, res) => {
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
});
const oauthStates = new Map<string, number>();
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
app.get("/api/oauth/google/callback", async (req, res) => {
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
    const old = all("account").find(
      (a) => a.provider === "gmail" && a.email === email,
    );
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
});
const imapSchema = z.object({
  provider: z.enum(["icloud", "fastmail", "yahoo", "imap"]),
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
app.post("/api/accounts/imap", async (req, res) => {
  const input = imapSchema.parse(req.body);
  const old = all("account").find(
    (a) => a.provider === input.provider && a.email === input.email,
  );
  const id = old?.id || randomUUID();
  const credentials = {
    ...input,
    ...(input.provider === "imap" ? {} : presets[input.provider]),
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
  put("account", id, a);
  res.json({ ok: true });
});
app.delete("/api/accounts/:id", (req, res) => {
  account(req.params.id);
  remove("account", req.params.id);
  for (const m of all("mail").filter((m) => m.accountId === req.params.id))
    remove("mail", m.id);
  res.json({ ok: true });
});
app.post("/api/sync", async (_req, res) => {
  if (syncing)
    return res.status(409).json({ error: "Sync is already running." });
  syncing = true;
  const errors: string[] = [];
  try {
    for (const a of all("account")) {
      try {
        const existing = new Map(
          all("mail")
            .filter((m) => m.accountId === a.id)
            .map((m) => [m.id, m]),
        );
        const incoming = await providers[a.provider].list(a, existing);
        const rules = all("rule");
        const fresh = incoming.filter((m) => !existing.has(m.id));
        const judged = new Map<string, Sorting>();
        if (
          fresh.length &&
          (process.env.TYPESAFE_API_KEY || process.env.OPENAI_API_KEY)
        ) {
          // One judgement per message, in parallel: a first sync has hundreds.
          let cursor = 0;
          let stopped = false;
          await Promise.all(
            Array.from({ length: Math.min(6, fresh.length) }, async () => {
              while (cursor < fresh.length && !stopped) {
                const m = fresh[cursor++];
                try {
                  judged.set(m.id, await classify(m, rules));
                } catch (error) {
                  if (stopped) return;
                  stopped = true;
                  errors.push(
                    error instanceof SortingUnavailable
                      ? error.message
                      : "AI sorting unavailable. Mail was synced using local sorting.",
                  );
                }
              }
            }),
          );
        }
        for (const m of incoming) {
          const previous = existing.get(m.id);
          const sorting = previous
            ? {
                category: previous.category,
                relevance: previous.relevance,
                reason: previous.reason,
              }
            : (judged.get(m.id) ?? sortMail(m, rules));
          put("mail", m.id, {
            ...m,
            ...sorting,
            archived: false,
            snoozedUntil: previous?.snoozedUntil || null,
          });
        }
        const ids = new Set(incoming.map((m) => m.id));
        for (const m of existing.values())
          if (!m.archived && !ids.has(m.id))
            put("mail", m.id, { ...m, archived: true });
        put("account", a.id, { ...a, error: undefined });
      } catch {
        const error = `${a.email}: sync failed. Check your connection or reconnect the account.`;
        errors.push(error);
        put("account", a.id, { ...a, error });
      }
    }
    put("meta", "sync", { lastSync: Date.now() });
    res.json({ errors });
  } finally {
    syncing = false;
  }
});
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
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
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
): Promise<Server> {
  if (onAccountConnected) desktopEvents.on("oauth", onAccountConnected);
  if (onMailChanged) desktopEvents.on("mail-changed", onMailChanged);
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });
}
if (!process.env.MAIL_DESKTOP_TOKEN)
  void startServer(3001)
    .then(() => console.log("Mail server listening at http://127.0.0.1:3001"))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
