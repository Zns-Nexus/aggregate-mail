import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowDown2,
  ArrowRight,
  Check,
  CloseCircle,
  Cloud,
  Eye,
  EyeSlash,
  SearchNormal1,
  Settings,
  Sms as MailIcon,
} from "iconsax-react";
import { appPasswordHelp, jevProviders, logoDomain, providerNames } from "../shared/types";
import type {
  Account,
  Category,
  JevProvider,
  LogoSummary,
  Mail,
  Provider,
  State,
  McpSettings,
} from "../shared/types";

type View = Category | "snoozed" | "archive";
const viewOrder: View[] = ["important", "other", "snoozed", "archive"];
// Direction the list pane enters from: tabs slide sideways, mail opens upward.
type Motion = "forward" | "back" | "open" | "close";
type Compose = {
  accountId: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  threadId?: string;
  references?: string[];
};
const empty: State = {
  accounts: [],
  messages: [],
  rules: [],
  googleConfigured: false,
  googleClientId: null,
  jevConfigured: false,
  jevProvider: "typesafe",
  aiConfigured: false,
  lastSync: null,
};
type ImapProvider = Exclude<Provider, "gmail">;
const viewNames: Record<View, string> = {
  important: "Important",
  other: "Other",
  snoozed: "Snoozed",
  archive: "Archive",
};
const relevanceNames = ["", "Low", "Medium", "High"];
const relative = (date: number) => {
  const minutes = Math.max(0, Math.floor((Date.now() - date) / 60000));
  return minutes < 1
    ? "now"
    : minutes < 60
      ? `${minutes}m`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h`
        : `${Math.floor(minutes / 1440)}d`;
};
const trailingWords = new Set([
  "a",
  "an",
  "and",
  "or",
  "the",
  "to",
  "of",
  "for",
  "your",
  "with",
]);
const shortLabel = (reason: string) => {
  const words = reason.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    if ([...kept, word].join(" ").length > 14) break;
    kept.push(word);
  }
  while (
    kept.length > 1 &&
    trailingWords.has(kept[kept.length - 1].toLowerCase())
  )
    kept.pop();
  return kept.length ? kept.join(" ") : (words[0] ?? "");
};

const dayGroup = (date: number) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 86400000;
  if (date >= start.getTime()) return "Today";
  if (date >= start.getTime() - day) return "Yesterday";
  if (date >= start.getTime() - 6 * day) return "This week";
  if (date >= start.getTime() - 30 * day) return "This month";
  return "Earlier";
};
// Privacy blurs email addresses until each one is clicked.
export const PrivacyContext = createContext({
  on: false,
  revealed: new Set<string>(),
  toggle: (_address: string) => {},
});
const addressPattern = /[^\s<>()"',;:]+@[^\s<>()"',;:]+\.[a-z]{2,}/gi;
const hideAddresses = (text: string) => text.replace(addressPattern, "••••••••");
// Windows and Linux have no traffic lights, so the window runs frameless and
// these drive it over IPC. macOS keeps its native lights.
// Guarded so the module still loads under Node for the renderer tests.
const drawsWindowControls =
  typeof window !== "undefined" &&
  !!window.desktop &&
  window.desktop.platform !== "darwin";
function TrafficLights({
  right,
  maximized,
}: {
  right?: boolean;
  maximized: boolean;
}) {
  const desktop = window.desktop;
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    setFocused(document.hasFocus());
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  if (!desktop || !drawsWindowControls) return null;
  const controls = [
    { command: "close", className: "close", label: "Close window" },
    {
      command: "maximize",
      className: "zoom",
      label: maximized ? "Restore window" : "Maximize window",
    },
    { command: "minimize", className: "minimize", label: "Minimize window" },
  ] as const;
  return (
    <div
      className={`traffic${right ? " right" : ""}${focused ? "" : " inactive"}`}
    >
      {controls.map((control) => (
        <button
          key={control.command}
          className={control.className}
          aria-label={control.label}
          onClick={() => desktop.windowCommand(control.command)}
        />
      ))}
    </div>
  );
}
function Address({ value, children }: { value: string; children?: ReactNode }) {
  const { on, revealed, toggle } = useContext(PrivacyContext);
  const key = value.toLowerCase();
  if (!on) return <>{children ?? value}</>;
  const shown = revealed.has(key);
  return (
    <span
      className={shown ? "address" : "address veiled"}
      title={shown ? "Click to blur this address" : "Click to reveal"}
      onClick={(e) => {
        e.stopPropagation();
        toggle(key);
      }}
    >
      {children ?? value}
    </span>
  );
}
// Blurs every address inside free text such as names, subjects and bodies.
function Redact({ text }: { text: string }) {
  const { on } = useContext(PrivacyContext);
  if (!on || !text) return <>{text}</>;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(addressPattern)) {
    parts.push(text.slice(last, match.index));
    parts.push(<Address key={match.index} value={match[0]} />);
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
export function MessageBody({ text }: { text: string }) {
  const { on } = useContext(PrivacyContext);
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(/\bhttps?:\/\/[^\s<>"'“”‘’]+/gi)) {
    if (match.index > 0 && /[\w:/]/.test(text[match.index - 1])) continue;
    let url = match[0];
    // Keep balanced URL delimiters, but leave prose wrappers outside the link.
    let parentheses = url.split(")").length - url.split("(").length;
    let brackets = url.split("]").length - url.split("[").length;
    while (
      /[.,;:!?]$/.test(url) ||
      (url.endsWith(")") && parentheses > 0) ||
      (url.endsWith("]") && brackets > 0)
    ) {
      if (url.endsWith(")")) parentheses--;
      else if (url.endsWith("]")) brackets--;
      url = url.slice(0, -1);
    }
    try {
      const parsed = new URL(url);
      if (!parsed.hostname || /\\|%(?![\da-f]{2})/i.test(url)) continue;
    } catch {
      continue;
    }
    parts.push(<Redact key={`text-${match.index}`} text={text.slice(last, match.index)} />);
    let decoded = url;
    try {
      decoded = decodeURIComponent(url);
    } catch {
      // Non-UTF-8 bytes must not hide percent-encoded addresses from privacy.
      decoded = url.replace(/%([\da-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    }
    const privateAddress = on && hideAddresses(decoded) !== decoded;
    parts.push(privateAddress ? (
      <Redact key={match.index} text={hideAddresses(decoded)} />
    ) : (
      <a key={match.index} href={url} target="_blank" rel="noopener noreferrer">{url}</a>
    ));
    last = match.index + url.length;
  }
  parts.push(<Redact key="tail" text={text.slice(last)} />);
  return <>{parts}</>;
}
function ProviderIcon({ provider }: { provider: Provider }) {
  return (
    <span className={`provider-icon ${provider === "gmail-imap" ? "gmail" : provider}`} aria-hidden="true">
      {provider === "icloud" ? (
        <Cloud color="currentColor" variant="Bold" />
      ) : provider === "imap" ? (
        <MailIcon color="currentColor" />
      ) : (
        <b>
          {provider === "gmail" || provider === "gmail-imap" ? "M" : provider === "fastmail" ? "F" : "y!"}
        </b>
      )}
    </span>
  );
}
function Avatar({
  mail,
  provider,
  large,
}: {
  mail: Mail;
  provider?: Provider;
  large?: boolean;
}) {
  const domain = logoDomain(mail.address);
  const [broken, setBroken] = useState(false);
  return (
    <span className={large ? "avatar large" : "avatar"} aria-hidden="true">
      {domain && !broken ? (
        <img
          className="avatar-logo"
          src={`/api/logo/${domain}`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="avatar-letter">
          {mail.sender.slice(0, 1).toUpperCase()}
        </span>
      )}
      {provider && <ProviderIcon provider={provider} />}
    </span>
  );
}

export function App() {
  const [state, setState] = useState(empty);
  const [view, setView] = useState<View>("important");
  const [accountFilter, setAccountFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [settings, setSettings] = useState(false);
  const [connecting, setConnecting] = useState<ImapProvider | "choose" | null>(null);
  const [opened, setOpened] = useState(false);
  const [compose, setCompose] = useState<Compose | null>(null);
  const [teach, setTeach] = useState<Mail | null>(null);
  const [snooze, setSnooze] = useState<Mail | null>(null);
  const [shortcuts, setShortcuts] = useState(false);
  const [motion, setMotion] = useState<Motion>("forward");
  // Privacy blurs email addresses; re-enabling it hides revealed ones again.
  const [privacy, setPrivacy] = useState(
    () => localStorage.getItem("privacy") === "on",
  );
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  // Clicking an address toggles just that one; the eye hides every revealed one.
  const toggleAddress = (address: string) =>
    setRevealed((current) => {
      const next = new Set(current);
      if (!next.delete(address)) next.add(address);
      return next;
    });
  const togglePrivacy = () => {
    localStorage.setItem("privacy", privacy ? "off" : "on");
    if (!privacy) setRevealed(new Set());
    setPrivacy(!privacy);
  };
  const [maximized, setMaximized] = useState(false);
  useEffect(() => window.desktop?.onWindowState(setMaximized), []);
  const [windowSide, setWindowSide] = useState<"left" | "right">(() =>
    localStorage.getItem("window-controls") === "right" ? "right" : "left",
  );
  const placeWindowControls = (side: "left" | "right") => {
    localStorage.setItem("window-controls", side);
    setWindowSide(side);
  };
  const tabsRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{
    x: number;
    width: number;
    animate: boolean;
  } | null>(null);
  // Slide one underline between tabs instead of redrawing it per tab.
  const lastView = useRef(view);
  useLayoutEffect(() => {
    const active = tabsRef.current?.querySelector<HTMLElement>(
      ":scope > button.active",
    );
    if (!active) return;
    const x = active.offsetLeft;
    const width = active.offsetWidth;
    // Counts change the tab's width; only a tab change should animate.
    const moved = lastView.current !== view;
    lastView.current = view;
    setIndicator((current) =>
      current?.x === x && current.width === width
        ? current
        : { x, width, animate: moved },
    );
  }, [view]);
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const csrf = useRef("");
  const syncLock = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const api = useCallback(
    async <T,>(url: string, method = "GET", body?: unknown): Promise<T> => {
      const res = await fetch(`/api${url}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf.current,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = (await res.json()) as T & { error?: string };
      if (!res.ok) throw new Error(data.error || "Request failed. Try again.");
      return data;
    },
    [],
  );
  const reload = useCallback(async () => {
    const data = await api<State & { csrf: string }>("/state");
    csrf.current = data.csrf;
    setState(data);
    setLoaded(true);
    return data;
  }, [api]);
  const sync = useCallback(async () => {
    if (syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    try {
      const result = await api<{ errors: string[] }>("/sync", "POST");
      await reload();
      if (result.errors.length) setNotice(result.errors.join("\n"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }, [api, reload]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("error")) {
      setNotice(params.get("error")!);
      setSettings(true);
    }
    if (params.has("connected") || params.has("error"))
      history.replaceState({}, "", "/");
    void reload()
      .then((data) => {
        if (data.accounts.length) void sync();
      })
      .catch((error) => setNotice(error.message));
  }, [reload, sync]);
  useEffect(() => {
    if (!state.accounts.length) return;
    const timer = setInterval(() => void sync(), 300000);
    return () => clearInterval(timer);
  }, [state.accounts.length, sync]);
  useEffect(
    () =>
      window.desktop?.onAccountConnected((error) => {
        if (error) setNotice(error);
        else {
          setConnecting(null);
          void reload()
            .then(() => sync())
            .catch((error) => setNotice(error.message));
        }
      }),
    [reload, sync],
  );
  useEffect(
    () =>
      window.desktop?.onMailChanged(() => {
        void reload().catch((error) => setNotice(error.message));
      }),
    [reload],
  );
  const showSearch = () => {
    setSettings(false);
    setSearching(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const closeSearch = () => {
    setSearching(false);
    setQuery("");
  };
  const switchView = (next: View) => {
    if (next !== view)
      setMotion(
        viewOrder.indexOf(next) > viewOrder.indexOf(view) ? "forward" : "back",
      );
    setView(next);
    setOpened(false);
    setSelectedId(null);
  };
  const now = Date.now();
  const isSnoozed = (m: Mail) =>
    m.snoozedUntil !== null && m.snoozedUntil > now;
  const filtered = state.messages
    .filter((m) => {
      if (accountFilter !== "all" && m.accountId !== accountFilter)
        return false;
      if (
        view === "archive"
          ? !m.archived
          : view === "snoozed"
            ? m.archived || !isSnoozed(m)
            : m.archived || isSnoozed(m) || m.category !== view
      )
        return false;
      return `${m.sender} ${m.address} ${m.subject} ${m.body}`
        .toLowerCase()
        .includes(query.toLowerCase());
    })
    .sort((a, b) => b.date - a.date);
  const selected = filtered.find((m) => m.id === selectedId) || filtered[0];
  const accountOf = (m: Mail) =>
    state.accounts.find((a) => a.id === m.accountId);
  const selectedAccount = selected && accountOf(selected);
  const count = (category: Category) =>
    state.messages.filter(
      (m) =>
        !m.archived &&
        !isSnoozed(m) &&
        m.category === category &&
        (accountFilter === "all" || accountFilter === m.accountId),
    ).length;
  const snoozedCount = state.messages.filter(
    (m) => !m.archived && isSnoozed(m),
  ).length;
  const perform = async (task: () => Promise<unknown>, success?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      await reload();
      if (success) setNotice(success);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };
  const changeMessage = (
    mail: Mail,
    action: "read" | "archive" | "snooze" | "unsnooze",
    until?: number,
  ) =>
    perform(() =>
      api(`/messages/${encodeURIComponent(mail.id)}`, "PATCH", {
        action,
        until,
      }),
    );
  const openMail = (mail: Mail) => {
    setSelectedId(mail.id);
    setOpened(true);
    setRecent((ids) =>
      [mail.id, ...ids.filter((id) => id !== mail.id)].slice(0, 6),
    );
    if (mail.unread && !mail.archived) void changeMessage(mail, "read");
  };
  const jumpTo = (mail: Mail) => {
    setView(
      mail.archived ? "archive" : isSnoozed(mail) ? "snoozed" : mail.category,
    );
    setAccountFilter("all");
    setQuery("");
    openMail(mail);
  };
  const startCompose = (reply?: Mail) => {
    if (!state.accounts.length) {
      setConnecting("choose");
      return;
    }
    if (compose) return;
    setCompose({
      accountId:
        reply?.accountId ||
        (accountFilter !== "all" ? accountFilter : state.accounts[0].id),
      to: reply?.replyTo || reply?.address || "",
      subject: reply
        ? /^re:/i.test(reply.subject)
          ? reply.subject
          : `Re: ${reply.subject}`
        : "",
      body: "",
      inReplyTo: reply?.messageId,
      threadId: reply?.threadId,
      references: reply?.messageId
        ? [
            ...(reply.references || [])
              .filter((v) => v !== reply.messageId)
              .slice(-99),
            reply.messageId,
          ]
        : reply?.references,
    });
  };
  const archive = (mail: Mail) => {
    void changeMessage(mail, "archive");
    setOpened(false);
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      )
        return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") {
        setOpened(false);
        setTeach(null);
        setSnooze(null);
        setShortcuts(false);
        setSettings(false);
        return;
      }
      if (compose || teach || snooze || shortcuts || connecting) return;
      const inbox = !settings;
      if (event.key === "/") {
        event.preventDefault();
        showSearch();
      } else if (event.key === ",") setSettings((s) => !s);
      else if (event.key === "?") setShortcuts(true);
      else if (event.key === "c") startCompose();
      else if (event.key === "p") togglePrivacy();
      else if (inbox && event.key === "d")
        setDensity((d) => (d === "comfortable" ? "compact" : "comfortable"));
      else if (inbox && (event.key === "i" || event.key === "o"))
        switchView(event.key === "i" ? "important" : "other");
      else if (inbox && (event.key === "j" || event.key === "k")) {
        event.preventDefault();
        const index = filtered.findIndex((m) => m.id === selected?.id);
        const next =
          filtered[
            Math.max(
              0,
              Math.min(
                filtered.length - 1,
                index + (event.key === "j" ? 1 : -1),
              ),
            )
          ];
        if (next) setSelectedId(next.id);
      } else if (
        inbox &&
        event.key === "Enter" &&
        selected &&
        (!(target instanceof HTMLElement) ||
          !target.closest("button, a") ||
          target.closest(".row"))
      )
        openMail(selected);
      else if (inbox && event.key === "e" && selected && !busy)
        archive(selected);
      else if (inbox && event.key === "r" && selected) startCompose(selected);
      else if (inbox && event.key === "s" && selected) setSnooze(selected);
      else if (inbox && (event.key === "m" || event.key === "t") && selected)
        setTeach(selected);
      else if (inbox && event.key === "Tab" && target === document.body) {
        event.preventDefault();
        switchView(view === "important" ? "other" : "important");
      } else if (inbox && /^[0-9]$/.test(event.key)) {
        const a = state.accounts[Number(event.key) - 1];
        if (event.key === "0") setAccountFilter("all");
        else if (a) setAccountFilter(a.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  useEffect(() => {
    const handle = (e: BeforeUnloadEvent) => {
      if (compose?.body || compose?.to || compose?.subject) e.preventDefault();
    };
    window.addEventListener("beforeunload", handle);
    return () => window.removeEventListener("beforeunload", handle);
  }, [compose]);
  const senderMail = selected
    ? state.messages
        .filter((m) => m.address === selected.address)
        .sort((a, b) => b.date - a.date)
    : [];
  const recentMail = recent
    .map((id) => state.messages.find((m) => m.id === id))
    .filter((m): m is Mail => !!m);

  // Pick the entrance once per pane so re-renders never restart its animation.
  const paneKey =
    opened && selected
      ? `mail:${selected.id}`
      : `list:${view}:${accountFilter}`;
  const pane = useRef({ key: paneKey, motion });
  if (pane.current.key !== paneKey)
    pane.current = {
      key: paneKey,
      motion: paneKey.startsWith("mail:")
        ? "open"
        : pane.current.key.startsWith("mail:")
          ? "close"
          : motion,
    };
  // A new pane starts at its top; the next effect restores the chosen row.
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [paneKey]);
  useEffect(() => {
    const list = listRef.current;
    const row = selected
      ? document.getElementById(`mail-${selected.id}`)
      : null;
    if (!list || !row) return;
    // Vertical only: a horizontal adjustment would fight the pane's slide-in.
    const offset =
      row.getBoundingClientRect().top -
      list.getBoundingClientRect().top +
      list.scrollTop;
    if (offset < list.scrollTop) list.scrollTop = offset;
    else if (row.offsetHeight + offset > list.scrollTop + list.clientHeight)
      list.scrollTop = offset + row.offsetHeight - list.clientHeight;
  }, [selected?.id, paneKey]);
  return (
    <PrivacyContext.Provider
      value={{ on: privacy, revealed, toggle: toggleAddress }}
    >
      <div
        className={`app${window.desktop ? " desktop" : ""}${privacy ? " private" : ""}`}
        data-platform={window.desktop?.platform}
      >
        <header
          className="topbar"
          onDoubleClick={(event) => {
            // A frameless window gets no automatic maximize on the caption
            // area, so the header has to restore that convention itself.
            if (!window.desktop || !drawsWindowControls) return;
            if ((event.target as Element).closest("button, input, a, label"))
              return;
            window.desktop.windowCommand("maximize");
          }}
        >
          {windowSide === "left" && <TrafficLights maximized={maximized} />}
          {settings ? (
            <nav className="crumbs" aria-label="Breadcrumb">
              <button onClick={() => setSettings(false)}>
                <kbd>esc</kbd>
                {viewNames[view]}
              </button>
              <span aria-hidden="true">/</span>
              <strong>Settings</strong>
            </nav>
          ) : (
            <nav className="tabs" aria-label="Mail views" ref={tabsRef}>
              {indicator && (
                <span
                  className={
                    indicator.animate
                      ? "tab-indicator animate"
                      : "tab-indicator"
                  }
                  style={{
                    width: indicator.width,
                    transform: `translateX(${indicator.x}px)`,
                  }}
                  aria-hidden="true"
                />
              )}
              {(["important", "other"] as const).map((v) => (
                <button
                  key={v}
                  className={view === v ? "active" : undefined}
                  aria-current={view === v ? "page" : undefined}
                  onClick={() => switchView(v)}
                >
                  {viewNames[v]}
                  <span className="tab-count">{count(v)}</span>
                </button>
              ))}
              {(snoozedCount > 0 || view === "snoozed") && (
                <button
                  className={view === "snoozed" ? "active quiet" : "quiet"}
                  aria-current={view === "snoozed" ? "page" : undefined}
                  onClick={() => switchView("snoozed")}
                >
                  Snoozed
                  <span className="tab-count">{snoozedCount}</span>
                </button>
              )}
              <button
                className={view === "archive" ? "active quiet" : "quiet"}
                aria-current={view === "archive" ? "page" : undefined}
                onClick={() => switchView("archive")}
              >
                Archive
              </button>
            </nav>
          )}
          <div className="topbar-end">
            {!settings && (
              <nav className="accounts" aria-label="Filter accounts">
                <button
                  className={accountFilter === "all" ? "active" : undefined}
                  aria-pressed={accountFilter === "all"}
                  onClick={() => setAccountFilter("all")}
                >
                  <kbd>0</kbd>All
                </button>
                {state.accounts.map((a, i) => (
                  <button
                    key={a.id}
                    title={
                      privacy
                        ? providerNames[a.provider]
                        : a.error
                          ? `${a.email}: ${a.error}`
                          : a.email
                    }
                    className={accountFilter === a.id ? "active" : undefined}
                    aria-pressed={accountFilter === a.id}
                    onClick={() => {
                      setAccountFilter(a.id);
                      setSelectedId(null);
                      setOpened(false);
                    }}
                  >
                    {i < 9 && <kbd>{i + 1}</kbd>}
                    <ProviderIcon provider={a.provider} />
                    <span>
                      <Address value={a.email}>
                        {a.provider === "icloud"
                          ? "iCloud"
                          : a.email.split("@")[0]}
                      </Address>
                    </span>
                    {a.error && (
                      <i className="error-dot" aria-label="Needs attention" />
                    )}
                  </button>
                ))}
              </nav>
            )}
            {!settings &&
              (searching ? (
                <div className="search" role="search">
                  <SearchNormal1 color="currentColor" size={14} />
                  <input
                    ref={searchRef}
                    aria-label="Search all synced mail"
                    placeholder="Search mail"
                    value={query}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") closeSearch();
                    }}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setOpened(false);
                    }}
                  />
                  <button aria-label="Close search" onClick={closeSearch}>
                    <CloseCircle color="currentColor" size={13} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="sync"
                    disabled={syncing || !state.accounts.length}
                    onClick={() => void sync()}
                    title="Sync mail"
                  >
                    {syncing
                      ? "Syncing"
                      : state.lastSync
                        ? `Synced ${relative(state.lastSync)}`
                        : "Not synced"}
                  </button>
                  <button
                    className="icon"
                    aria-label="Search mail"
                    title="Search (/)"
                    onClick={showSearch}
                  >
                    <SearchNormal1 color="currentColor" size={15} />
                  </button>
                </>
              ))}
            <button
              className={privacy ? "icon on" : "icon"}
              aria-label={
                privacy ? "Show email addresses" : "Blur email addresses"
              }
              aria-pressed={privacy}
              title={
                privacy ? "Addresses hidden (p)" : "Hide email addresses (p)"
              }
              onClick={togglePrivacy}
            >
              {privacy ? <EyeSlash color="currentColor" size={15} /> : <Eye color="currentColor" size={15} />}
            </button>
            <button
              className="icon"
              aria-label={settings ? "Close settings" : "Settings"}
              aria-pressed={settings}
              onClick={() => setSettings((s) => !s)}
            >
              <Settings color="currentColor" size={15} />
            </button>
          </div>
          {windowSide === "right" && <TrafficLights right maximized={maximized} />}
        </header>
        {notice && (
          <div className="notice" role="status">
            <span>
              <Redact text={notice} />
            </span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <CloseCircle color="currentColor" size={12} />
            </button>
          </div>
        )}
        {settings ? (
          <SettingsPage
            state={state}
            busy={busy}
            perform={perform}
            api={api}
            onConnectAccount={setConnecting}
            onNotice={setNotice}
            windowSide={windowSide}
            onWindowSide={placeWindowControls}
          />
        ) : (
          <main className="workspace">
            <section
              ref={listRef}
              className={`list ${density}`}
              aria-label={`${viewNames[view]} mail`}
            >
              <div key={paneKey} className={`pane ${pane.current.motion}`}>
                {opened && selected ? (
                  <article className="message">
                    <button className="back" onClick={() => setOpened(false)}>
                      <kbd>esc</kbd>Back
                    </button>
                    <h1>
                      <Redact text={selected.subject || "(no subject)"} />
                    </h1>
                    <div className="message-from">
                      <Avatar
                        mail={selected}
                        provider={selectedAccount?.provider}
                      />
                      <div>
                        <strong>
                          <Redact text={selected.sender} />
                        </strong>
                        <span>
                          <Address value={selected.address} />
                        </span>
                        <span>
                          To <Redact text={selected.to} />
                        </span>
                      </div>
                      <time>{new Date(selected.date).toLocaleString()}</time>
                    </div>
                    <div className="message-body">
                      <MessageBody
                        text={
                          selected.body || "This email has no plain-text body."
                        }
                      />
                    </div>
                  </article>
                ) : filtered.length ? (
                  filtered.map((m, i) => {
                    const group = dayGroup(m.date);
                    const showGroup =
                      i === 0 || dayGroup(filtered[i - 1].date) !== group;
                    const layout =
                      density === "compact" || m.relevance === 2
                        ? "inline"
                        : m.relevance === 3
                          ? "stacked"
                          : "brief";
                    const current = m.id === selected?.id;
                    return (
                      <Fragment key={m.id}>
                        {showGroup && <h3 className="group">{group}</h3>}
                        <button
                          id={`mail-${m.id}`}
                          className={`row r${m.relevance} ${layout}${current ? " selected" : ""}${m.unread ? " unread" : ""}`}
                          onClick={() => setSelectedId(m.id)}
                          onDoubleClick={() => openMail(m)}
                          aria-label={`${m.unread ? "Unread: " : ""}${m.sender}, ${m.subject}`}
                          aria-current={current ? "true" : undefined}
                          style={{ "--i": Math.min(i, 6) } as CSSProperties}
                        >
                          <Avatar mail={m} provider={accountOf(m)?.provider} />
                          <span className="row-text">
                            <span className="row-line">
                              <strong>
                                <Redact text={m.sender} />
                              </strong>
                              <span className="row-subject">
                                <Redact text={m.subject} />
                              </span>
                              {layout === "inline" && (
                                <span className="row-preview">
                                  <Redact text={m.preview} />
                                </span>
                              )}
                            </span>
                            {layout === "stacked" && (
                              <span className="row-preview">
                                <Redact text={m.preview} />
                              </span>
                            )}
                          </span>
                          {m.relevance === 3 && (
                            <span className="row-label" title={m.reason}>
                              {shortLabel(m.reason)}
                            </span>
                          )}
                          <time>{relative(m.date)}</time>
                        </button>
                      </Fragment>
                    );
                  })
                ) : (
                  <div className="empty">
                    <p className="empty-title">
                      {!loaded
                        ? "Loading"
                        : !state.accounts.length
                          ? "No accounts connected"
                          : query
                            ? "No matching mail"
                            : view === "snoozed"
                              ? "No snoozed mail"
                              : view === "archive"
                                ? "No archived mail"
                                : `Nothing in ${viewNames[view]}`}
                    </p>
                    {loaded &&
                      (!state.accounts.length ? (
                        <button
                          className="link"
                          onClick={() => setConnecting("choose")}
                        >
                          Connect an account <ArrowRight color="currentColor" size={11} />
                        </button>
                      ) : query ? (
                        <p>Try a different sender, subject or phrase.</p>
                      ) : (
                        <button
                          className="link"
                          disabled={syncing}
                          onClick={() => void sync()}
                        >
                          {syncing ? "Syncing" : "Sync now"}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </section>
            <aside className="context" aria-label="Sender context">
              <div className="context-pane" key={selected?.id ?? "none"}>
                {selected && (
                  <div className="sender">
                    <Avatar
                      mail={selected}
                      provider={selectedAccount?.provider}
                      large
                    />
                    <h2>
                      <Redact text={selected.sender} />
                    </h2>
                    <p className="sender-address">
                      <Address value={selected.address} />
                    </p>
                    {selectedAccount && (
                      <p>
                        Writes to your <Address value={selectedAccount.email} />
                      </p>
                    )}
                    <p className="dim">
                      {senderMail.length}{" "}
                      {senderMail.length === 1 ? "message" : "messages"}
                    </p>
                    {selected.reason && (
                      <p className="sender-reason">{selected.reason}</p>
                    )}
                    <div className="tags">
                      <span>{viewNames[selected.category]}</span>
                      <span>
                        {relevanceNames[selected.relevance]} relevance
                      </span>
                    </div>
                  </div>
                )}
                {selected && senderMail.length > 1 && (
                  <section className="context-list">
                    <h3>
                      Recent with{" "}
                      <Redact text={selected.sender.split(" ")[0]} />
                    </h3>
                    {senderMail
                      .filter((m) => m.id !== selected.id)
                      .slice(0, 4)
                      .map((m) => (
                        <button key={m.id} onClick={() => jumpTo(m)}>
                          <span>
                            <Redact text={m.subject} />
                          </span>
                          <time>{relative(m.date)}</time>
                        </button>
                      ))}
                  </section>
                )}
                {recentMail.length > 0 && (
                  <section className="context-list">
                    <h3>Recently opened</h3>
                    {recentMail.slice(0, 4).map((m, i) => (
                      <button key={m.id} onClick={() => jumpTo(m)}>
                        <i>{i + 1}</i>
                        <span>
                          <Redact text={`${m.sender} · ${m.subject}`} />
                        </span>
                        <time>{relative(m.date)}</time>
                      </button>
                    ))}
                  </section>
                )}
              </div>
            </aside>
          </main>
        )}
        {connecting === "choose" ? (
          <Dialog title="Connect account" onClose={() => setConnecting(null)}>
            <p className="dialog-copy">Choose your email provider.</p>
            <ProviderChoices googleConfigured={state.googleConfigured} busy={busy || syncing} onChoose={setConnecting} />
          </Dialog>
        ) : connecting && (
          <ConnectDialog
            key={connecting}
            provider={connecting}
            busy={busy || syncing}
            onClose={() => setConnecting(null)}
            onBack={() => setConnecting("choose")}
            onConnect={async (input) => {
              await api("/accounts/imap", "POST", input);
              setConnecting(null);
              setNotice("Account connected. Syncing your inbox.");
              try {
                await reload();
                void sync();
              } catch {
                setNotice("Account connected, but refreshing the inbox failed. Reload the app to sync.");
              }
            }}
          />
        )}
        {compose && (
          <ComposePanel
            draft={compose}
            setDraft={setCompose}
            accounts={state.accounts}
            busy={busy}
            onClose={() => {
              if (busy) return;
              if (
                !(compose.body || compose.to || compose.subject) ||
                confirm("Discard this unsent draft?")
              )
                setCompose(null);
            }}
            onSend={() =>
              void perform(async () => {
                const result = await api<{ warning?: string }>(
                  "/send",
                  "POST",
                  compose,
                );
                setCompose(null);
                setNotice(result.warning || "Email sent.");
              })
            }
          />
        )}
        {teach && (
          <TeachDialog
            mail={teach}
            busy={busy}
            onClose={() => setTeach(null)}
            onSave={(input) =>
              void perform(async () => {
                await api("/rules", "POST", input);
                setTeach(null);
              }, "Sorting updated for this sender.")
            }
          />
        )}
        {snooze && (
          <Dialog title="Snooze" onClose={() => setSnooze(null)}>
            <p className="dialog-copy">
              <Redact text={snooze.subject} />
            </p>
            {[
              { label: "In one hour", until: Date.now() + 3600000 },
              {
                label: "Tomorrow morning",
                until:
                  new Date(new Date().setHours(9, 0, 0, 0)).getTime() +
                  86400000,
              },
              { label: "In one week", until: Date.now() + 7 * 86400000 },
            ].map((option) => (
              <button
                className="option"
                key={option.label}
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await api(
                      `/messages/${encodeURIComponent(snooze.id)}`,
                      "PATCH",
                      { action: "snooze", until: option.until },
                    );
                    setSnooze(null);
                    setOpened(false);
                  })
                }
              >
                {option.label}
                <span>{new Date(option.until).toLocaleString()}</span>
              </button>
            ))}
            {snooze.snoozedUntil && (
              <button
                className="option"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await api(
                      `/messages/${encodeURIComponent(snooze.id)}`,
                      "PATCH",
                      { action: "unsnooze" },
                    );
                    setSnooze(null);
                  })
                }
              >
                Return to inbox now
              </button>
            )}
          </Dialog>
        )}
        {shortcuts && (
          <Dialog
            title="Keyboard shortcuts"
            onClose={() => setShortcuts(false)}
          >
            <div className="shortcut-list">
              {[
                ["j / k", "Next / previous email"],
                ["Enter", "Open email"],
                ["Esc", "Back"],
                ["i / o / Tab", "Important / Other"],
                ["0–9", "Filter by account"],
                ["/", "Search"],
                ["c", "Compose"],
                ["r", "Reply"],
                ["e", "Done"],
                ["s", "Snooze"],
                ["m", "Teach sorting"],
                ["d", "Comfortable / Compact"],
                ["p", "Blur email addresses on / off"],
                [",", "Settings"],
                ["?", "Keyboard shortcuts"],
              ].map(([key, text]) => (
                <div key={key}>
                  <span>{text}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
          </Dialog>
        )}
      </div>
    </PrivacyContext.Provider>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (
      ref.current?.querySelector<HTMLElement>("input, select, textarea") ||
      ref.current?.querySelector<HTMLElement>("button")
    )?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close.current();
      }
      if (e.key !== "Tab") return;
      const controls = ref.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
      );
      if (!controls?.length) return;
      const first = controls[0],
        last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
      previous?.focus();
    };
  }, []);
  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="dialog-title">
          <h2>{title}</h2>
          <button className="icon" aria-label="Close dialog" onClick={onClose}>
            <CloseCircle color="currentColor" size={13} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function ComposePanel({
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
    <Dialog title={draft.inReplyTo ? "Reply" : "New message"} onClose={onClose}>
      <form
        className="compose-form"
        onSubmit={(e) => {
          e.preventDefault();
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
function TeachDialog({
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
            <option value="important">Important</option>
            <option value="other">Other</option>
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

type Api = <T>(url: string, method?: string, body?: unknown) => Promise<T>;
function ProviderChoices({ googleConfigured, busy, onChoose }: {
  googleConfigured: boolean;
  busy: boolean;
  onChoose: (provider: ImapProvider) => void;
}) {
  return (
    <>
      {googleConfigured && (
        <div className="provider-row">
          <ProviderIcon provider="gmail" />
          <strong>Gmail</strong>
          <span>Gmail and Workspace</span>
          {busy ? <span>Wait for the current action</span> : (
            <a className="action" href={window.desktop?.oauthUrl || "/api/oauth/google"}>
              Continue with Google <ArrowRight color="currentColor" size={11} />
            </a>
          )}
        </div>
      )}
      {(["gmail-imap", "icloud", "fastmail", "yahoo", "imap"] as const).map((provider) => (
        <div key={provider} className="provider-row">
          <ProviderIcon provider={provider} />
          <strong>{provider === "gmail-imap" ? "Gmail / Workspace" : providerNames[provider]}</strong>
          <span>{provider === "imap" ? "TLS IMAP and SMTP" : "Email and app password"}</span>
          <button className="action" disabled={busy} onClick={() => onChoose(provider)}>
            {provider === "gmail-imap" ? "Use app password" : "Connect"} <ArrowRight color="currentColor" size={11} />
          </button>
        </div>
      ))}
    </>
  );
}
export function SettingsPage({
  state,
  busy,
  perform,
  api,
  onConnectAccount,
  onNotice,
  windowSide,
  onWindowSide,
}: {
  state: State;
  busy: boolean;
  perform: (task: () => Promise<unknown>, success?: string) => Promise<void>;
  api: Api;
  onConnectAccount: (provider: ImapProvider) => void;
  onNotice: (text: string) => void;
  windowSide: "left" | "right";
  onWindowSide: (side: "left" | "right") => void;
}) {
  const privacy = useContext(PrivacyContext).on;
  return (
    <main className="settings">
      <div className="settings-column">
        <section>
          <h1>
            <span>1</span>Accounts
          </h1>
          <h2>Connected</h2>
          {state.accounts.length ? (
            state.accounts.map((a) => (
              <div className="account-row" key={a.id}>
                <ProviderIcon provider={a.provider} />
                <strong>
                  <Address value={a.email} />
                </strong>
                <span
                  className={a.error ? "attention" : undefined}
                  title={
                    a.error
                      ? privacy
                        ? hideAddresses(a.error)
                        : a.error
                      : undefined
                  }
                >
                  {a.error ? "Needs attention" : "Connected"}
                </span>
                <button
                  className="link"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        `Disconnect ${privacy ? hideAddresses(a.email) : a.email}? This removes its local mail cache. Your provider mailbox stays intact.`,
                      )
                    )
                      void perform(
                        () => api(`/accounts/${a.id}`, "DELETE"),
                        "Account disconnected.",
                      );
                  }}
                >
                  Disconnect
                </button>
              </div>
            ))
          ) : (
            <p className="muted">No accounts connected.</p>
          )}
          <h2>Connect account</h2>
          <ProviderChoices googleConfigured={state.googleConfigured} busy={busy} onChoose={onConnectAccount} />
        </section>
        <section>
          <h1>
            <span>2</span>Sorting
          </h1>
          <p className="note">
            {state.jevConfigured
              ? "Jev sorting is on. Sender, subject and preview text of new mail are sent to Jev."
              : state.aiConfigured
                ? "AI sorting is on. Sender, subject and preview text of new mail are sent to OpenAI."
                : "Local sorting is on. Add a Jev or OpenAI key under Connection to enable AI sorting."}{" "}
            Sender rules take priority. Use Teach on any email to correct it.
          </p>
          {state.rules.length ? (
            state.rules.map((rule) => (
              <div className="rule-row" key={rule.id}>
                <div>
                  <p>
                    <Redact text={rule.instruction} />
                  </p>
                  <span>
                    To {rule.category === "important" ? "Important" : "Other"} ·{" "}
                    <Redact text={rule.sender} /> ·{" "}
                    {relevanceNames[rule.relevance].toLowerCase()} relevance
                  </span>
                </div>
                <button
                  className="link"
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () => api(`/rules/${rule.id}`, "DELETE"),
                      "Rule removed. Local sorting reapplied.",
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p className="muted">
              No sender rules yet. Press <kbd>m</kbd> on any email to add one.
            </p>
          )}
        </section>
        <section>
          <h1>
            <span>3</span>Connection
          </h1>
          <details>
            <summary>Advanced connection setup</summary>
            {!state.googleConfigured && (
              <div className="setup">
                <ol>
                  <li>
                    In Google Cloud, enable the Gmail API and configure an OAuth
                    consent screen.
                  </li>
                  <li>
                    Create a Web application OAuth client. Add your email as a
                    test user.
                  </li>
                  <li>
                    Register this redirect URI:{" "}
                    <code>
                      {
                        new URL(
                          window.desktop?.oauthUrl || "/api/oauth/google",
                          location.origin,
                        ).href
                      }
                      /callback
                    </code>
                  </li>
                  <li>
                    Save the client ID and secret below, then use Continue with
                    Google.
                  </li>
                </ol>
                <a
                  className="action"
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Google Cloud <ArrowRight color="currentColor" size={11} />
                </a>
                <p className="muted">
                  Access requested: read mail, update labels and send mail.
                  Credentials stay on this computer.
                </p>
              </div>
            )}
            <ConfigurationForm
              api={api}
              perform={perform}
              busy={busy}
              googleConfigured={state.googleConfigured}
              googleClientId={state.googleClientId}
              aiConfigured={state.aiConfigured}
              jevConfigured={state.jevConfigured}
              jevProvider={state.jevProvider}
            />
          </details>
        </section>
        <section>
          <h1>
            <span>4</span>Appearance
          </h1>
          {drawsWindowControls ? (
            <>
              <p className="note">
                The window is drawn by the app itself, so its three controls
                close, minimize and maximize it directly. They dim while another
                window has focus.
              </p>
              <label className="setting-toggle">
                <span>Window controls on the right</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={windowSide === "right"}
                  onChange={(e) =>
                    onWindowSide(e.target.checked ? "right" : "left")
                  }
                />
              </label>
            </>
          ) : (
            <p className="note">
              macOS draws the window controls, so they stay in the top-left
              corner.
            </p>
          )}
        </section>
        <BrandingSection
          api={api}
          perform={perform}
          busy={busy}
          onNotice={onNotice}
        />
        <McpSection api={api} perform={perform} busy={busy} />
        <section>
          <h1>
            <span>7</span>About
          </h1>
          <p className="note">
            Mail is stored encrypted on this computer and syncs every five
            minutes while the app is open. Done archives mail in your provider
            mailbox. Snooze is local to this client. Disconnect removes the
            local account and cache without changing your mailbox.
          </p>
        </section>
      </div>
    </main>
  );
}
// A dark dropdown: the native select popup ignores the app's theme on Windows.
function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(value);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    setActive(value);
    const away = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [open, value]);
  const commit = (next: T) => {
    setOpen(false);
    trigger.current?.focus();
    if (next !== value) onChange(next);
  };
  const move = (step: number) => {
    const index = options.findIndex((option) => option.value === active);
    setActive(options[Math.min(options.length - 1, Math.max(0, index + step))].value);
  };
  return (
    <div className="dropdown" ref={root}>
      <button
        type="button"
        ref={trigger}
        className="dropdown-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            move(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            move(-1);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            commit(active);
          } else if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {options.find((option) => option.value === value)?.label}
        <ArrowDown2 color="currentColor" size={12} className={open ? "up" : undefined} />
      </button>
      {open && (
        <ul
          className="dropdown-menu"
          role="listbox"
          aria-labelledby={id}
          aria-activedescendant={`${id}-${active}`}
        >
          {options.map((option) => (
            <li
              key={option.value}
              id={`${id}-${option.value}`}
              role="option"
              aria-selected={option.value === value}
              className={option.value === active ? "active" : undefined}
              onMouseEnter={() => setActive(option.value)}
              onClick={() => commit(option.value)}
            >
              {option.label}
              {option.value === value && <Check color="currentColor" size={12} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
function StoredValue({ value, present }: { value?: string; present: boolean }) {
  return present ? (
    <p className="stored">
      <Check color="currentColor" size={11} />
      Saved · {value ? <Address value={value} /> : "••••••••••••"}
    </p>
  ) : (
    <p className="stored none">Not saved yet</p>
  );
}
function ConfigurationForm({
  api,
  perform,
  busy,
  googleConfigured,
  googleClientId,
  aiConfigured,
  jevConfigured,
  jevProvider,
}: {
  api: Api;
  perform: (task: () => Promise<unknown>, success?: string) => Promise<void>;
  busy: boolean;
  googleConfigured: boolean;
  googleClientId: string | null;
  aiConfigured: boolean;
  jevConfigured: boolean;
  jevProvider: JevProvider;
}) {
  const [provider, setProvider] = useState(jevProvider);
  return (
    <form
      className="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        void perform(async () => {
          await api("/config", "POST", {
            googleClientId: data.get("googleClientId") || undefined,
            googleClientSecret: data.get("googleClientSecret") || undefined,
            openaiApiKey: data.get("openaiApiKey") || undefined,
            jevApiKey: data.get("jevApiKey") || undefined,
            jevProvider: provider,
          });
          form.reset();
        }, "Connection settings saved.");
      }}
    >
      <label>
        Google OAuth client ID
        <input
          name="googleClientId"
          autoComplete="off"
          placeholder={
            googleClientId
              ? "Leave blank to keep the saved ID"
              : "Client ID from Google Cloud"
          }
        />
      </label>
      <StoredValue present={!!googleClientId} value={googleClientId ?? undefined} />
      <label>
        Google OAuth client secret
        <input
          name="googleClientSecret"
          type="password"
          autoComplete="new-password"
          placeholder={
            googleConfigured
              ? "Leave blank to keep the saved secret"
              : "Client secret from Google Cloud"
          }
        />
      </label>
      <StoredValue present={googleConfigured} />
      <label>
        Decision model provider
        <Dropdown
          label="Decision model provider"
          value={provider}
          disabled={busy}
          onChange={setProvider}
          options={(Object.keys(jevProviders) as JevProvider[]).map((key) => ({
            value: key,
            label: jevProviders[key].name,
          }))}
        />
      </label>
      <label>
        {jevProviders[provider].name} API key
        <input
          name="jevApiKey"
          type="password"
          autoComplete="new-password"
          placeholder={
            jevConfigured
              ? "Leave blank to keep the saved key"
              : jevProviders[provider].console
          }
        />
      </label>
      <StoredValue present={jevConfigured} />
      <label>
        OpenAI API key (optional)
        <input
          name="openaiApiKey"
          type="password"
          autoComplete="new-password"
          placeholder={
            aiConfigured
              ? "Leave blank to keep the saved key"
              : jevConfigured
                ? "Optional · Jev handles sorting"
                : "Leave blank to keep local sorting"
          }
        />
      </label>
      <StoredValue present={aiConfigured} />
      <div className="form-actions">
        <span>Stored on this computer.</span>
        <button className="button" disabled={busy}>
          Save settings
        </button>
      </div>
    </form>
  );
}
export function ConnectDialog({
  provider,
  busy,
  onClose,
  onConnect,
  onBack,
}: {
  provider: ImapProvider;
  busy: boolean;
  onClose: () => void;
  onConnect: (input: unknown) => Promise<void>;
  onBack?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const unavailable = busy || pending;
  return (
    <Dialog title={`Connect ${providerNames[provider]}`} onClose={() => { if (!submitting.current) onClose(); }}>
      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || submitting.current) return;
          const data = new FormData(e.currentTarget);
          submitting.current = true;
          setPending(true);
          setError("");
          try {
            await onConnect({
              provider,
              email: data.get("email"),
              password: data.get("password"),
              ...(provider === "imap"
                ? {
                    username: data.get("username") || undefined,
                    imapHost: data.get("imapHost"),
                    smtpHost: data.get("smtpHost"),
                    imapPort: Number(data.get("imapPort")),
                    smtpPort: Number(data.get("smtpPort")),
                  }
                : {}),
            });
          } catch (error) {
            setError(error instanceof Error ? error.message : "Connection failed. Check your details and try again.");
          } finally {
            submitting.current = false;
            setPending(false);
          }
        }}
      >
        <p className="dialog-copy">
          {provider === "imap"
            ? "Connect using TLS IMAP and SMTP. Server settings come from your email provider."
            : provider === "gmail-imap"
              ? "For Gmail and Google Workspace, use a 16-letter Google app password, not your regular password. App passwords require 2-Step Verification and depend on account and admin policy. If unavailable, use configured Google sign-in or contact your administrator."
              : "Generate an app password in your provider account settings. Do not use your regular password."}
        </p>
        {appPasswordHelp[provider] && (
          <a className="link" href={appPasswordHelp[provider]} target="_blank" rel="noopener noreferrer">How to create an app password</a>
        )}
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          {provider === "imap" ? "Password" : "App password"}
          <input name="password" type="password" autoComplete="off" required />
        </label>
        {provider === "imap" && (
          <>
            <label>
              IMAP username (if different)
              <input name="username" />
            </label>
            <div className="field-grid">
              <label>
                IMAP host
                <input
                  name="imapHost"
                  placeholder="imap.example.com"
                  required
                />
              </label>
              <label>
                Port
                <input
                  name="imapPort"
                  type="number"
                  min={1}
                  max={65535}
                  defaultValue={993}
                  required
                />
              </label>
              <label>
                SMTP host
                <input
                  name="smtpHost"
                  placeholder="smtp.example.com"
                  required
                />
              </label>
              <label>
                Port
                <select name="smtpPort" defaultValue={465}>
                  <option value={465}>465 · TLS</option>
                  <option value={587}>587 · STARTTLS</option>
                </select>
              </label>
            </div>
          </>
        )}
        {error && <p className="attention" role="alert"><Redact text={error} /></p>}
        <div className="form-actions">
          <span>Encrypted on this computer.</span>
          {onBack && <button className="link" type="button" disabled={unavailable} onClick={onBack}>Back</button>}
          <button className="button" disabled={unavailable}>
            {pending ? "Checking connection" : busy ? "Wait for the current action" : "Connect"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function BrandingSection({
  api,
  perform,
  busy,
  onNotice,
}: {
  api: Api;
  perform: (task: () => Promise<unknown>, success?: string) => Promise<void>;
  busy: boolean;
  onNotice: (text: string) => void;
}) {
  return (
    <section>
      <h1>
        <span>5</span>Branding
      </h1>
      <p className="note">
        Sender logos come from theSVG, an open brand icon library, and are
        cached on this computer. Scan the senders already in your inbox to
        fetch the ones that are still missing. Companies the library does not
        know keep their letter.
      </p>
      <button
        className="button"
        disabled={busy}
        onClick={() =>
          void perform(async () => {
            const { total, found, missing, failed } = await api<LogoSummary>(
              "/logos/sync",
              "POST",
            );
            onNotice(
              `Logos scanned: ${total} company ${total === 1 ? "domain" : "domains"}, ${found} found, ${missing} not in the library${failed ? `, ${failed} failed` : ""}.`,
            );
          })
        }
      >
        Fetch company logos
      </button>
    </section>
  );
}

function McpSection({
  api,
  perform,
  busy,
}: {
  api: Api;
  perform: (task: () => Promise<unknown>, success?: string) => Promise<void>;
  busy: boolean;
}) {
  const [settings, setSettings] = useState<McpSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<McpSettings>("/mcp")
      .then(setSettings)
      .catch((error: unknown) =>
        setError(
          error instanceof Error
            ? error.message
            : "Could not load MCP settings.",
        ),
      );
  }, [api]);
  // Turning MCP on reveals its options and turning it off folds them away.
  useEffect(() => {
    if (settings) setOpen(settings.enabled);
  }, [settings?.enabled]);
  const update = (
    input:
      | Partial<Pick<McpSettings, "enabled" | "allowSending">>
      | { regenerateToken: boolean },
  ) =>
    void perform(async () => {
      setSettings(await api<McpSettings>("/mcp", "PATCH", input));
    });
  const endpoint = "http://127.0.0.1:32145/mcp";
  const snippets = [
    ["Endpoint", endpoint],
    ...(settings?.token
      ? [
          ["Token", settings.token],
          [
            "Claude Code",
            `claude mcp add --transport http emc2 ${endpoint} --header "Authorization: Bearer ${settings.token}"`,
          ],
          [
            "JSON config",
            JSON.stringify(
              {
                mcpServers: {
                  "emc2": {
                    url: endpoint,
                    headers: { Authorization: `Bearer ${settings.token}` },
                  },
                },
              },
              null,
              2,
            ),
          ],
        ]
      : []),
  ];
  return (
    <section className="mcp-settings">
      <div className="section-head">
        <h1>
          <span>6</span>MCP
        </h1>
        <button
          className="disclosure"
          aria-expanded={open}
          aria-controls="mcp-options"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide options" : "Show options"}
          <ArrowDown2 color="currentColor" size={12} className={open ? "up" : undefined} />
        </button>
      </div>
      <p className="note">
        Let AI clients read synced mail while the app is running. Sending
        replies is opt-in.
      </p>
      {error && <p role="alert">{error}</p>}
      {settings && (
        <>
          <label className="setting-toggle">
            <span>Enable MCP</span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.enabled}
              disabled={busy}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
          </label>
          {open && (
            <div className="disclosure-body" id="mcp-options">
              <label className="setting-toggle">
                <span>Allow sending replies</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings.allowSending}
                  disabled={busy || !settings.enabled}
                  onChange={(e) => update({ allowSending: e.target.checked })}
                />
              </label>
              {snippets.map(([label, value]) => (
                <div className="mcp-copy" key={label}>
                  <div>
                    <strong>{label}</strong>
                    <pre>{value}</pre>
                  </div>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void perform(
                        () => navigator.clipboard.writeText(value),
                        `${label} copied.`,
                      )
                    }
                  >
                    Copy
                  </button>
                </div>
              ))}
              {settings.token && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => update({ regenerateToken: true })}
                >
                  Regenerate token
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
