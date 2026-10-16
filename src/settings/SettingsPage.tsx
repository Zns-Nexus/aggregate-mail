import { useContext } from "react";
import type { State } from "../../shared/types";
import type { Api, Perform } from "../api";
import type { Appearance, Scheme } from "../appearance";
import type { InteractionPreferences } from "../interaction";
import { redactPrivateText } from "../privacy";
import { ProviderChoices, type ImapProvider } from "../dialogs/ConnectDialog";
import { ProviderIcon } from "../mail/Avatar";
import { relevanceNames } from "../mail/format";
import { UpdateNotice } from "../shell/UpdateNotice";
import { Address, PrivacyContext, Redact } from "../ui/Privacy";
import { Segmented } from "../ui/Segmented";
import { drawsWindowControls } from "../ui/TrafficLights";
import { ArrowRight } from "../ui/icons";
import { AppearanceSettings } from "./AppearanceSettings";
import { BrandingSection } from "./BrandingSection";
import { ConfigurationForm } from "./ConnectionForm";
import { InteractionSettings } from "./InteractionSettings";
import { McpSection } from "./McpSection";
import type { SettingsSection } from "./sections";

export function SettingsPage({
  state,
  busy,
  perform,
  api,
  onConnectAccount,
  onNotice,
  windowSide,
  onWindowSide,
  onWindowControls,
  interaction,
  onInteraction,
  section,
  appearance,
  scheme,
  onAppearance,
}: {
  state: State;
  busy: boolean;
  perform: Perform;
  api: Api;
  onConnectAccount: (provider: ImapProvider) => void;
  onNotice: (text: string) => void;
  windowSide: "left" | "right";
  onWindowSide: (side: "left" | "right") => void;
  onWindowControls?: (controls: "mac" | "windows") => void;
  interaction: InteractionPreferences;
  onInteraction: (value: InteractionPreferences) => void;
  section: SettingsSection;
  appearance: Appearance;
  scheme: Scheme;
  onAppearance: (value: Appearance) => void;
}) {
  const { on: privacy, names } = useContext(PrivacyContext);
  return (
    <main className="settings">
      <div className="settings-column" key={section}>
        {section === "interaction" && <section>
          <h1>Interaction</h1>
          <InteractionSettings value={interaction} onChange={onInteraction} />
        </section>}
        {section === "accounts" && <section>
          <h1>Accounts</h1>
          <h2>Connected</h2>
          {state.accounts.length ? (
            <div className="settings-group">{state.accounts.map((a) => (
              <div className="account-row" key={a.id}>
                <ProviderIcon provider={a.provider} />
                <strong>
                  <Address value={a.email} />
                </strong>
                <span
                  className={a.error ? "attention" : undefined}
                  title={
                    [a.error && (privacy ? redactPrivateText(a.error, names) : a.error),
                      a.syncFailure && `${a.syncFailure.phase}: ${a.syncFailure.code}${a.syncFailure.status ? ` (${a.syncFailure.status})` : ""}`,
                      a.syncWarning && "Mail result retained; connection cleanup failed."].filter(Boolean).join("\n") || undefined
                  }
                >
                  {a.syncStatus === "queued" ? "Retry queued" : a.syncStatus === "running" ? "Syncing" : a.error ? "Needs attention" : "Connected"}
                </span>
                <button
                  className="link"
                  disabled={busy || !!a.syncStatus}
                  onClick={() => void perform(async () => {
                    const result = await api<{ status: "queued" | "running" }>(`/accounts/${encodeURIComponent(a.id)}/reconnect`, "POST");
                    onNotice(result.status === "running" ? "Connection retry running. Check this account's status for the result." : "Connection retry queued. Check this account's status for the result.");
                  })}
                >
                  Retry connection
                </button>
                <button
                  className="link"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        `Disconnect ${privacy ? redactPrivateText(a.email, names) : a.email}? This permanently deletes its local drafts, including messages that may already have been sent, and removes its local mail cache. Your provider mailbox stays intact.`,
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
            ))}</div>
          ) : (
            <p className="muted">No accounts connected.</p>
          )}
          <h2>Connect account</h2>
          <div className="settings-group">
            <ProviderChoices googleConfigured={state.googleConfigured} busy={busy} onChoose={onConnectAccount} />
          </div>
        </section>}
        {section === "sorting" && <section>
          <h1>Sorting</h1>
          <p className="note">
            {state.jevConfigured
              ? "Jev sorting is on. Sender, subject and preview text of new mail are sent to Jev."
              : state.aiConfigured
                ? "AI sorting is on. Sender, subject and preview text of new mail are sent to OpenAI."
                : "Local sorting is on. Add a Jev or OpenAI key under Connection to enable AI sorting."}{" "}
            Sender rules take priority. Use Teach on any email to correct it.
          </p>
          {state.rules.length ? (
            <div className="settings-group">{state.rules.map((rule) => (
              <div className="rule-row" key={rule.id}>
                <div>
                  <p>
                    <Redact text={rule.instruction} />
                  </p>
                  <span>
                    {rule.category === "important" ? "Pinned to Primary" : "Sorted by type"} ·{" "}
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
            ))}</div>
          ) : (
            <p className="muted">
              No sender rules yet. Press <kbd>m</kbd> on any email to add one.
            </p>
          )}
        </section>}
        {section === "connection" && <section>
          <h1>Connection</h1>
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
        </section>}
        {section === "appearance" && <section>
          <h1>Appearance</h1>
          <AppearanceSettings value={appearance} scheme={scheme} onChange={onAppearance} />
          {window.desktop && window.desktop.platform !== "darwin" ? (
            <>
              <h2>Window controls</h2>
              <div className="settings-group">
                <div className="settings-row">
                  <span id="controls-label">Style</span>
                  <Segmented labelledBy="controls-label" value={window.desktop.windowControls ?? "mac"}
                    choices={[{ id: "mac", label: "macOS" }, { id: "windows", label: "Windows" }] as const}
                    onChange={(controls) => onWindowControls?.(controls)} />
                </div>
                {drawsWindowControls && (
                  <label className="settings-row">
                    <span>Show on the right</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={windowSide === "right"}
                      onChange={(e) =>
                        onWindowSide(e.target.checked ? "right" : "left")
                      }
                    />
                  </label>
                )}
              </div>
              <p className="note">
                {drawsWindowControls
                  ? "macOS style draws three colored controls that close, minimize and maximize the window. They dim while another window has focus."
                  : "Windows style uses the system's own minimize, maximize and close buttons, including snap layouts."}{" "}
                Switching reopens the window in place.
              </p>
            </>
          ) : (
            <p className="note">
              macOS draws the window controls, so they stay in the top-left
              corner.
            </p>
          )}
        </section>}
        {section === "branding" && <BrandingSection
          api={api}
          perform={perform}
          busy={busy}
          onNotice={onNotice}
        />}
        {section === "mcp" && <McpSection api={api} perform={perform} busy={busy} />}
        {section === "about" && <section>
          <h1>About</h1>
          <p className="note">
            Mail is stored encrypted on this computer. IMAP watches for changes;
            Gmail checks for changes every 15 seconds, with periodic full sync
            for recovery. Closing the desktop window keeps it
            running in the tray; use Quit in the tray menu to exit. New unread
            mail shows a desktop notification. Archive moves mail out of your
            provider's inbox. Snooze is local to this client. Disconnect permanently deletes
            all local drafts for that account, including messages that may already have been sent,
            and removes the local account and cache without changing your mailbox.
          </p>
          <UpdateNotice bridge={window.desktop?.updates} />
        </section>}
      </div>
    </main>
  );
}
