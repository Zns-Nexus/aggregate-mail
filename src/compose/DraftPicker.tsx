import { useContext, useEffect, useState } from "react";
import type { Account, Draft, DraftSummary } from "../../shared/types";
import type { Api } from "../api";
import { Dialog } from "../ui/Dialog";
import { PrivacyContext, Redact } from "../ui/Privacy";

export function DraftPicker({ accounts, api, onOpen, onClose }: {
  accounts: Account[];
  api: Api;
  onOpen: (draft: Draft) => void;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const { on: privateText } = useContext(PrivacyContext);
  useEffect(() => {
    let stopped = false;
    setLoading(true);
    setError("");
    void Promise.all(accounts.map((account) => api<DraftSummary[]>(
      `/accounts/${encodeURIComponent(account.id)}/drafts`,
    ))).then((lists) => {
      if (!stopped) setDrafts(lists.flat().sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)));
    }).catch(() => {
      if (!stopped) setError("Saved drafts could not be loaded. Try again when the local service is available.");
    }).finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, [accounts, api, attempt]);
  const open = async (summary: DraftSummary) => {
    if (opening) return;
    setOpening(true);
    try {
      const draft = await api<Draft>(`/accounts/${encodeURIComponent(summary.accountId)}/drafts/${encodeURIComponent(summary.id)}`);
      onOpen(draft);
    } catch {
      setError("This draft could not be opened. Refresh the list to check whether it changed or was removed.");
      setOpening(false);
    }
  };
  return <Dialog title="Saved drafts" onClose={() => { if (!opening) onClose(); }}>
    <p className="dialog-copy">Saved on this device. Opening a draft never sends it.</p>
    {loading ? <p role="status">Loading drafts...</p> : error ? <>
      <p className="dialog-copy" role="alert">{error}</p>
      <button className="button" onClick={() => setAttempt((value) => value + 1)}>Refresh drafts</button>
    </> : drafts.length ? <ul className="saved-drafts">
      {drafts.map((draft, index) => <li key={draft.id}>
        <button disabled={opening} onClick={() => void open(draft)}>
          <strong>{privateText ? `Draft ${index + 1}` : <Redact text={draft.subject || "No subject"} />}</strong>
          <span>{privateText ? `Account ${accounts.findIndex((account) => account.id === draft.accountId) + 1}` :
            <Redact text={draft.to || "No recipient"} />}</span>
          {draft.sendUnknown && <span>Send status unknown. May already have been sent.</span>}
        </button>
      </li>)}
    </ul> : <p className="dialog-copy">No saved drafts.</p>}
  </Dialog>;
}
