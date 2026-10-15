import type { Dispatch, SetStateAction } from "react";
import type { Account } from "../../shared/types";
import { Dialog } from "../ui/Dialog";

export type Compose = {
  accountId: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  threadId?: string;
  references?: string[];
  sendUnknown?: boolean;
};
export const unknownSendNotice =
  "Send status unknown. This message may already have been sent. Sending again may send a duplicate.";

export async function sendCompose(
  draft: Compose,
  { lock, send, reload, setDraft, setBusy, setNotice, confirm }: {
    lock: { current: boolean };
    send: (draft: Compose) => Promise<{ warning?: string }>;
    reload: () => Promise<unknown>;
    setDraft: Dispatch<SetStateAction<Compose | null>>;
    setBusy: (busy: boolean) => void;
    setNotice: (notice: string) => void;
    confirm: (message: string) => boolean;
  },
) {
  if (lock.current) return;
  if (
    draft.sendUnknown &&
    !confirm("This message may already have been sent. Sending again may send a duplicate. Send again?")
  )
    return;
  lock.current = true;
  setBusy(true);
  try {
    const result = await send(draft);
    setDraft(null);
    const sentNotice = result.warning || "Email sent.";
    setNotice(sentNotice);
    try {
      await reload();
    } catch {
      setNotice(`${sentNotice}\nInbox refresh failed. Refresh the inbox separately.`);
    }
  } catch {
    setDraft((current) =>
      current ? { ...current, sendUnknown: true } : current,
    );
    setNotice(unknownSendNotice);
  } finally {
    lock.current = false;
    setBusy(false);
  }
}
export function ComposePanel({
  draft,
  setDraft,
  accounts,
  busy,
  onClose,
  onSend,
}: {
  draft: Compose;
  setDraft: (value: Compose) => void;
  accounts: Account[];
  busy: boolean;
  onClose: () => void;
  onSend: () => void;
}) {
  return (
    <Dialog
      title={draft.inReplyTo ? "Reply" : "New message"}
      onClose={() => {
        if (busy) return;
        if (
          draft.sendUnknown
            ? confirm("Discard this draft? This message may already have been sent.")
            : !(draft.body || draft.to || draft.subject) || confirm("Discard this unsent draft?")
        )
          onClose();
      }}
    >
      <form
        className="compose-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!e.currentTarget.reportValidity()) return;
          onSend();
        }}
      >
        <label>
          From
          <select
            value={draft.accountId}
            onChange={(e) =>
              setDraft({
                ...draft,
                accountId: e.target.value,
                threadId: undefined,
              })
            }
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <input
            type="email"
            required
            value={draft.to}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          />
        </label>
        <label>
          Subject
          <input
            value={draft.subject}
            maxLength={998}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          />
        </label>
        <textarea
          aria-label="Message body"
          placeholder="Write your message"
          required
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
        {draft.sendUnknown && (
          <p className="dialog-copy" role="status">{unknownSendNotice}</p>
        )}
        <div className="form-actions">
          <span>
            Plain text ·{" "}
            {draft.inReplyTo
              ? "Reply from the original account"
              : "Send from the selected account"}
          </span>
          <button className="button" disabled={busy} type="submit">
            {busy ? "Sending" : "Send"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
