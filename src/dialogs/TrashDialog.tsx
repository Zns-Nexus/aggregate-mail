import { Dialog } from "../ui/Dialog";

/** Confirms Move to Trash. It names no subject or address. */
export function TrashDialog({ busy, syncing, onConfirm, onClose }: {
  busy: boolean;
  syncing: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="Move to Trash" onClose={onClose}>
      <p className="dialog-copy">Move this email to your provider’s Trash? It will be removed from this inbox. This does not permanently delete it.</p>
      <div className="form-actions">
        <button type="button" className="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className="button trash-action" disabled={busy || syncing} aria-busy={busy}
          onClick={onConfirm}>{busy ? "Moving to Trash…" : "Move to Trash"}</button>
      </div>
    </Dialog>
  );
}
