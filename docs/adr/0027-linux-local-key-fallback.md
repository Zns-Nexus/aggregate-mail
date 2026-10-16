# ADR 0027: Linux local-key fallback when system encryption is unavailable

Date: 2026-10-15
Status: Accepted (approved by the project owner as an exception to the "never fall back to weaker storage" rule).

## Problem

On Linux without a running, unlocked Secret Service (headless, VNC, minimal
desktops), `safeStorage.isEncryptionAvailable()` is false. Startup then stopped
with "System credential encryption is unavailable", so Emc² could not be used at
all on such machines, including QA hosts. Stale profiles whose keyring changed
showed a raw `safeStorage.decryptString` error.

## Decision

Linux only:

- A fresh profile (no `key.protected` and no `mail.sqlite`) with encryption
  unavailable creates `mail/key.local` (mode 0600, atomic rename) holding the
  base64 32-byte database key. The mail database stays AES-encrypted with that
  key; only the key's OS wrapping is replaced by filesystem permissions.
- A profile containing `key.local` and no `key.protected` keeps using the local
  key, even after a keyring becomes available. No automatic migration to
  safeStorage happens; moving the profile aside and reconnecting is the upgrade
  path. Migration can be added later with its own tests.
- Fallback mode sets `MAIL_CREDENTIAL_FALLBACK=linux-local`, logs a JSON
  warning, includes it in the `--check-startup` receipt, and passes
  `--emc2-credential-fallback=linux-local` to the preload. The renderer shows a
  persistent alert explaining the weaker protection. Startup continues without
  an interactive prompt so automated and unattended hosts work.
- A profile with `key.protected` is never opened with a new key. If encryption
  is unavailable or decryption fails, startup stops with a message naming the
  keyring problem and suggesting unlocking GNOME Keyring/KWallet or moving the
  app data folder aside. Existing `mail.sqlite` without any key still stops.
- A damaged `key.local` stops startup.

macOS and Windows are unchanged: unavailable encryption still stops startup.
Windows decrypt failures now show a clear message instead of the raw error.

## Consequences

On Linux fallback, any process running as the user (or anyone reading the
disk/backups) can read the mail key and therefore the mail cache and saved
credentials. This matches Chromium's `basic` password store. The UI and logs
make the mode visible.
