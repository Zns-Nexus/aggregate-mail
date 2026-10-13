# Email-client pain points and Emc² priorities

Research date: 2026-10-12. Product baseline: `18d63cb3ac500246d9227ccf1a07c3a985269fee`.

Make mail state trustworthy and common actions easy to find before adding more automation. The public reports below show the cost of a message appearing unread again, an action affecting the wrong message, or a notification failing for one account. They support testing these failure modes in Emc². They do not establish how often they occur across email users.

## What we inspected

Two research agents inspected 13 public reports: five Betterbird GitHub issues, five Mailspring GitHub issues and three eM Client forum threads. The Controller compared the findings with the current [product scope](../PRODUCT.md), [interface behavior](../DESIGN.md) and [repository knowledge](KB.md).

This is a purposive sample selected around the requested features. It is not a customer survey, a random sample, or feedback from Emc² users. Mailspring reports date from 2017 to 2020; some were fixed, and migration to another forum does not prove resolution. Most selected Betterbird items are feature requests rather than confirmed defects. The eM Client pages showed month and day without a year. No year is inferred.

A Google search hit a bot-check page and was stopped. Direct eM Client forum pages were accessible through the T3 browser. Apple Support Community loaded, but the bounded pass did not identify a relevant complaint. No authenticated customer-support inboxes or private accounts were accessed.

## Priority for team discussion

The order below reflects potential user harm and relevance to Emc², not measured complaint frequency.

| Priority | Pain point and evidence | Emc² response | Acceptance condition |
| --- | --- | --- | --- |
| 1 | Read state reverses or an action affects the wrong message. Mailspring reports describe unread mail returning and actions touching another email [M3, M5]. | Bind actions to the selected message ID and account. Show pending work, apply confirmed read results immediately, and retain mail after failure. | Rapid actions, sync completion and account changes cannot redirect an action or overwrite a confirmed read. |
| 2 | A unified inbox does not provide dependable notifications for every account. Betterbird has an intermittent notification-rendering report; a historical Mailspring multi-account notification defect was fixed [B1, M1]. | Detect IMAP events promptly, coalesce updates and test arrivals independently for each account. Preserve first-import suppression and privacy-safe notification text. | One account's failure does not block another account's arrivals; reconnect and initial import do not flood notifications. |
| 3 | Core actions are difficult to discover, and post-delete navigation can surprise users [B3, M3, E1]. | Put Read, Done, Snooze and Move to Trash in a visible, keyboard-accessible toolbar. Keep archive and Trash distinct. | Users can act without knowing a shortcut; canceling Trash changes nothing; deleting the last result does not act on its replacement. |
| 4 | Search and filters hide relevant mail or fail to explain a match [B5, M4, E2]. | Expose unread and relevance filters and predictable sort choices alongside the existing account, label and text filters. State that search uses the local cache. | Combined filters produce stable results, show an explicit empty state and can be cleared. Sorting cannot change the opened message. |
| 5 | Snooze is missing or mail returns incorrectly [B2, M2]. | Make local Snooze and Return to inbox visible. Preserve the message body and account when mail returns. | Snoozing removes only the selected message until its chosen time; returning it retains content and identity. |
| 6 | Users cannot inspect the complete sender identity [E3]. | Preserve the existing explicit address-reveal interaction and privacy controls. Treat clearer sender inspection as a follow-up hypothesis. | A user can deliberately inspect an address without exposing other hidden personal information. |

## What the requested stack should cover

1. **Mail actions.** A visible toolbar, pending and confirmed read feedback, local Snooze access and a separate confirmed Move to Trash action. Done continues to archive. Trash never permanently deletes mail; recovery remains in the provider's Trash.
2. **Accounts and filters.** A clear Add account path and account selection that still works with several IMAP accounts. Reuse the existing multi-account scheduler. Add unread/relevance filtering and explicit sort choices without changing Important/Other classification.
3. **Live updates.** Use IMAP mailbox events to schedule account sync and feed the existing native-notification path. Keep periodic recovery. Gmail API accounts remain subject to their supported polling path unless a separate push integration is approved. Do not label a shorter polling interval as provider push.

