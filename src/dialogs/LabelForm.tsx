import { useState } from "react";
import type { GmailLabel, Mail } from "../../shared/types";
import { Redact } from "../ui/Privacy";

export function LabelForm({ mail, labels, busy, onSave }: {
  mail: Mail;
  labels: GmailLabel[];
  busy: boolean;
  onSave: (labelIds: string[]) => void;
}) {
  const [selected, setSelected] = useState(() => new Set(mail.labelIds || []));
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      onSave(labels.filter((label) => selected.has(label.id)).map((label) => label.id));
    }}>
      <div className="label-options">
        {labels.length ? labels.map((label) => (
          <label key={label.id}>
            <input type="checkbox" checked={selected.has(label.id)} disabled={busy} onChange={(event) => {
              setSelected((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(label.id);
                else next.delete(label.id);
                return next;
              });
            }} />
            <Redact text={label.name} />
          </label>
        )) : <p className="note">Create labels in Gmail, then sync this account.</p>}
      </div>
      <div className="form-actions">
        <button className="button" disabled={busy || !labels.length}>Save labels</button>
      </div>
    </form>
  );
}
