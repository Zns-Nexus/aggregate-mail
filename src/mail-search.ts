import type { Account, Mail } from "../shared/types";

type SearchTerm = (mail: Mail) => boolean;

const fields = new Set(["from", "to", "subject", "body", "account", "is", "before", "after"]);
const error = "Invalid search. Check quotes, fields, and dates.";

function tokenize(query: string): string[] | null {
  const tokens: string[] = [];
  let token = "";
  let quoted = false;
  let active = false;
  for (const char of query) {
    if (char === '"') {
      quoted = !quoted;
      active = true;
    } else if (/\s/u.test(char) && !quoted) {
      if (active) tokens.push(token);
      token = "";
      active = false;
    } else {
      token += char;
      active = true;
    }
  }
  if (quoted) return null;
  if (active) tokens.push(token);
  return tokens;
}

function dateValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.getTime()
    : null;
}

export function compileMailSearch(query: string, accounts: Account[] = []): { matches: (mail: Mail) => boolean; error?: string } {
  const tokens = tokenize(query);
  if (!tokens) return { matches: () => false, error };
  const terms: SearchTerm[] = [];
  const lower = (value: string) => value.toLowerCase();

  for (const raw of tokens) {
    let token = raw;
    let negative = false;
    if (token.startsWith("-")) {
      negative = true;
      token = token.slice(1);
    }
    if (!token) return { matches: () => false, error };

    const colon = token.indexOf(":");
    const prefix = colon < 0 ? "" : token.slice(0, colon).toLowerCase();
    const value = colon < 0 ? "" : token.slice(colon + 1);
    if (fields.has(prefix) && !value) return { matches: () => false, error };

    let term: SearchTerm;
    if (prefix === "is") {
      const state = lower(value);
      if (state !== "read" && state !== "unread" && state !== "pinned") return { matches: () => false, error };
      term = state === "read" ? (mail) => !mail.unread
        : state === "unread" ? (mail) => mail.unread
        : (mail) => mail.pinned === true;
    } else if (prefix === "before" || prefix === "after") {
      const date = dateValue(value);
      if (date === null) return { matches: () => false, error };
      term = prefix === "before" ? (mail) => mail.date < date : (mail) => mail.date >= date;
    } else if (prefix === "account") {
      const needle = lower(value);
      const ids = new Set(accounts.filter((account) =>
        [account.id, account.email, account.name ?? ""].some((alias) => lower(alias) === needle),
      ).map((account) => account.id));
      term = (mail) => ids.has(mail.accountId);
    } else if (prefix === "from") {
      const needle = lower(value);
      term = (mail) => `${mail.sender} ${mail.address}`.toLowerCase().includes(needle);
    } else if (prefix === "to") {
      const needle = lower(value);
      term = (mail) => `${mail.to} ${mail.cc ?? ""}`.toLowerCase().includes(needle);
    } else if (prefix === "subject") {
      const needle = lower(value);
      term = (mail) => mail.subject.toLowerCase().includes(needle);
    } else if (prefix === "body") {
      const needle = lower(value);
      term = (mail) => mail.body.toLowerCase().includes(needle);
    } else {
      const needle = lower(raw.startsWith("-") ? token : raw);
      term = (mail) => `${mail.sender} ${mail.address} ${mail.to} ${mail.cc ?? ""} ${mail.subject} ${mail.preview} ${mail.body}`
        .toLowerCase().includes(needle);
    }
    terms.push(negative ? (mail) => !term(mail) : term);
  }

  return { matches: (mail) => terms.every((term) => term(mail)) };
}
