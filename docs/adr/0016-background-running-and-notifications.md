# ADR 0016: Run in the background with a tray and native notifications

Date: 2026-10-12
Status: Accepted for the background-running change.
Supersedes: ADR 0001's close-to-quit behavior. Its packaging, signing and macOS
menu decisions remain unchanged.

## Context

The window owned the app's lifetime. Closing it closed the mail service, so mail
arrived only while the window was open, and the desktop main process had no way
to report an arrival the renderer was not watching for.

## Decision

Close the desktop window to a tray icon instead of exiting. The window, its mail
service and a main-process sync timer every five minutes keep running while it
is hidden. The tray menu reopens the window or quits, a second launch restores
the window, and a system session end or an application quit still exits. The
startup check closes the window and requires the tray and the hidden service to
survive.

The server emits `new-mail` with the number of new unread messages a completed
sync run found, and `startServer` takes the matching callback. The desktop main
process shows one native notification per run and reopens the window when it is
clicked. The first successful sync of an account imports its cache, so it
reports no arrivals; `StoredAccount.hasSynced` records that boundary, and a sync
that failed for an account reports none either.

Detection stays in the main process. The renderer gains no new permission and
the desktop session keeps denying renderer notification requests. Editable fields
and selected text keep a native editing menu for undo, redo, cut, copy, paste and
select all, with items enabled from the platform's edit flags; mail rows keep the
renderer's own menu.

## Consequences

Mail keeps arriving and notifying while the app is hidden, so quitting is an
explicit action rather than a side effect of closing a window. An unsent draft
still blocks quitting and asks for confirmation, and cancelling that prompt
returns the app to the hidden state.

Synthetic tests cover the arrival counting, the first-import boundary, the failed
sync and the mocked startup close path, and the Windows desktop startup check
proves a real tray with the mail service surviving. Notification delivery and
macOS tray behavior with a real account still need separate native proof. This
decision grants no release, credential or publishing authority.
