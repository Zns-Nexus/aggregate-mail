# ADR 0020: Explicit images while personal text stays hidden

Date: 2026-10-13
Status: Owner-requested behavior; implementation verification and independent review are recorded in its PR.
Supersedes: The blanket privacy-mode image block in [ADR 0013](0013-safe-formatted-mail-and-personal-privacy.md) and [ADR 0014](0014-themed-formatted-mail.md). Their safe rendering and text-redaction rules remain in force.

## Context

The owner requested a working Show images button while sensitive information is hidden, and hidden scrollbar indicators. The previous reader disabled that button whenever privacy mode was active.

## Decision

Keep remote images blocked until the user selects Show images for the current opening. Allow that action while personal text is hidden, in both formatted mail and plain-text fallback galleries. Hide images, message changes, reader closure and enabling privacy revoke consent. After enabling privacy, the user can select Show images again. Consent is never saved as a preference.

Keep private text, alt descriptions and captions masked. Continue suppressing private link destinations, and block image URLs containing detected private information while privacy mode is active. Use the existing image URL validation and no-referrer policy. Sender markup that splits a private token must not bypass redaction or remove explicitly enabled safe images.

Hide scrollbar indicators with CSS. Keep existing scrollable overflow, wheel, trackpad and keyboard handling. Add no setting, dependency or scroll event handler.

## Limits and verification

Images can contain personal information in their pixels; text hiding does not redact those pixels. Explicit image loading can tell a remote sender that the message was opened. Existing unsupported URL and embedded-image limits remain.

Synthetic mounted-reader and App tests cover explicit activation, redacted content and attributes, Hide, reopening, history, privacy changes, failure and stale responses. Native appearance, physical scrolling and actual remote-image delivery remain separate proof. Preserve the live-browser-testing restriction and the existing merge/release holds.
