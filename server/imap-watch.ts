import { isDeepStrictEqual } from "node:util";
import type { ImapFlow } from "imapflow";
import type { StoredAccount } from "./store.js";
import { imap, imapOperation } from "./providers.js";

export type ImapWatchFactory = (account: StoredAccount) => ImapFlow;
type Watch = {
  account: StoredAccount;
  client?: ImapFlow;
  dispose?: () => void;
  retry?: ReturnType<typeof setTimeout>;
  change?: ReturnType<typeof setTimeout>;
  failures: number;
};

export function sameImapAccount(a: StoredAccount, b: StoredAccount) {
  return a.id === b.id && a.provider === b.provider && a.email === b.email &&
    isDeepStrictEqual(a.credentials, b.credentials);
}

// Watch connections only select INBOX and let ImapFlow enter IDLE. Fetching
// happens on the existing sync connections, so FETCH flags cannot feed back.
export class ImapWatch {
  private watches = new Map<string, Watch>();
  constructor(
    private changed: (account: StoredAccount) => void,
    private createClient: ImapWatchFactory = (account) => imap(account, true),
  ) {}

  reconcile(accounts: StoredAccount[]) {
    const eligible = accounts.filter((a) => a.provider !== "gmail" && a.credentials.imapHost && a.credentials.password);
    for (const [id, watch] of this.watches) {
      const account = eligible.find((a) => a.id === id);
      if (!account || !sameImapAccount(account, watch.account)) {
        this.watches.delete(id);
        this.stop(watch);
      }
    }
    for (const account of eligible) {
      const existing = this.watches.get(account.id);
      if (existing) {
        // The periodic/manual sync provides another bounded recovery window.
        if (!existing.client && !existing.retry) {
          existing.failures = 0;
          this.connect(existing);
        }
        continue;
      }
      const watch: Watch = { account, failures: 0 };
      this.watches.set(account.id, watch);
      this.connect(watch);
    }
  }

  close() {
    const watches = [...this.watches.values()];
    this.watches.clear();
    for (const watch of watches) this.stop(watch);
  }

  private stop(watch: Watch) {
    clearTimeout(watch.retry);
    clearTimeout(watch.change);
    watch.retry = watch.change = undefined;
    watch.dispose?.();
    watch.dispose = undefined;
    const client = watch.client;
    watch.client = undefined;
    client?.close();
  }

  private connect(watch: Watch) {
    const client = this.createClient(watch.account);
    watch.client = client;
    const current = () => this.watches.get(watch.account.id) === watch && watch.client === client;
    const changed = (event?: { path: string }) => {
      if (!current() || (event && event.path.toUpperCase() !== "INBOX") || watch.change) return;
      watch.change = setTimeout(() => {
        watch.change = undefined;
        if (current()) this.changed(watch.account);
      }, 100);
      watch.change.unref();
    };
    const disconnected = () => {
      if (!current()) return;
      this.stop(watch);
      if (++watch.failures > 5) return;
      watch.retry = setTimeout(() => {
        watch.retry = undefined;
        if (this.watches.get(watch.account.id) === watch) this.connect(watch);
      }, Math.min(1000 * 2 ** (watch.failures - 1), 30000));
      watch.retry.unref();
    };
    client.on("error", disconnected);
    client.on("close", disconnected);
    watch.dispose = () => {
      client.off("error", disconnected);
      client.off("close", disconnected);
      client.off("exists", changed);
      client.off("flags", changed);
      client.off("expunge", changed);
    };
    void (async () => {
      await imapOperation(client, () => client.connect());
      if (!current()) return;
      const mailbox = await imapOperation(client, () => client.mailboxOpen("INBOX", { readOnly: true }));
      if (!current()) return;
      if (!mailbox) throw new Error("INBOX unavailable");
      client.on("exists", changed);
      client.on("flags", changed);
      client.on("expunge", changed);
      // Catch mail that arrived while the connection was opening/reconnecting.
      changed();
    })().catch(disconnected);
  }
}
