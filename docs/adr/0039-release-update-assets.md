# ADR 0039: Compatible release assets for guarded updates

Date: 2026-10-16
Status: Accepted for the maintainer-authorized combined release
Extends: [ADR 0019](0019-app-update-prompt.md)

## Context

Release v0.1.9 has CI-suffixed installers under a stable tag, GitHub-altered
Unicode filenames and no Windows or Linux updater manifests. Linux AppImage
filenames use `x86_64`, while the updater expected the process name `x64`.
These outputs cannot pass the existing updater's compatibility checks.

## Decision

Keep Emc² as the product name and use ASCII `Emc2-` installer filenames.
Map Linux process architecture `x64` to the builder's `x86_64` filename.
Retain strict version, architecture, source, ambiguity, size and SHA512 checks.

Use the checked-out tag for stable reusable builds. Configure the canonical
GitHub publisher explicitly so unpublished packaging generates updater metadata.
Before upload, validate the Windows/Linux manifest and actual installer with
the updater's existing validation and hash helpers. Fail if either is absent
or disagrees. Publish `latest.yml` and `latest-linux.yml` beside the four
installers and include all six files in `SHA256SUMS.txt`.

## Consequences and proof limits

CI still packages with `--publish never` and needs no publishing credentials.
Signing, account storage and the update icon remain unchanged. macOS automatic
installation remains unsupported under local ad-hoc signing. Synthetic tests
prove rejection paths; hosted packaging must prove real output compatibility.
Publication needs asset readback. Native two-version installation and restart
remain separate acceptance checks.
