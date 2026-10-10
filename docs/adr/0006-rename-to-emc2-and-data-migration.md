# 0006: Rename the application to Emc² and carry app data across

Status: accepted by the owner on 2026-10-10.

## Decision

Publish the application as Emc² from 0.1.4. Installers, the installed
application, its shortcuts, its window title and its settings copy use the new
name, and releases are named `Emc²-<version>-<os>-<arch>.<ext>`. On first launch
under the new name, `mail`, `settings.env` and `Local State` move from the
pre-rename app-data folder into the new one once, marked by `.renamed-to-emc2`. The Windows
application id stays `dev.screen.aggregate-mail`.

## Reason

The owner renamed the product and required existing installations to keep their
accounts, configuration and mail. Electron derives the app-data folder from the
application name, so renaming alone would open an empty inbox and ask the owner
to reconnect every account and lose the local store. `Local State` must travel with the mail store because Electron encrypts `mail/key.protected` with the key that file holds; without it the moved store cannot be decrypted and the mailbox reads as empty. Keeping the application id
means an installed copy is upgraded in place instead of installing beside the
old one, which would also let two copies share one mail store.

## Consequences

The pre-rename app-data folder stays on disk holding only browser caches, and
the owner may delete it. Nothing is carried when the new folder already holds
mail or settings, so a current installation is never overwritten, and the
marker keeps the step from repeating. The local MCP server is named `emc2`, so
an existing `claude mcp add` registration must be re-run. Releases up to 0.1.3
keep the old name, the old file names and the old app-data folder.
