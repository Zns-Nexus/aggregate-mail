# Database and end-to-end email encryption research

Research date: 2026-10-15. Status: recommendation for review, no encryption implementation approved or added.
Source baseline: `2ab0b64c72dd5b1485b6dade3fe0eb3b8545d651` on `feat/emc2-mail-features`.

## Recommendation

Treat full-database encryption and end-to-end (E2E) email as separate changes.
Prototype SQLCipher Community against synthetic profiles first. Keep the existing
record encryption, exact installation key, accounts and original database intact.
A production choice needs a pinned native Node binding and successful packaged
startup on every claimed OS and architecture.

For E2E email, evaluate OpenPGP with PGP/MIME for recipients who use compatible
OpenPGP clients. Evaluate S/MIME for recipients whose clients and organizations
already manage S/MIME certificates. Choose the first protocol using an actual
recipient compatibility test, rather than promising either works for everyone.
Supporting both would be a later, separately scoped implementation.

Windows, macOS and Linux can run cross-platform cryptographic software. That
does not establish that their email applications, or iOS and Android email
applications, can decrypt a particular message. Emc² currently targets Windows
and macOS; Linux packaging configuration is not Linux acceptance proof. It has
no iOS or Android app in this repository.

No dependencies, keys, databases, accounts, provider state or signing policy
were changed for this research. All external findings below are documentation
claims. No native, installed-app or cross-client exchange was executed.

## What the current application protects

The inspected [store](../server/store.ts) uses built-in `node:sqlite` and encrypts
JSON values with AES-256-GCM, a fresh 12-byte nonce and a 16-byte authentication
tag. SQLite schema, record `kind` and `id`, indexes and file structure remain
readable. Record counts, database size and access patterns are not hidden.
This is record-value encryption, not full-database encryption.

[Desktop startup](../desktop/main.ts) retrieves the installation key through
Electron `safeStorage`. The [macOS migration](adr/0021-macos-keychain-name-migration.md)
preserves the exact 32-byte key and original wrapper. The standalone server can
instead create a raw `.data/key` file when no `MAIL_DATA_KEY` is supplied. That
path does not inherit the installed desktop's OS keystore protection.

Electron documents these synchronous `safeStorage` differences [5]:

| OS | Documented key protection | Limit that affects the design |
| --- | --- | --- |
| Windows | DPAPI tied to the user's logon context | Does not protect against other applications in the same user context. A copied wrapper is not a portable cross-OS backup. |
| macOS | Keychain access and application identity | Locked/denied Keychain access must stop startup. Different builds/signatures can prompt again. Preserve the approved ad-hoc signing and existing migration. |
| Linux | Desktop secret store, such as GNOME Secret Service or KWallet | `basic_text` uses a hardcoded plaintext password. Explicitly reject it and unavailable/unknown backends before opening mail or creating a key. |

The inspected startup checks `isEncryptionAvailable()` but does not check
`getSelectedStorageBackend()`. Therefore this research does **not** establish
fail-closed Linux key protection. That guard and its actual Electron-version
behavior require a separately authorized implementation and native proof.
The online Electron documentation is unversioned; the repository declares
Electron `^44.7.0`. Do not assume every API in current online docs exists in the
locked runtime.

Local encryption protects stored data against an offline reader without the
key. It does not protect a running unlocked app against compromised same-user
processes, malicious dependencies, screenshots, memory inspection or plaintext
exports. It does not make mail sent through providers E2E encrypted.

## Full-database options

| Option | Benefit | Cost and unresolved work |
| --- | --- | --- |
| Keep existing record encryption | No migration or native addon; already encrypts account secrets and mail JSON | Leaves SQLite metadata readable. Does not meet a full-database requirement. |
| SQLCipher Community compiled with a Node binding | Encrypts database pages, schema and record identifiers; open-source license permits redistribution subject to notices [1-3] | Must choose and pin a maintained binding, SQLCipher release, crypto provider and build settings. Native builds, license notices and Electron packaging become release inputs. No binding was validated here. |
| SQLCipher Commercial or Enterprise | Vendor packages, support and edition-specific features may reduce integration work [1] | Paid license and distribution terms need a separate decision. Purchase is not required for this research, and no price or package suitability is assumed. |

