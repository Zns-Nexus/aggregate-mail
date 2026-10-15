import { useContext, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import type { Account, Mail } from "../../shared/types";
import type { InteractionPreferences } from "../interaction";
import type { MailLocation } from "../navigation";
import { collectPrivateNames, redactPrivateText } from "../privacy";
import { MailPrivacy, PrivacyContext, Redact } from "../ui/Privacy";
import { Trash } from "../ui/icons";
import { Avatar } from "./Avatar";
import { dayGroup, relative, shortLabel } from "./format";

type RowLayout = "inline" | "stacked" | "brief" | "card";

/**
 * Mail rows under sticky date headings. Wide lists keep sender and subject on
 * one line, with height following relevance. Beside the reader the list is
 * narrow, so each row becomes a card: sender and time, subject, then a
 * preview for medium and high relevance.
 */
export function MailList({
  messages, selectedId, density, narrow, sort, opening, accounts, disabled,
  onOpen, onSelect, onMenu, onMenuKey, onTrash, trashUnavailable,
}: {
  messages: Mail[];
  selectedId: string | undefined;
  density: "comfortable" | "compact";
  narrow: boolean;
  sort: MailLocation["sort"];
  opening: InteractionPreferences["opening"];
  accounts: Account[];
  disabled: boolean;
  onOpen: (mail: Mail) => void;
  onSelect: (id: string) => void;
  onMenu: (event: MouseEvent<HTMLElement>, mail: Mail) => void;
  onMenuKey: (event: KeyboardEvent<HTMLElement>, mail: Mail) => void;
  onTrash: (mail: Mail) => void;
  trashUnavailable: (mail: Mail) => string | undefined;
}) {
  const { on: privacy } = useContext(PrivacyContext);
  const provider = (mail: Mail) => accounts.find((account) => account.id === mail.accountId)?.provider;
  return messages.map((m, i) => {
    const group = dayGroup(m.date);
    const showGroup = sort !== "relevance" && (i === 0 || dayGroup(messages[i - 1].date) !== group);
    const layout: RowLayout = narrow
      ? "card"
      : density === "compact" || m.relevance === 2
        ? "inline"
        : m.relevance === 3
          ? "stacked"
          : "brief";
    const current = m.id === selectedId;
    const names = privacy ? collectPrivateNames(accounts, m) : [];
    const reason = privacy ? redactPrivateText(m.reason, names) : m.reason;
    const label = `${m.unread ? "Unread: " : ""}${m.sender}, ${m.subject}`;
    const reasonLabel = m.relevance === 3 && reason && (
      <span className="row-label" title={reason}>
        <Redact text={shortLabel(reason)} />
      </span>
    );
    const time = <time>{relative(m.date)}</time>;
    const unavailable = trashUnavailable(m);
    return (
      <MailPrivacy key={m.id} mail={m}>
        {showGroup && <h3 className="group">{group}</h3>}
        <div className="mail-row">
          <button
            id={`mail-${m.id}`}
            className={`row r${m.relevance} ${layout}${current ? " selected" : ""}${m.unread ? " unread" : ""}`}
            onClick={(event) => opening === "single" ?
              (event.detail <= 1 && onOpen(m)) : onSelect(m.id)}
            onDoubleClick={() => { if (opening === "double") onOpen(m); }}
            onContextMenu={(event) => onMenu(event, m)}
            onKeyDown={(event) => onMenuKey(event, m)}
            aria-haspopup="menu"
            aria-label={privacy ? redactPrivateText(label, names) : label}
            aria-current={current ? "true" : undefined}
            style={{ "--i": Math.min(i, 6) } as CSSProperties}
          >
            {m.unread && <i className="unread-dot" aria-hidden="true" />}
            <Avatar mail={m} provider={provider(m)} />
            {layout === "card" ? (
              <span className="row-text">
                <span className="row-line">
                  <strong><Redact text={m.sender} /></strong>
                  {reasonLabel}
                  {time}
                </span>
                <span className="row-subject"><Redact text={m.subject || "(no subject)"} /></span>
                {density === "comfortable" && m.relevance > 1 && (
                  <span className="row-preview"><Redact text={m.preview} /></span>
                )}
              </span>
            ) : (
              <>
                <span className="row-text">
                  <span className="row-line">
                    <strong><Redact text={m.sender} /></strong>
                    <span className="row-subject"><Redact text={m.subject} /></span>
                    {layout === "inline" && (
                      <span className="row-preview"><Redact text={m.preview} /></span>
                    )}
                  </span>
                  {layout === "stacked" && (
                    <span className="row-preview"><Redact text={m.preview} /></span>
                  )}
                </span>
                {reasonLabel}
                {time}
              </>
            )}
          </button>
          <button type="button" className="row-trash trash-action"
            aria-label="Move to Trash"
            aria-description={unavailable}
            title={unavailable || "Move to Trash"}
            disabled={disabled || !!unavailable}
            onClick={() => onTrash(m)}>
            <Trash size={16} />
          </button>
        </div>
      </MailPrivacy>
    );
  });
}
