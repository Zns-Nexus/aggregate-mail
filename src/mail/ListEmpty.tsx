import { ArrowRight } from "../ui/icons";

/** What an empty mail list says: loading, no accounts, no matches or nothing in this view. */
export function ListEmpty({ loaded, hasAccounts, filtered, title, viewName, syncing, onConnect, onReset, onSync }: {
  loaded: boolean;
  hasAccounts: boolean;
  filtered: boolean;
  title: string;
  viewName: string;
  syncing: boolean;
  onConnect: () => void;
  onReset: () => void;
  onSync: () => void;
}) {
  return (
    <div className="empty">
      <p className="empty-title">
        {!loaded ? "Loading" : !hasAccounts ? "No accounts connected" : filtered ? "No matching mail" : title}
      </p>
      {loaded &&
        (!hasAccounts ? (
          <button className="link" onClick={onConnect}>
            Connect an account <ArrowRight color="currentColor" size={11} />
          </button>
        ) : filtered ? (
          <>
            <p>No cached mail matches these controls in {viewName}.</p>
            <button type="button" className="link" onClick={onReset}>Reset filters and sort</button>
          </>
        ) : (
          <button className="link" disabled={syncing} onClick={onSync}>
            {syncing ? "Syncing" : "Sync now"}
          </button>
        ))}
    </div>
  );
}
