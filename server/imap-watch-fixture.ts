import { imap } from "./providers.js";
import type { ImapWatchFactory } from "./imap-watch.js";

// Existing service fixtures test polling, not watchers. No watch IO may escape.
export const quietImapWatch: ImapWatchFactory = (account) => {
  const client = imap(account, true);
  client.connect = () => new Promise<void>(() => {});
  client.close = () => {};
  return client;
};
