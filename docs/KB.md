# Repository knowledge

## CI

[The CI workflow](../.github/workflows/ci.yml) runs on pull requests, pushes to `main` and manual dispatch. Each matrix job uses Node 24, installs the lockfile with `npm ci`, runs `npm test`, runs the TypeScript and production build, then packages an installer without publishing.

| Platform | Architecture | Installer | Standard runner |
| --- | --- | --- | --- |
| Windows | x64 | NSIS `.exe` | `windows-latest` |
| macOS | Apple silicon arm64 | `.dmg` | `macos-15` |
| macOS | Intel x64 | `.dmg` | `macos-15-intel` |
| Linux | x64 | `.AppImage` | `ubuntu-24.04` |

Download `installer-<platform>` from the workflow run's Artifacts section. Each artifact expires after one day. Missing installer files fail the job. Superseded runs are canceled, and each job has a 20-minute limit.

The repository is public. Standard GitHub-hosted runner execution is free under [GitHub's Actions billing policy](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Artifact storage shares the owner's plan allowance with GitHub Packages; excess artifact storage is billed at $0.25 USD per GB-month. npm cache storage has a separate 10 GB included allowance per repository. One-day artifact retention limits storage use but does not set an account spending cap. Recheck billing before making the repository private or selecting larger runners.

CI has read-only repository permissions, disables signing-certificate discovery, and passes `--publish never` to packaging. It needs no mail-provider keys or signing credentials. Installer creation proves packaging; it does not prove native launch, account sign-in, OS trust acceptance or mail delivery. Windows installers are unsigned; macOS installers are unsigned and not notarized. The existing [release workflow](../.github/workflows/release.yml) remains a separate Windows-only lane.

See [README](../README.md#ci) for usage and [ADR 0001](adr/0001-cross-platform-ci.md) for the decision.