SQLCipher is a modified SQLite library, not a loadable encryption plugin [1].
Adding `PRAGMA key` to the current `node:sqlite` connection would not replace its
SQLite library. The application needs a SQLCipher-enabled native binding or a
separately reviewed native service. Keep that change behind the current store
operations; trace desktop legacy database copying and all store callers too.
Do not introduce a second persistence abstraction before the binding spike
shows one is needed.

SQLCipher documents encrypted database pages and encrypted journal/WAL page
data. File-based temporary storage must be disabled through verified build and
runtime configuration; other transient files are not all encrypted [1]. It
still exposes filenames, sizes and some journal structure. Validate actual
packaged artifacts rather than relying on the library name.

Electron native modules need its compatible ABI/toolchain and target
architecture, plus correct `.node` and dependent-library packaging [6]. The
matrix must cover Windows x64, macOS arm64/x64 where claimed, and each separately
claimed Linux target. Test rebuilding, ASAR extraction, dynamic library loading,
startup, updates and uninstall/reinstall continuity. SQLCipher's documented
mobile availability does not supply an Emc² mobile app or prove mobile packaging.
Do not use a personal Apple Developer account, developer certificate or
notarization to solve native packaging. Retain [ADR 0011](adr/0011-macos-source-installation.md).

### Additive migration and rollback requirements

These are requirements for a future design, not migration instructions to run:

1. Stop competing writers and validate the existing profile/key identity. Take
   a consistent source snapshot that includes committed WAL contents. Preserve
   original database files, key wrappers and identity metadata byte-for-byte;
   never copy a live main database alone and assume its WAL is irrelevant.
2. Create a separate SQLCipher target. Preserve every `(kind, id, value)` row,
   including the exact encrypted `value` strings. Retain existing AES-GCM record
   protection during the first migration. Do not decrypt/re-encrypt records
   merely to add page encryption.
3. Keep the original 32-byte record key unchanged. Review a separate page-key
   derivation or wrapping design with explicit purpose separation, versioning
   and recovery before implementation. Do not silently reuse a raw key across
   cryptographic purposes or replace a key after an unlock failure.
4. Set the SQLCipher key before database access; then read the schema and rows
   to prove unlock. A successful key-setting call alone is insufficient [2].
   Check page authentication, SQLite integrity, exact row/ciphertext equality
   and decryption of every synthetic record using the original record key.
5. Flush and reopen the target before an atomic, versioned activation step.
   Test disk-full, permissions, interruption and wrong-key failure at each step.
   Do not overwrite the original database or leave a plaintext intermediate.
6. Retain the original format for rollback. An older app cannot open the
   SQLCipher target. After new writes, the old snapshot is stale: reverting to
   it would lose those writes. Define a tested reverse migration or an explicit
   rollback hold; never silently fall back to the stale database.

`sqlcipher_export()` can copy an ordinary SQLite database into an encrypted
attached database without changing encrypted record strings. `PRAGMA rekey`
cannot encrypt an ordinary SQLite database [2]. Export also does not copy every
configuration property, including `user_version`; preserve and verify all
required schema/version settings. Any retained original backup still exposes
its old SQLite metadata. Retention and later deletion require an explicit
recovery policy; this task authorizes neither deletion nor reset.

## E2E protocol comparison

| Choice | Message format and trust | Interoperability limit |
| --- | --- | --- |
| OpenPGP | RFC 9580 defines the cryptography; RFC 3156 defines PGP/MIME email wrapping [7]. Verify recipient key identity/fingerprint, expiry, revocation and supported algorithms. Signatures and encryption are distinct. | A recipient needs an OpenPGP-capable client and the matching private key. OpenPGP.js is a crypto library, not a MIME/email-client implementation. Its documentation warns that newer RFC 9580 AEAD settings can break older clients [8]. |
| S/MIME | RFC 8551 defines S/MIME 4.0, updated by RFC 9788 for header protection [9]. Requires sender private key/certificate and recipients' valid encryption certificates, with chain, identity, key-use and revocation policy. | Client/account configuration, certificate provisioning and algorithm support vary. Hosted S/MIME can give a provider a copy of the key; that does not meet a provider-excluding E2E threat model. |

