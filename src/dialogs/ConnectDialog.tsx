import { useRef, useState } from "react";
import { appPasswordHelp, providerNames, type Provider } from "../../shared/types";
import { credentialStorageFooter } from "../shell/CredentialFallbackNotice";
import { ProviderIcon } from "../mail/Avatar";
import { Dialog } from "../ui/Dialog";
import { Redact } from "../ui/Privacy";
import { ArrowRight } from "../ui/icons";

export type ImapProvider = Exclude<Provider, "gmail">;

export function ProviderChoices({ googleConfigured, busy, onChoose }: {
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
          <span>{credentialStorageFooter(globalThis.window?.desktop?.credentialFallback)}</span>
          {onBack && <button className="link" type="button" disabled={unavailable} onClick={onBack}>Back</button>}
          <button className="button" disabled={unavailable}>
            {pending ? "Checking connection" : busy ? "Wait for the current action" : "Connect"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
