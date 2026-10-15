import { useState } from "react";

// Warning while the mail key is stored without OS encryption (ADR 0027).
export const FALLBACK_DISMISS_KEY = "emc2.credentialFallbackNotice.collapsed";

export function isCredentialFallback(mode?: string): boolean {
  return mode === "linux-local";
}

// Short footer copy for account/credential forms; accurate in fallback mode.
export function credentialStorageFooter(mode?: string): string {
  return isCredentialFallback(mode)
    ? "Stored on this computer with a local key (file permissions only, weaker than system encryption)."
    : "Encrypted on this computer.";
}

// Opening sentence fragment for Settings → About.
export function aboutStorageSentence(mode?: string): string {
  return isCredentialFallback(mode)
    ? "Mail is stored on this computer protected by a local key and file permissions only (weaker than system credential encryption)"
    : "Mail is stored encrypted on this computer";
}

function readCollapsed(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(FALLBACK_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    if (value) globalThis.sessionStorage?.setItem(FALLBACK_DISMISS_KEY, "1");
    else globalThis.sessionStorage?.removeItem(FALLBACK_DISMISS_KEY);
  } catch {
    // sessionStorage unavailable; React state still applies.
  }
}

export function CredentialFallbackNotice({
  mode,
  initialCollapsed,
}: {
  mode?: string;
  initialCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(() => initialCollapsed ?? readCollapsed());
  if (!isCredentialFallback(mode)) return null;
  const set = (value: boolean) => {
    writeCollapsed(value);
    setCollapsed(value);
  };
  if (collapsed) {
    return (
      <div className="credential-fallback-notice collapsed" role="status">
        <button
          className="link"
          type="button"
          aria-expanded="false"
          onClick={() => set(false)}
        >
          Credential protection: weaker local key · Show details
        </button>
      </div>
    );
  }
  return (
    <div className="credential-fallback-notice" role="alert">
      <div>
        <strong>Weaker local protection</strong>
        <p>
          System credential encryption is unavailable, so your mail key is protected only by file
          permissions on this machine. Install or unlock GNOME Keyring or KWallet for system
          encryption; existing data keeps using the local key.
        </p>
      </div>
      <button
        className="link"
        type="button"
        aria-expanded="true"
        onClick={() => set(true)}
      >
        Hide for this session
      </button>
    </div>
  );
}
