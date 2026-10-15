import type { StoredAccount } from "./store.js";
import { sameImapAccount } from "./imap-watch.js";
import { gmailHistoryId } from "./providers.js";

export const gmailPollInterval = 15000;
type Watch = {
  account: StoredAccount;
  timer?: ReturnType<typeof setTimeout>;
  historyId?: string;
  failures: number;
};

// Installed Gmail clients poll a cheap revision marker; full sync only follows a change.
export class GmailWatch {
  private watches = new Map<string, Watch>();
  constructor(
    private changed: (account: StoredAccount) => Promise<boolean>,
    private revision = gmailHistoryId,
  ) {}

  reconcile(accounts: StoredAccount[]) {
    const eligible = accounts.filter((account) => account.provider === "gmail" && account.credentials.refreshToken);
    for (const [id, watch] of this.watches) {
      if (!eligible.some((account) => sameImapAccount(account, watch.account))) {
        clearTimeout(watch.timer);
        this.watches.delete(id);
      }
    }
    for (const account of eligible) {
      if (this.watches.has(account.id)) continue;
      const watch: Watch = { account, failures: 0 };
      this.watches.set(account.id, watch);
      this.schedule(watch);
    }
  }

  close() {
    for (const watch of this.watches.values()) clearTimeout(watch.timer);
    this.watches.clear();
  }

  private schedule(watch: Watch) {
    watch.timer = setTimeout(() => { void this.poll(watch); },
      Math.min(gmailPollInterval * 2 ** watch.failures, 300000));
    watch.timer.unref();
  }

  private async poll(watch: Watch) {
    const current = () => this.watches.get(watch.account.id) === watch;
    try {
      const historyId = await this.revision(watch.account);
      if (!current()) return;
      if (historyId !== watch.historyId) {
        if (!await this.changed(watch.account)) throw new Error("Mailbox sync did not complete.");
        if (!current()) return;
        // Do not advance the marker on failed/partial sync, or changes would be missed.
        watch.historyId = historyId;
      }
      watch.failures = 0;
    } catch {
      watch.failures = Math.min(watch.failures + 1, 5);
    } finally {
      if (current()) this.schedule(watch);
    }
  }
}
