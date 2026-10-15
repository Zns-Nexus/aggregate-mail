# Security policy

## Supported versions

Security fixes land on `main` and ship in the next tagged release. Installers are
published as `Emc²-<version>-<os>-<arch>.<ext>`.

| Version | Supported |
| --- | --- |
| 0.1.3 and later | Yes |
| Earlier | No |

## Report a vulnerability

Report privately through GitHub's [private vulnerability
reporting](https://github.com/screen-devs/aggregate-mail/security/advisories/new)
(Security → Advisories → Report a vulnerability). Include the version, the
platform, and the steps or proof of concept that show the problem.

Do not open a public issue for a vulnerability, and do not include mail content,
addresses, account names or credentials in a report. A reproduction against a
throwaway profile is easier to act on than one against real mail.

This is a volunteer project with no bug bounty. Expect an acknowledgement within
a few days and either a fix or an explanation of the risk in the next release.

## In scope

- The desktop app: Electron main process, preload bridge and React renderer.
- The bundled mail service and its local HTTP and MCP endpoints, including their
  authentication and CSRF handling.
- Credential and storage handling: OAuth tokens, `settings.env`,
  `key.protected`, and the encrypted mail store.
- The release installers, the update path between versions, and the one-time
  app-data migration that carries an installation across the Emc² rename.

## Out of scope

- Mail providers' own services and the mail servers they run.
- Problems that require an attacker to already hold administrator rights on the
  machine, or to hold the key that decrypts the local mail store.
- Missing hardening with no path to exploit, and reports from automated scanners
  with no reproduction.
