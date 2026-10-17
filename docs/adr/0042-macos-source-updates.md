# ADR 0042: Update macOS installations through local source builds

Date: 2026-10-16
Status: Implemented; disposable Apple silicon update cycle verified.
Extends: [ADR 0011](0011-macos-source-installation.md) and [ADR 0019](0019-app-update-prompt.md).

## Context

Repairing the update icon's hit target exposed another failure: packaged macOS
builds return an unsupported state before checking for a release. The maintainer
requested a complete download, installation and restart test. Local ad-hoc
signing remains the installation policy; no project Apple signing team is
available. Published macOS DMGs do not establish a supported native updater
route under that policy.

## Decision

Extend the existing local source-installation route. Select a strictly newer
stable release from the canonical repository, resolve its tag to an immutable
commit and require the fetched checkout to match that commit. Build in a fresh
private workspace with locked dependencies and the running app's architecture.
Require Git, Node 24 or newer, npm and Xcode Command Line Tools. Build processes
receive a minimal environment and bounded execution; they receive no mail keys
or desktop-session credentials.

Automatic release tags can retain an older committed package version. Stamp
the selected stable version only in the disposable package and lockfile root
records. Preserve dependencies, signing hooks and release workflows. Reuse
`package:mac:dir` and explicit local ad-hoc signing. Verify the result's bundle
identity, version, architecture and strict deep signature before staging it
beside the installed app. Recheck staged content before replacement. Reject
unsafe paths, symlink destinations and unwritable installation locations.

Complete the build before pausing mail. Reuse the existing service and renderer
drain, draft-save handling and native close cancellation. Cancellation resumes
mail without replacing the app. A separate helper must be ready before the app
quits, wait for the original process to exit, retain the previous bundle, promote
the staged bundle and ask macOS LaunchServices to open that exact destination.
Preserve an explicitly selected profile. Direct detached execution from the
helper can deny interactive Keychain access; LaunchServices supplies the desktop
session. Its successful dispatch is not replacement-process readiness. The helper never opens, copies, migrates or deletes mail data.

Retain recovery material on failure. Replacement rollback is limited to failure
before the launcher starts. Once dispatch is possible, do not automatically
launch an older app: bundle backup alone cannot establish
database downgrade safety.

Keep Windows/Linux metadata, version, architecture, size, SHA512 and publisher
checks intact. A pinned Git commit and locked dependencies are the macOS source
verification contract. A locally calculated staging digest detects subsequent
changes; it is not a published publisher signature.

## Verification and limits

Synthetic checks must cover source selection and pinning, version stamping,
environment filtering, failed builds, signature and staging verification,
unsafe paths, cancellation and replacement failures. Native acceptance requires
a disposable installation, real source download and build, same-path app
replacement, original-process exit, a new process with the expected installed
version, renderer and service readiness, preserved synthetic encrypted data,
retained recovery material and process cleanup. Installer dispatch alone is
insufficient.

A disposable Apple silicon test used native pointer clicks to update 0.1.10 to
0.1.12, pinned to `f88bd6e5ce731b40ef80a9b8ff39f631c1704133`. It fetched
and built the real source, replaced the same app path, then opened the
uninstrumented replacement through LaunchServices. Its service owned the
listener, its renderer displayed the synthetic encrypted template name, subject
and body, and the encrypted record and key-wrapper hashes stayed identical. The
original and replacement exited, the native Quit action worked, the service
port was free, and the signed previous bundle was retained. Direct helper-context
execution had failed with Keychain interaction error `-25308`; the LaunchServices
cycle passed without changing encryption or Keychain items.

An update to a release that predates this adapter proves one cycle only. Further
updates require the adapter in the replacement release. Keychain migration,
Intel execution and Windows/Linux native update installation remain separate
claims. Temporary profiles prevent saved-account import but do not isolate
named Keychain services.

This change introduces no Apple credentials, Developer ID signing,
notarization, quarantine removal, Gatekeeper bypass or release-workflow changes.
The maintainer requested that PR #68 remain open. No merge or publication is
authorized.
