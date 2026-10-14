# ADR 0021: Migrate the protected mail key to the Emc² identity

Date: 2026-10-13
Status: Implementation decision for the requested Keychain-name correction. Native acceptance remains pending.
Supersedes: Only the permanent use of a confirmed legacy identity in [ADR 0015](0015-macos-keychain-identity.md). Its bounded discovery and failure behavior remain.

## Problem

Existing macOS profiles can use the `Aggregate Mail Safe Storage` item after
the application rename. Electron chooses its synchronous Keychain identity
before readiness. Changing the display name afterward does not rewrap an
existing protected key. The user requested Emc² in both native prompt labels
while retaining accounts and mail.

## Decision

Keep the profile and the exact 32-byte data key. Ordinary startup validates and
pins the profile, acquires its singleton, recovers default-profile files when
needed, then selects identity once before readiness. Explicit profiles skip
saved-profile recovery and development imports.

After successful legacy decryption, run one same-app helper with Emc² selected
before readiness and a fresh temporary profile. The synchronous entry dispatcher
loads the helper without ordinary mail, window, tray or updater startup. The
helper validates the canonical directory, owner, permissions, emptiness and
effective profile switch before using safeStorage.

Send the key only through private pipes. Each direction accepts one frame with
a four-byte length and at most 16 KiB of UTF-8 JSON. Require normal EOF, exact
fields, a fresh nonce, the original wrapper digest and an HMAC bound to the
recovered key. The helper verifies that its new wrapper decrypts to the same
key. The parent validates the response and successful child close before
persisting it. Helper fatal handlers and parent migration errors suppress raw
exceptions. The helper receives no key through arguments, environment entries
or plaintext files.

The parent alone commits `mail/key.current.json` under the profile lock. Its
version, Emc² identity, original-wrapper digest and wrapped key form one record.
An exclusive mode-0600 temporary file is flushed and renamed, followed by a
directory flush and exact readback. Preserve `key.protected` and its identity
metadata byte-for-byte. The encrypted database needs no rewrite.

Later starts prefer the committed record and select Emc². Corrupt or inconsistent
records stop startup; they do not fall back to legacy or replace the key.
Fresh/current profiles and Windows keep their existing paths. Unknown original
identities retain at most the existing one legacy discovery relaunch.

## Failure and rollback

Access denial, unavailable encryption, malformed protocol, failed authentication,
nonzero child exit or persistence failure stops before opening mail. There is
one parent deadline and no migration retry. Handled quit and fatal paths kill
the owned helper, observe exit, then remove its temporary directory. A hard-killed
parent cannot guarantee cleanup while a native prompt is blocked. Same-user
process compromise and guaranteed JavaScript string erasure are outside this
contract.

The prior app can read the unchanged original wrapper and metadata. Recovery
that moves a current record aside requires separate authority, all app copies
stopped and retention of the record as evidence. Do not delete Keychain items,
reset profiles or substitute weaker encryption.

## Verification and limits

Synthetic tests exercise the actual dispatcher and bootstrap with mocked
Electron, real child pipes and synthetic encrypted fixtures. They cover
migration and restart with the same key, original-byte preservation, corruption,
interrupted persistence, protocol failures, direct-helper misuse, quit cleanup
and sanitized errors. The connected regression must fail against the prior
implementation before passing with this change. Commands are in
[the repository verification notes](../KB.md#protected-mail-keys-on-macos).

Native completion requires an authorized disposable macOS account/Keychain and
reviewed synthetic fixtures. Verify bundle metadata/signature, both prompt
labels, helper execution, denial, migration, restart, reinstall, data continuity
and process exit on each claimed architecture. A temporary app profile alone
does not isolate named Keychain services. Windows DPAPI and downloaded-app
acceptance remain separate checks.

The bundle product name is already Emc²; this decision introduces no speculative
bundle-name override. The first migration may still need legacy access. It does
not guarantee prompt suppression after reinstall or change the ad-hoc signing,
notarization, publication or updater decisions.