Neither TLS, a digital signature alone, local database encryption nor a portal
link establishes provider-excluding E2E email. OpenPGP and S/MIME ciphertext are
not interchangeable. A mixed recipient group requires one compatible protocol
and keys for every recipient, or a separately designed explicit split-send flow.
The first implementation should block the send when a recipient is incompatible
or lacks a verified usable key. Never silently send plaintext or upload
plaintext to an encryption portal as a fallback.

OpenPGP.js documents Node and browser support and LGPL-3.0-or-later licensing
[8]. It is a candidate for a bounded prototype, not a selected dependency. Pin
and review its exact release, security advisories, license obligations and MIME
integration before an implementation recommendation. No S/MIME implementation
library has been selected or validated. Library OS support alone is insufficient
for either choice.

### Recipient support matrix

Every row is a documented capability or an explicit evidence gap. All actual
Emc²-to-client send/decrypt/reply results remain **UNTESTED**.

| Recipient environment | Evidence reviewed | What can be claimed |
| --- | --- | --- |
| Windows email clients | Protocol standards; Microsoft Exchange overview [9, 12] | S/MIME exists in the Microsoft ecosystem. This does not prove a particular Windows Outlook version/account, OpenPGP addon or algorithm. Test the named client before support claims. |
| macOS Apple Mail | Apple Mail guide [10] | Certificate-based signed/encrypted mail is documented; recipient certificates are needed. This is no evidence of built-in OpenPGP support. |
| Linux email clients | Protocol/library documentation only | Cross-platform implementation is feasible. No specific Linux recipient client/version was verified. The fetched Thunderbird support page was a bot challenge and is excluded. |
| iOS Apple Mail | Apple support [10] | S/MIME support and recipient-certificate requirements are documented. Installation and trust must be configured on the recipient device. |
| iOS/Android Outlook | Microsoft mobile S/MIME guide [12] | S/MIME requires certificates and the feature enabled. Automated delivery has Endpoint Manager requirements. Account, policy and certificate-provisioning constraints require validation. |
| Android Gmail and Gmail web | Google encryption guide [11] | TLS is standard; S/MIME is available for eligible work/school accounts. Hosted S/MIME keeps a Google-managed key copy; CSE has a different organizational key model. Do not promise consumer Gmail E2E support. |
| Any client with no usable matching keys/protocol | Standards above | It cannot decrypt that E2E message. OS identity does not resolve the missing capability. |

RFC 9788 supports protected headers for both S/MIME and PGP/MIME, but legacy
client behavior varies [9]. Outer transport routing information and traffic
metadata remain observable; do not promise hidden recipients or subject lines.
Test protected-header rendering and tamper handling before claiming subject
protection. Decrypted HTML still needs the existing untrusted-content renderer,
privacy redaction and per-opening image consent.

## Key ownership, recovery and secondary copies

The database key and email private keys have different purposes. Losing an
email private key can permanently lose access to old mail even after obtaining
a new certificate or key. Preserve historical decryption keys through expiry
and rotation. Revocation limits future trust; it does not erase already
received ciphertext or recovered plaintext.

OS-wrapped keys must be unwrapped only on their authorized source system and
rewrapped on the destination OS. Copying Keychain/DPAPI ciphertext between OSes
is not a recovery scheme. A future portable backup must use an established,
authenticated encrypted format, a reviewed password KDF or independent recovery
secret, and explicit user-controlled export/import. Verify restore across OSes
with synthetic accounts and historical mail before enabling it. Keep backup
secrets out of source, logs, filenames, arguments and plaintext temporary files.
Do not introduce developer certificates or personal platform accounts as key
custodians. No portable recovery currently exists or was exercised here.

[Cloud sorting](../server/sorting.ts) currently sends sender, subject and preview
to the configured Jev or OpenAI provider. A future E2E path must bypass both for
protected mail, including decrypted previews and protected subjects. Encryption
must precede SMTP/Gmail upload, provider drafts and Sent-copy creation; preserve
existing uncertain-delivery and Sent-copy warning behavior. The sender must be
able to decrypt historical Sent mail too. Cache decrypted content only under
local encryption, and check search indexes, notifications, MCP exports, crash
reports, diagnostics, backups and UI for plaintext leaks. Default MCP access to
decrypted protected content requires a separate explicit policy decision.

## Acceptance evidence needed before implementation can ship

