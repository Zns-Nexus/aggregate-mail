# ADR 0014: Match formatted email to the app theme

Date: 2026-10-12
Status: owner-approved behavior; implementation pending verification and review.

## Context

The owner rejected bright sender backgrounds inside the dark reader and asked for neat, clear and simple formatting using the existing interface. This supersedes sender-color preservation in [ADR 0013](0013-safe-formatted-mail-and-personal-privacy.md). Its structural formatting, parser limits, privacy and image-consent decisions remain in force.

## Decision

Normalize validated sender text, background and border colors in the React renderer using existing app colors. Include legacy presentation attributes and border shorthand. Use the app's blue for links. Preserve supported tables, headings, lists, emphasis, spacing and bounded dimensions. Keep the existing body typography and sender font hierarchy.

Do not recolor image pixels or apply descendant overrides that change privacy bars. Images still require per-opening activation and remain hidden in privacy mode. Stored HTML and the parser's validation contract remain unchanged. Add no setting or dependency.

## Verification boundary

Synthetic renderer and style checks cover color normalization and retained content. Full tests and build cover integration. An isolated HTML artifact can show synthetic rendering; it does not prove installed desktop rendering or live provider behavior. Browser testing remains prohibited by PRODUCT.md.
