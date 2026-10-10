# Changelog

## 0.1.3

- Add cross-platform CI and version-tag releases for Windows x64, macOS Apple silicon and Intel, and Linux x64 installers. Retain CI artifacts for one day and attach installer checksums to releases.
- Give each CI run and rerun a distinct application version and installer filename. Replace rebuilt platform artifacts on reruns. Keep tagged releases at the matching release version.
- Add project agent instructions and contributor guidelines with repository links, verification commands and mail privacy safeguards.
- Keep the mail service running when a user cancels quitting with an unsent draft.
- Use platform-neutral encryption errors.
- Exclude local environment files, private keys, mail databases and session records from packages, and expand Git ignore rules.

## 0.1.2

- Existing Windows release with sender logos, address privacy controls and MCP settings.