| Area | Required observable proof |
| --- | --- |
| Native database | Pin binding/SQLCipher/crypto provider/Electron inputs. Build and start packaged synthetic profiles on each claimed OS/architecture. Verify cipher version/settings, key rejection, journal/temp behavior, restart and process exit. |
| Preservation | Compare original key/wrappers/database bytes, row identities and ciphertexts. Read all migrated synthetic accounts/mail. Inject interrupted writes, corrupt target, wrong key, locked keystore and disk-full. Prove no reset, weaker fallback or stale snapshot activation. |
| Linux key custody | Actual GNOME/KWallet unlock and denial, missing-store and `basic_text` rejection before key/database mutation. Mock coverage alone does not prove native backend semantics. |
| Migration/recovery | Complete initial migration, restart, interrupted migration recovery and a rollback that preserves later writes. Export/import encrypted recovery across Windows/macOS/Linux without changing the original record key. |
| Recipient exchange | Synthetic keys/accounts, pinned client versions on Windows/macOS/Linux/iOS/Android. Both directions for encryption, signing, replies, forwards, multipart text/HTML and historical Sent decryption. Include unknown/revoked/expired keys, invalid signatures, algorithm mismatch and mixed recipient groups. No real email is authorized by this report. |
| Data flow | Assert no plaintext submission to providers/drafts/Sent, AI endpoints, logs, indexes, notifications or MCP without separately approved behavior. Verify header exposure and protected-header tamper rendering. |
| Repository | For authorized application changes, `npm test`, `npm run build` and isolated `npm run check:desktop`, followed by native target proof. Research-only documentation needs link and diff checks. |

The native binding, E2E library versions, recipient cohort, certificate trust
policy, portable backup format, page-key separation and rollback-after-write
policy remain unresolved. This report supports a synthetic feasibility spike;
it does not establish production readiness or authorize security implementation.

## Primary sources

Reviewed on 2026-10-15. These are vendor/standards documents, not executed
platform proof. Online documentation and `master` links are mutable; no library
version or commit is selected by this report. Evidence retrieval records also
mark the excluded bot challenge, Apple redirect and corrected gzip fetches.

1. Zetetic, [SQLCipher design](https://www.zetetic.net/sqlcipher/design/) and [editions](https://www.zetetic.net/sqlcipher/). Page/journal encryption, temporary-file conditions and compiled integration.
2. Zetetic, [SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/). Key validation, export, rekey and migration limitations.
3. Zetetic, [Community license](https://github.com/sqlcipher/sqlcipher/blob/master/LICENSE.md). Redistribution and notice conditions; review the chosen release before use.
4. Repository facts are traced in the linked source files and accepted ADRs above; they are separate from external support claims.
5. Electron, [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage). OS key-provider security models and `basic_text` warning.
6. Electron, [native Node modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules). Electron rebuild and native module compatibility requirements.
7. IETF, [RFC 9580](https://www.rfc-editor.org/rfc/rfc9580.html) and [RFC 3156](https://www.rfc-editor.org/rfc/rfc3156.html). OpenPGP and PGP/MIME.
8. OpenPGP.js, [documentation](https://docs.openpgpjs.org/). Runtime support, license and AEAD interoperability warning. Documentation only, no release selection.
9. IETF, [RFC 8551](https://www.rfc-editor.org/rfc/rfc8551.html), [current status](https://datatracker.ietf.org/doc/rfc8551/) and [RFC 9788](https://www.rfc-editor.org/rfc/rfc9788.html). S/MIME 4.0 and protected headers.
10. Apple, [Mail on Mac](https://support.apple.com/guide/mail/sign-or-encrypt-emails-mlhlp1180/16.0/mac/15.0) and [S/MIME in iOS Mail](https://support.apple.com/en-us/102245). Certificate requirements and documented client behavior.
11. Google, [Gmail encryption](https://support.google.com/mail/answer/6330403?hl=en). TLS, hosted S/MIME and client-side encryption key ownership.
12. Microsoft, [S/MIME overview](https://learn.microsoft.com/en-us/exchange/security-and-compliance/smime-exo/smime-exo) and [Outlook for iOS and Android](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/outlook-for-ios-and-android/smime-outlook-for-ios-and-android). Feature, provisioning and recipient-key requirements.
