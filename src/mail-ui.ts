import type { MailLocation } from "./navigation";
import type { GmailLabel, Mail } from "../shared/types";

export function densityShortcut(event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "metaKey">) {
  if (!event.ctrlKey || event.altKey || event.metaKey) return null;
  if (["+", "=", "Add"].includes(event.key) || event.code === "NumpadAdd") return "comfortable";
  if (["-", "Subtract"].includes(event.key) || event.code === "NumpadSubtract") return "compact";
  return null;
}

export function matchesLabel(mail: Mail, label?: GmailLabel) {
  return !label || (mail.accountId === label.accountId && !!mail.labelIds?.includes(label.id));
}

export function customLabels(mail: Mail, labels: GmailLabel[]) {
  return labels.filter((label) => label.accountId === mail.accountId && label.type === "user");
}

export function selectedMail(messages: Mail[], filtered: Mail[], id: string | null, opened: boolean) {
  return opened && id ? messages.find((mail) => mail.id === id)
    : filtered.find((mail) => mail.id === id) || filtered[0];
}

// Explicit read and read-on-open share pending requests; the server orders them after sync.
export async function markMailRead(mail: Mail, pending: Set<string>, update: () => Promise<unknown>) {
  if (!mail.unread || pending.has(mail.id)) return;
  pending.add(mail.id);
  try {
    await update();
  } finally {
    pending.delete(mail.id);
  }
}

export function filterMail(messages: Mail[], location: Pick<MailLocation,
  "view" | "accountFilter" | "query" | "readFilter" | "relevanceFilter" | "sort">,
  label?: GmailLabel, now = Date.now(), readerId?: string) {
  const query = location.query.toLowerCase();
  return messages.filter((mail) => {
    // The open reader stays an ordering anchor after read-on-open removes it from the list.
    if (mail.id === readerId) return true;
    if (location.accountFilter !== "all" && mail.accountId !== location.accountFilter) return false;
    if (!matchesLabel(mail, label)) return false;
    if (location.readFilter === "unread" && !mail.unread) return false;
    if (location.relevanceFilter !== "all" && mail.relevance !== Number(location.relevanceFilter)) return false;
    const snoozed = mail.snoozedUntil !== null && mail.snoozedUntil > now;
    if (location.view === "archive" ? !mail.archived : location.view === "snoozed"
      ? mail.archived || !snoozed : mail.archived || snoozed || mail.category !== location.view) return false;
    return `${mail.sender} ${mail.address} ${mail.subject} ${mail.body}`.toLowerCase().includes(query);
  }).sort((a, b) => {
    const relevance = location.sort === "relevance" ? b.relevance - a.relevance : 0;
    const date = location.sort === "oldest" ? a.date - b.date : b.date - a.date;
    return relevance || date || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
