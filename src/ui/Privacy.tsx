import { Fragment, createContext, memo, useContext, useMemo, type ReactNode } from "react";
import type { Account, Mail } from "../../shared/types";
import { collectPrivateNames, segmentPrivateText, type PrivacySegment } from "../privacy";

// Hidden tokens have no private text in the DOM until explicitly revealed.
export const PrivacyContext = createContext<{
  on: boolean;
  revealed: Set<string>;
  toggle: (value: string) => void;
  accounts?: readonly Account[];
  names?: readonly string[];
}>({ on: false, revealed: new Set(), toggle() {} });
export function MailPrivacy({ mail, children }: { mail: Mail; children: ReactNode }) {
  const context = useContext(PrivacyContext);
  const value = useMemo(() => ({ ...context, names: collectPrivateNames(context.accounts || [], mail) }), [context, mail]);
  return <PrivacyContext.Provider value={value}>
    {children}
  </PrivacyContext.Provider>;
}
export function Address({ value, children, kind = "address" }: { value: string; children?: ReactNode; kind?: "address" | "name" }) {
  const { on, revealed, toggle } = useContext(PrivacyContext);
  const key = value.toLowerCase();
  if (!on) return <>{children ?? value}</>;
  const shown = revealed.has(key);
  const activate = () => toggle(key);
  return <span className={shown ? "address" : "address veiled"}
    style={shown ? undefined : { width: "8ch" }} role="button" tabIndex={0}
    aria-label={shown ? `Hide ${kind}` : `Reveal hidden ${kind}`}
    title={shown ? `Click to hide this ${kind}` : `Click to reveal ${kind}`}
    onClick={(event) => { event.stopPropagation(); activate(); }}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); event.stopPropagation(); activate();
      }
    }}>
    {shown ? children ?? value : null}
  </span>;
}
export const Redact = memo(function Redact({ text, segments }: { text: string; segments?: readonly PrivacySegment[] }) {
  const { on, names } = useContext(PrivacyContext);
  if (!on || !text) return <>{text}</>;
  return <>{(segments ?? segmentPrivateText(text, names)).map((part, index) => part.kind === "text" ?
    <Fragment key={index}>{segments ? <Redact text={part.text} /> : part.text}</Fragment> :
    <Address key={index} value={segments ? part.value ?? part.text : part.text} kind={part.kind}>{part.text}</Address>)}</>;
});