These are implementation acceptance goals. This report does not claim that the stack, native notifications or live-provider behavior has passed verification. Track delivery and evidence in [issue #35](https://github.com/screen-devs/aggregate-mail/issues/35).

## Suggestions beyond this stack

- Add Undo for reversible mail actions after provider identity and recovery behavior are defined. A confirmation prevents accidental Trash moves, but Undo could reduce interruption for frequent users.
- Add notification controls by account and category, plus a quiet period. First confirm whether users want all arrivals or only Important mail. Avoid exposing message text in a notification by default.
- Show each account's last successful sync and a clear pending/error state. Distinguish saved credentials, a connected server and a fully synchronized inbox.
- Highlight search matches in the reader and show active search scope. Treat remote archive search as separate work because the current cache does not contain every provider message.
- Test the design with a small set of representative users before claiming improved usability. Include people with several personal/work accounts, keyboard users and people who rely on snooze. Observe task completion and errors; do not infer retention or demand from issue counts.

These are proposals for discussion, not authorization to expand the implementation.

## Source notes

| ID | Direct source and reported date | Observed complaint and disposition |
| --- | --- | --- |
| B1 | [Betterbird #599: Temporarily blank notifications](https://github.com/Betterbird/thunderbird-patches/issues/599), 2026-09-16 | Intermittent black Windows notifications with delayed text. The reporter had three IMAP accounts; another commenter described a similar dark-theme issue. A proposed build helped but one failure remained. Open when inspected; no final fix established. |
| B2 | [Betterbird #308: Snooze email](https://github.com/Betterbird/thunderbird-patches/issues/308), 2024-06-07 | The reporter wanted Gmail-style temporary removal and a reminder. The maintainer deferred the work pending funding. Open feature request. |
| B3 | [Betterbird #500: Jump to first unread](https://github.com/Betterbird/thunderbird-patches/issues/500), 2025-11-06 | The reporter wanted direct unread navigation. The maintainer pointed to the existing N shortcut, including cross-folder behavior. Evidence of a possible discoverability gap, not proof the capability was absent. |
| B4 | [Betterbird #576: Mark messages read when moved to Trash](https://github.com/Betterbird/thunderbird-patches/issues/576), 2026-06-29 | Unread Trash counts caused manual cleanup. Discussion noted that filter, delete, move and drag paths have different intent. Open request; it does not justify silently changing read state on every Trash move. |
| B5 | [Betterbird #549: Global Search fallback for junk-marked messages](https://github.com/Betterbird/thunderbird-patches/issues/549), 2026-03-18 | A legitimate message marked junk could disappear from Global Search while still in Inbox. Maintainer response called for further analysis. Open when inspected. |
| M1 | [Mailspring #1632: Notifications on only one account](https://github.com/Foundry376/Mailspring/issues/1632), 2019-09-10 | Notifications reportedly appeared only for the first account. Reporter confirmed a fix in 1.7.0. Historical regression example, not a current defect claim. |
| M2 | [Mailspring #413: Snoozed items restore with a blank body](https://github.com/Foundry376/Mailspring/issues/413), 2017-12-07 | Some restored messages had blank content and duplicate search entries. Reporter later stopped seeing the issue and suggested closure. No specific fix identified. |
| M3 | [Mailspring #1936: Archive also affects the most recent email](https://github.com/Foundry376/Mailspring/issues/1936), 2020-04-24 | An action on an older open email reportedly also affected a newer one. Comments described related actions and pointer input. Closed as a duplicate and migrated; the inspected record does not confirm a fix. |
| M4 | [Mailspring #1480: Attachment search fails](https://github.com/Foundry376/Mailspring/issues/1480), 2019-04-28 | Combining has:attachment with other text could leave search running. Maintainer reproduced it and reported a fix in 1.6.3. Historical regression example. |
| M5 | [Mailspring #1908: Read messages reappear unread](https://github.com/Foundry376/Mailspring/issues/1908), 2020-04-16 | A reporter with three Gmail accounts saw read state reverse in the unified Unread view. Another commenter reported unread-count inconsistency. Closed after forum migration; current applicability unknown. |
| E1 | [eM Client: Behavior after deleting the last message in a list](https://forum.emclient.com/t/behavior-after-deleting-the-last-message-in-a-list/118357), Aug 31, year not shown | The reporter wanted the message window to close instead of opening an already-read message. An unread filter solved that reporter's case; a later participant still requested a simple close option and raised accidental double-click deletion. |
| E2 | [eM Client 11: Search words not highlighted in email body](https://forum.emclient.com/t/em-client-11-search-words-not-highlighted-in-email-body/119461), Oct 12, year not shown | A user wanted search terms highlighted in the reading pane while reviewing results, without opening each message and invoking Find. A single user report. |
| E3 | [eM Client: From address gets abbreviated](https://forum.emclient.com/t/suggestion-from-email-address-gets-abbreviated-stop/119418), Oct 11, year not shown | A user objected to abbreviated sender addresses. The reply focused on possible phishing, so the underlying usability evidence is limited. |

Source status reflects the research pass and can change. No individual names, account details or private mailbox content are included.
