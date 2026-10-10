# Contributing to Aggregate Mail

Keep each contribution focused on one problem. Read [PRODUCT.md](PRODUCT.md)
for scope, [DESIGN.md](DESIGN.md) for interface behavior and
[AGENTS.md](AGENTS.md) for engineering and mail privacy safeguards. These
guidelines apply to people and AI contributors.

## Set up

Use Node 24 or newer and npm. Install the locked dependencies from the repository
root:

```sh
npm ci
```

`npm run dev` launches Electron with React and CSS hot reload. Restart it after
desktop or server changes. Development and packaged desktop builds share app
data by default. Use an isolated temporary profile for checks; follow
[the verification recipes](docs/KB.md) before launching against saved accounts.

The earlier browser development target is optional. The installed desktop app
needs no separate browser, mail-service process or Node installation.

## Make a focused change

1. Check the current branch and working tree. Work on a feature branch and
   preserve edits owned by others.
2. Trace the affected path through the renderer, desktop bridge, server and
   provider as needed. Reuse existing helpers and mail operations.
3. Make the smallest complete fix. Update affected callers, shared types and
   fixtures. Add a focused regression test for changed nontrivial behavior.
4. Update [CHANGELOG.md](CHANGELOG.md) and the relevant internal documentation.
   Keep current facts in [docs/KB.md](docs/KB.md). Record new architectural
   decisions in `docs/adr/` without replacing accepted history.

## Verify the change

For application changes:

```sh
npm test
npm run build
```

Tests use Node's test runner through `tsx` and cover `server/*.test.ts`,
`desktop/*.test.ts`, `scripts/*.test.mjs` and `src/*.test.tsx`. The build checks
strict TypeScript, builds the renderer into `dist/` and bundles Electron code
into `.desktop/`.

| Changed area | Additional proof |
| --- | --- |
| MCP | `node scripts/check-mcp.mjs` for the isolated handshake and access check |
| Electron, preload, storage or packaging | Isolated `npm run check:desktop` from docs/KB.md |
| Native Windows or macOS behavior | Startup on the affected OS and architecture |
| Documentation only | Relative links, command and source review, `git diff --check` |

Keep live account sign-in, mailbox changes, sending, interactive UI and
downloaded-app acceptance separate from automated test results. State which
checks were run and which remain unverified. Preserve the current restriction
on live browser tests in PRODUCT.md.

## Package locally

`npm run package` creates the Windows NSIS installer. On a Mac,
`npm run package:mac` creates unsigned DMG and ZIP files, and
`npm run package:mac:dir` creates the app bundle only. Output goes to `release/`.
See [README.md](README.md) for architecture selection and installation limits,
and [ADR 0001](docs/adr/0001-unsigned-macos-packaging.md) for the signing decision.

Packaging does not publish a release. Release tags, the release script and
workflow dispatch can publish artifacts; use them only within explicit release
authorization. Do not include generated output or local app data in a source PR.

## Submit a pull request

- Explain the problem, the resulting behavior and the checks performed.
  Include reproduction steps for a bug and identify any remaining proof gaps.
- Keep the diff within the agreed scope. Inspect source, fixtures and commit
  author/committer metadata for private information before pushing. Use
  synthetic data in any supporting capture.
- AI contributors must follow their governing review, commit and delivery
  gates. This guide does not grant merge, publishing or credential authority.
- Resolve blocking review feedback and satisfy required checks and approvals.
  A passing mock or startup check does not prove real provider operations.
