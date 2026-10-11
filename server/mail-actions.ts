import { z } from "zod";
import { all, account, put } from "./store.js";
import { providers, sendSchema, SentCopyError } from "./providers.js";

export const messageActionSchema = z.object({
  action: z.enum(["read", "archive", "snooze", "unsnooze"]),
  until: z
    .number()
    .int()
    .refine(
      (until) => until >= Date.now() && until <= Date.now() + 366 * 86400000,
      "Choose a snooze time within the next year.",
    )
    .optional(),
});

export function findMail(id: string) {
  const mail = all("mail").find((m) => m.id === id);
  if (!mail) throw new Error("Message not found.");
  return mail;
}

export async function updateMessage(
  id: string,
  input: z.infer<typeof messageActionSchema>,
) {
  let m = findMail(id);
  if (
    input.action === "snooze" &&
    (!input.until ||
      input.until < Date.now() ||
      input.until > Date.now() + 366 * 86400000)
  )
    throw new Error("Choose a snooze time within the next year.");
  if (input.action === "read" || input.action === "archive") {
    const a = account(m.accountId);
    await providers[a.provider].update(a, m, input.action);
    // Preserve image metadata and local changes saved during the provider wait.
    m = findMail(id);
  }
  const updated = {
    ...m,
    unread: input.action === "read" ? false : m.unread,
    archived: input.action === "archive" || m.archived,
    snoozedUntil:
      input.action === "snooze"
        ? input.until!
        : input.action === "unsnooze"
          ? null
          : m.snoozedUntil,
  };
  put("mail", m.id, updated);
  return updated;
}

export async function sendMail(value: unknown) {
  const input = sendSchema.parse(value);
  const a = account(input.accountId);
  try {
    await providers[a.provider].send(a, input);
  } catch (error) {
    if (error instanceof SentCopyError)
      return { ok: true, warning: error.message };
    throw error;
  }
  return { ok: true };
}
