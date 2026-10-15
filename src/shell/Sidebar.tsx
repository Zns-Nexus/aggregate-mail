import { useState, type ReactNode } from "react";
import { providerNames, type Account } from "../../shared/types";
import { ProviderIcon } from "../mail/Avatar";
import { relative, sidebarViews, viewNames, type View } from "../mail/format";
import { settingsSections, type SettingsSection } from "../settings/sections";
import { SlidingNav } from "../ui/SlidingNav";
import { ChevronDown, Compose as ComposeIcon, Mail as MailIcon, Plus, Settings, SidebarIcon } from "../ui/icons";
import { captionDoubleClick, type Corner } from "./PaneHeader";
import { TrafficLights } from "../ui/TrafficLights";

const foldedKey = "sidebar-folded";
const readFolded = () => {
  try { return new Set<string>(JSON.parse(localStorage.getItem(foldedKey) || "[]")); }
  catch { return new Set<string>(); }
};

// A source-list section heading. Like Finder and Mail, it folds its section
// away; the chevron appears on hover or when folded.
function Heading({ id, folded, onFold, children }: {
  id: string;
  folded: boolean;
  onFold: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="sidebar-heading">
      <button aria-expanded={!folded} onClick={() => onFold(id)}>
        {children}
        <ChevronDown color="currentColor" size={11} className={folded ? "folded" : undefined} />
      </button>
    </div>
  );
}

/**
 * The full-height source list. In mail it holds the app actions, the mail
 * views and the account filter; in Settings it lists the sections.
 */
export function Sidebar({
  open, corner, maximized, onToggle, settings, mail, sections,
}: {
  open: boolean;
  corner: Corner;
  maximized: boolean;
  onToggle: () => void;
  settings: boolean;
  mail: {
    view: View;
    onView: (view: View) => void;
    inboxCount: number;
    snoozedCount: number;
    accounts: Account[];
    accountFilter: string;
    onAccount: (id: string) => void;
    privacy: boolean;
    blocked: boolean;
    busy: boolean;
    onAddAccount: () => void;
    onCompose: () => void;
    onSettings: () => void;
    shortcut: (action: "compose" | "settings") => string;
    syncing: boolean;
    lastSync: number | null;
    onSync: () => void;
  };
  sections: {
    current: SettingsSection;
    onSection: (section: SettingsSection) => void;
    onClose: () => void;
  };
}) {
  const [folded, setFolded] = useState(readFolded);
  const fold = (id: string) => setFolded((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    try { localStorage.setItem(foldedKey, JSON.stringify([...next])); } catch { /* The choice lasts this session. */ }
    return next;
  });
  return (
    <aside
      id="sidebar"
      className={open ? "sidebar" : "sidebar closed"}
      aria-label={settings ? "Settings sections" : "Mailboxes"}
      inert={!open}
    >
      <div className={corner === "reserve" ? "sidebar-head reserve-lights" : "sidebar-head"} onDoubleClick={captionDoubleClick}>
        <button
          className="icon"
          aria-label="Hide sidebar"
          aria-expanded={open}
          aria-controls="sidebar"
          onClick={onToggle}
        >
          <SidebarIcon color="currentColor" size={16} />
        </button>
        {corner === "left" && <TrafficLights maximized={maximized} />}
      </div>
      {settings ? (
        <div className="sidebar-content" key="settings">
          <SlidingNav activeKey={null} label="App" className="sidebar-group sidebar-primary">
            <button aria-label="Close settings" aria-pressed={true} title="Back to mail (Esc)"
              onClick={sections.onClose}>
              <MailIcon color="currentColor" size={16} />
              Mail
            </button>
          </SlidingNav>
          <SlidingNav activeKey={sections.current} label="Settings sections" className="sidebar-group">
            <h2>Settings</h2>
            {settingsSections.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={sections.current === id ? "active" : undefined}
                aria-current={sections.current === id ? "page" : undefined}
                onClick={() => sections.onSection(id)}
              >
                <Icon color="currentColor" size={16} />
                {label}
              </button>
            ))}
          </SlidingNav>
        </div>
      ) : (
        <div className="sidebar-content" key="mail">
          <SlidingNav activeKey={null} label="App" className="sidebar-group sidebar-primary">
            <button title={`Compose (${mail.shortcut("compose")})`} onClick={mail.onCompose}>
              <ComposeIcon color="currentColor" size={16} />
              New message
            </button>
            <button aria-label="Settings" aria-pressed={false} title={`Settings (${mail.shortcut("settings")})`}
              onClick={mail.onSettings}>
              <Settings color="currentColor" size={16} />
              Settings
            </button>
          </SlidingNav>
          <SlidingNav activeKey={mail.view} label="Mail views" className="sidebar-group">
            <Heading id="mail" folded={folded.has("mail")} onFold={fold}>Mail</Heading>
            {!folded.has("mail") && sidebarViews.map(({ view, Icon }) => {
              const total = view === "snoozed" ? mail.snoozedCount : view === "archive" ? null : mail.inboxCount;
              if (view === "snoozed" && !total && mail.view !== "snoozed") return null;
              return (
                <button
                  key={view}
                  className={mail.view === view ? "active" : undefined}
                  aria-current={mail.view === view ? "page" : undefined}
                  onClick={() => mail.onView(view)}
                >
                  <Icon color="currentColor" size={16} />
                  {viewNames[view]}
                  {total !== null && <span className="sidebar-count">{total}</span>}
                </button>
              );
            })}
          </SlidingNav>
          <SlidingNav activeKey={mail.accountFilter} label="Filter accounts" className="sidebar-group">
            <Heading id="accounts" folded={folded.has("accounts")} onFold={fold}>Accounts</Heading>
            {!folded.has("accounts") && mail.accounts.length > 0 && (
              <button
                className={mail.accountFilter === "all" ? "active" : undefined}
                aria-pressed={mail.accountFilter === "all"}
                disabled={mail.blocked}
                onClick={() => mail.onAccount("all")}
              >
                <kbd>0</kbd><span className="sidebar-name">All accounts</span>
              </button>
            )}
            {!folded.has("accounts") && mail.accounts.map((account, index) => (
              <button
                key={account.id}
                title={
                  mail.privacy
                    ? providerNames[account.provider]
                    : account.error
                      ? `${account.email}: ${account.error}`
                      : account.email
                }
                className={mail.accountFilter === account.id ? "active" : undefined}
                aria-pressed={mail.accountFilter === account.id}
                disabled={mail.blocked}
                onClick={() => mail.onAccount(account.id)}
              >
                {index < 9 && <kbd>{index + 1}</kbd>}
                <ProviderIcon provider={account.provider} />
                {/* Privacy mode numbers accounts instead of drawing bars, so they stay distinguishable. */}
                <span className="sidebar-name">
                  {mail.privacy ? `Account ${index + 1} · ${providerNames[account.provider]}` : account.email}
                </span>
                {account.error && (
                  <i className="error-dot" aria-label="Needs attention" />
                )}
              </button>
            ))}
            {!folded.has("accounts") && (
              <button className="sidebar-add" disabled={mail.blocked || mail.busy}
                onClick={mail.onAddAccount}>
                <Plus color="currentColor" size={16} />
                Add account
              </button>
            )}
          </SlidingNav>
          <div className="sidebar-footer">
            <button
              className="sync"
              disabled={mail.syncing || !mail.accounts.length}
              onClick={mail.onSync}
              title="Sync mail"
            >
              {mail.syncing
                ? "Syncing"
                : mail.lastSync
                  ? `Synced ${relative(mail.lastSync)}`
                  : "Not synced"}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
