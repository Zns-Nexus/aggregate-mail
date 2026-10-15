import type { Account, Mail } from "../../shared/types";
import { Address, MailPrivacy, Redact } from "../ui/Privacy";
import { Avatar } from "./Avatar";
import { relative, relevanceNames } from "./format";

/** Sender context for the selected email, then recent mail from them and recently opened mail. */
export function SenderPanel({ selected, account, tab, senderMail, recentMail, onJump }: {
  selected: Mail | undefined;
  account: Account | undefined;
  tab: string;
  senderMail: Mail[];
  recentMail: Mail[];
  onJump: (mail: Mail) => void;
}) {
  return (
    <div className="context-pane" key={selected?.id ?? "none"}>
      {selected && (
        <MailPrivacy mail={selected}><div className="sender">
          <Avatar mail={selected} provider={account?.provider} large />
          <h2><Redact text={selected.sender} /></h2>
          <p className="sender-address"><Address value={selected.address} /></p>
          {account && (
            <p>Writes to your <Address value={account.email} /></p>
          )}
          <p className="dim">
            {senderMail.length} {senderMail.length === 1 ? "message" : "messages"}
          </p>
          {selected.reason && (
            <p className="sender-reason"><Redact text={selected.reason} /></p>
          )}
          <div className="tags">
            <span>{tab}</span>
            <span>{relevanceNames[selected.relevance]} relevance</span>
          </div>
        </div></MailPrivacy>
      )}
      {selected && senderMail.length > 1 && (
        <section className="context-list">
          <h3>
            Recent with{" "}
            <MailPrivacy mail={selected}><Redact text={selected.sender} /></MailPrivacy>
          </h3>
          {senderMail
            .filter((m) => m.id !== selected.id)
            .slice(0, 4)
            .map((m) => (
              <button key={m.id} onClick={() => onJump(m)}>
                <span><MailPrivacy mail={m}><Redact text={m.subject} /></MailPrivacy></span>
                <time>{relative(m.date)}</time>
              </button>
            ))}
        </section>
      )}
      {recentMail.length > 0 && (
        <section className="context-list">
          <h3>Recently opened</h3>
          {recentMail.slice(0, 4).map((m, i) => (
            <button key={m.id} onClick={() => onJump(m)}>
              <i>{i + 1}</i>
              <span><MailPrivacy mail={m}><Redact text={`${m.sender} · ${m.subject}`} /></MailPrivacy></span>
              <time>{relative(m.date)}</time>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
