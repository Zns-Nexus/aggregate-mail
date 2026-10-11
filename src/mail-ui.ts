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
