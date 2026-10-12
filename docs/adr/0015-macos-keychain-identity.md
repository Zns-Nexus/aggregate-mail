# ADR 0015: Preserve macOS protected-key identity across the app rename

Date: 2026-10-12
Status: Recovery behavior authorized for the downloaded-build startup repair.
Supersedes: ADR 0006's assumption that carrying `Local State` preserves macOS key access. Its profile migration and Windows identity remain unchanged.

Electron derives the macOS Keychain item from the application name before
startup. A protected key created as `Aggregate Mail` cannot be decrypted with
the new `Emc²` identity. Fresh Emc² profiles must retain their current identity.

Keep the current profile path. For an existing protected key without confirmed
identity metadata, first try Emc², then allow one relaunch using the legacy
identity selected before Electron initialization. Preserve the startup-check
exit status across that relaunch. Validate the decrypted value as a canonical
32-byte key before importing the mail service. Record a successful identity
and the protected-file digest atomically; do not rewrite the protected key.

Missing keys for existing databases, unavailable encryption and failed
decryption stop startup. Do not reset profiles, replace unreadable keys or
substitute weaker encryption. Explicit temporary profiles bypass saved-profile
migration and development-data import. Reject invalid profile arguments before
accessing a default profile.

Synthetic tests cover legacy and current identities, relaunch, identity
metadata, profile collisions, failure branches and Windows behavior. Packaged
macOS startup needs separate native proof with synthetic profiles. These checks
do not prove access to a user's saved Keychain or a real mailbox.
