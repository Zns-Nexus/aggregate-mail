# ADR 0036: Device-local custom theme library

Date: 2026-10-15
Status: Implemented for the owner's custom-theme request; native acceptance pending.

## Context

The owner requested custom themes using concepts from T3 Code and chose to build on the Appearance settings in the interface redesign. The existing app supports built-in palettes, independent System/Light/Dark modes, accent choices, window materials and reading layouts. Customization should use the same color tokens and leave mail rendering and privacy behavior intact.

[T3 Code's appearance guide](https://github.com/pingdotgg/t3code/blob/main/docs/user/appearance.md) and its [palette implementation](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/themePalette.ts) informed the saved library, guided/advanced editor, preview, duplicate and JSON exchange concepts. Emc² uses its own smaller palette and file format.

## Decision

- A custom theme has a local UUID, a name of 1–48 characters, and complete light and dark palettes. System mode uses the matching palette through the existing media preference. Keep built-in presets and accent choices; custom themes own their accent.
- Generate colors from background/accent seeds, with 12 individually editable roles. Apply validated colors to the existing document-root tokens. Keep privacy bars opaque and retain the bounded mail renderer and per-opening image consent.
- Preview a draft in App memory, including its scheme and native caption colors. Save both palettes explicitly. Closing, Cancel, Escape and unmount clear the preview. Editing existing themes starts in Advanced, preserving hand-tuned colors.
- Store up to 32 custom themes and the selected theme in the existing appearance record with one localStorage write. Refuse dangling selections. Preserve old preference migrations. On a failed write, retain the saved appearance and editor draft.
- Export a versioned Emc² JSON file without the local ID. Import a file or pasted JSON as a new local theme, using a fresh ID and a unique display name. Bound imports to 64 KiB and validate the full shape. Accept opaque hex colors only; reject arbitrary CSS, resource references and unknown fields.
- Confirm deletion and fall back to Black/White. Keep the library in the renderer; add no dependency, server API, desktop permission or mail operation.

## Consequences and verification

Theme preferences are per device. Export/import provides manual sharing. T3 Code and VS Code files need conversion to the Emc² format; there is no marketplace or remote theme loading. Advanced colors can reduce readability; users can Cancel previews or return to a built-in theme.

Synthetic model and mounted-App tests cover validation, persistence/restart, preview restoration, storage failures and library operations. Strict TypeScript and the production build cover integration. These checks do not establish native appearance or file-dialog/download behavior on Windows or macOS. Live application browser tests remain prohibited by PRODUCT.md.
