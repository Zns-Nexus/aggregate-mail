// Persistent warning while the mail key is stored without OS encryption (ADR 0027).
export function CredentialFallbackNotice({ mode }: { mode?: string }) {
  if (mode !== "linux-local") return null;
  return (
    <div className="update-notice credential-fallback-notice" role="alert">
      <div>
        <strong>Weaker local protection</strong>
        <p>
          System credential encryption is unavailable, so your mail key is protected only by file
          permissions on this machine. Install or unlock GNOME Keyring or KWallet for system
          encryption; existing data keeps using the local key.
        </p>
      </div>
    </div>
  );
}
