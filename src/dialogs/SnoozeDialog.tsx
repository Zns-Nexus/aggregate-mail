import type { Mail } from "../../shared/types";
import { Dialog } from "../ui/Dialog";
import { MailPrivacy, Redact } from "../ui/Privacy";

/** Snooze choices for one email, plus Return to inbox now when it is already snoozed. */
export function SnoozeDialog({ mail, busy, onSnooze, onUnsnooze, onClose }: {
  mail: Mail;
  busy: boolean;
  onSnooze: (until: number) => void;
  onUnsnooze: () => void;
  onClose: () => void;
}) {
  const options = [
    { label: "In one hour", until: Date.now() + 3600000 },
    { label: "Tomorrow morning", until: new Date(new Date().setHours(9, 0, 0, 0)).getTime() + 86400000 },
    { label: "In one week", until: Date.now() + 7 * 86400000 },
  ];
  return (
    <MailPrivacy mail={mail}><Dialog title="Snooze" onClose={onClose}>
      <p className="dialog-copy">
        <Redact text={mail.subject} />
      </p>
      {options.map((option) => (
        <button className="option" key={option.label} disabled={busy} onClick={() => onSnooze(option.until)}>
          {option.label}
          <span>{new Date(option.until).toLocaleString()}</span>
        </button>
      ))}
      {mail.snoozedUntil && (
        <button className="option" disabled={busy} onClick={onUnsnooze}>
          Return to inbox now
        </button>
      )}
    </Dialog></MailPrivacy>
  );
}
