import { imap } from "./providers.js";
import type { ImapWatchFactory } from "./imap-watch.js";

// Existing service fixtures test polling, not watchers. No watch IO may escape.
export const quietImapWatch: ImapWatchFactory = (account) => {
  const client = imap(account, true);
  client.connect = () => new Promise<void>(() => {});
  client.close = () => {};
  return client;
};

// Provider/API fixtures own their sync requests, so revision IO must stay inert.
export const quietGmailRevision = () => new Promise<string>(() => {});
