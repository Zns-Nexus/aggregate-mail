# ADR 0013: Safe formatted email and personal-information hiding

Date: 2026-10-11
Status: owner-approved behavior; implementation awaits independent review.

## Context

The owner explicitly asked to preserve sender formatting, move Show images above the body, add editable keybindings and opening preferences, and hide personal names alongside email addresses. This supersedes the plain-text-only rendering choice in [ADR 0009](0009-opt-in-message-images.md). Its image URL policy, per-opening consent, identity checks and encrypted cache remain in force.

## Decision

Store bounded original HTML in the existing encrypted mail record. Recover missing content for one opened message through the authenticated provider path. Render only an allowlist of React elements, attributes and inline styles using the installed parser. Drop active content, global stylesheets, remote fonts and CSS resources. Bound bytes, nodes, depth and layout dimensions. Use cached plain text on rejection or recovery failure.

Place Show images above the body. Images require per-opening activation and disappear in privacy mode. Never fetch sender assets on the server. Private destinations and metadata cannot reach rendered attributes while privacy is enabled. Hide known connected-recipient names, including first names and surnames, in previews, headers and visible content. Match across sender markup, with no hidden raw text behind the bars. Preserve explicit token reveal and the compose editing exception.

Keep opening mode and validated keyboard shortcuts as local interaction preferences. Double-click stays the default. Reserve editing, Escape, Tab, account filters and system shortcuts. Keep history traversal and mail mutations behind the existing eligibility and dialog/draft guards.

## Limits

Supported formatting cannot reproduce sender stylesheets, interactive email or CID images. Unknown names present only in body text cannot be inferred reliably. Known names that are ordinary words can hide those words. Remote image activation can expose the reader's IP, cookies and redirects. Privacy controls hide the interface; they do not remove encrypted mailbox data or replace OS security.

Synthetic tests prove parsing, rendering, API access, caching, interaction and privacy paths. Installed native rendering, physical input and live providers require separate evidence. See [repository knowledge](../KB.md) and [design](../../DESIGN.md).
