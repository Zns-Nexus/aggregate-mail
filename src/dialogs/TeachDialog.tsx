import { useState } from "react";
import type { Category, Mail } from "../../shared/types";
import { Dialog } from "../ui/Dialog";
import { Address } from "../ui/Privacy";
import { Check } from "../ui/icons";

export function TeachDialog({
  mail,
  busy,
  onClose,
  onSave,
}: {
  mail: Mail;
  busy: boolean;
  onClose: () => void;
  onSave: (input: {
    sender: string;
    instruction: string;
    category: Category;
    relevance: number;
  }) => void;
}) {
  const [category, setCategory] = useState(mail.category);
  const [relevance, setRelevance] = useState(mail.relevance);
  const [instruction, setInstruction] = useState("");
  return (
    <Dialog title="Teach" onClose={onClose}>
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            sender: mail.address,
            category,
            relevance,
            instruction:
              instruction ||
              `${mail.sender} belongs in ${category} with ${relevance === 3 ? "high" : relevance === 2 ? "medium" : "low"} relevance.`,
          });
        }}
      >
        <p className="dialog-copy">
          Applies to existing and future mail from{" "}
          <strong>
            <Address value={mail.address} />
          </strong>
          .
        </p>
        <label>
          Send to
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            <option value="important">Primary</option>
            <option value="other">Sort by type</option>
          </select>
        </label>
        <label>
          Relevance
          <select
            value={relevance}
            onChange={(e) => setRelevance(Number(e.target.value) as 1 | 2 | 3)}
          >
            <option value={3}>High · two-line row</option>
            <option value={2}>Medium · standard row</option>
            <option value={1}>Low · compact row</option>
          </select>
        </label>
        <label>
          Reason
          <input
            placeholder="Why this mail matters to you"
            value={instruction}
            maxLength={500}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </label>
        <div className="form-actions">
          <span>Sender rules take priority over AI.</span>
          <button className="button" disabled={busy}>
            Save rule <Check color="currentColor" size={12} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
