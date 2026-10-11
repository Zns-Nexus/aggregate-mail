# 0008: Guide account setup and reuse IMAP for Google app passwords

Status: proposed for the account-onboarding change.

## Context

The account connection path sends users through general Settings. Gmail
requires users to configure a Google Cloud project before browser sign-in.
The application already supports encrypted credentials and TLS IMAP/SMTP
connections for other providers.

## Decision

Open a focused connection dialog from the inbox and reuse it in Settings.
Provide known server settings and links to each provider's app-password page.
Keep errors beside the form and preserve input for correction.

Keep configured Google OAuth as the preferred Google sign-in option. Add an
explicit Google app-password option using the existing IMAP implementation.
Represent it as `gmail-imap`, separate from the `gmail` API transport. Prevent
silent conversion of an existing account because the transports use different
remote message IDs. Gmail supplies its own Sent copy.

Keep developer OAuth configuration available as advanced setup. This change
does not register a Google application, add a hosted credential service or
bundle another application's client identity.

## Limits

Google recommends OAuth. App passwords require 2-Step Verification and can be
unavailable under Workspace policy or account security controls. The dialog
must explain this rather than suggest that a normal password will work.
See [Google's app-password guidance](https://support.google.com/accounts/answer/185833).

Synthetic connection checks prove application behavior with controlled inputs.
They do not prove a real account can authenticate or that its administrator
allows access. Existing release and live-mail authorization requirements
remain unchanged.
