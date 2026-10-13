import { useEffect, useRef, useState } from "react";
import type { UpdateBridge, UpdateCommand, UpdateReason, UpdateState } from "../shared/updates";

const explanations: Record<UpdateReason, string> = {
  development: "Updates are available only in an installed release build.",
  "mac-signing": "Automatic installation is unavailable for this macOS build. Use the documented source installation route.",
  platform: "Automatic updates are unavailable for this system or app architecture.",
  appimage: "Automatic installation requires running the installed Linux AppImage.",
  metadata: "This release has no compatible updater metadata. Automatic installation is unavailable.",
  candidate: "The release files do not match a stable version for this app and architecture. Automatic installation is unavailable.",
  network: "The update check failed. Check your connection, then try again.",
  download: "The update download failed. Check for updates to try again.",
  verification: "The downloaded update could not be verified. It was not handed to the installer.",
  "mail-busy": "Mail work did not finish in time. The app remains open. Try again after it finishes.",
  cancelled: "Installation cancelled. Your draft is still open.",
  installer: "The update installer could not start. Check for updates to try again.",
};

export function UpdateNotice({ bridge, onInstalling }: { bridge?: UpdateBridge; onInstalling?: (installing: boolean) => void }) {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    if (!bridge) return;
    let received = false;
    const unsubscribe = bridge.onState((next) => { received = true; setState(next); });
    void bridge.state().then((next) => { if (active.current && !received) setState(next); }, () => {
      if (active.current && !received) setState({ phase: "error", reason: "network" });
    });
    return () => { active.current = false; unsubscribe(); };
  }, [bridge]);
  useEffect(() => { onInstalling?.(state.phase === "installing"); }, [state.phase, onInstalling]);
  if (!bridge) return null;
  const command = async (action: UpdateCommand) => {
    if (locked.current) return;
    locked.current = true; setPending(true);
    try {
      let next = await bridge.command(action);
      if (action === "download" && next.phase === "ready") next = await bridge.command("install");
      if (active.current) setState(next);
    } catch {
      if (active.current) setState({ phase: "error", reason: action === "check" ? "network" : "installer" });
    } finally { locked.current = false; if (active.current) setPending(false); }
  };
  const busy = pending || ["checking", "downloading", "installing"].includes(state.phase);
  const text = state.phase === "checking" ? "Checking for updates…"
    : state.phase === "current" ? "You have the latest stable version."
    : state.phase === "available" ? `Emc² ${state.version} is available.`
    : state.phase === "downloading" ? `Downloading Emc² ${state.version}…`
    : state.phase === "installing" ? "Finishing mail work before installation…"
    : state.phase === "ready" ? `Emc² ${state.version} is downloaded.`
    : state.phase === "idle" ? "App updates"
    : "Automatic update unavailable";
  return <aside className="update-notice" aria-label="App update" aria-busy={busy}>
    <div role="status" aria-live="polite">
      <span>{text}</span>
      {state.reason && <p>{explanations[state.reason]}</p>}
      {state.phase === "downloading" && <progress aria-label="Update download" max={100} value={state.percent} />}
    </div>
    {state.phase !== "unsupported" && <button type="button" className="action" disabled={busy}
      onClick={() => void command(state.phase === "available" ? "download" : state.phase === "ready" ? "install" : "check")}>
      {state.phase === "available" ? "Download, install and restart" : state.phase === "ready" ? "Install and restart" : "Check for updates"}
    </button>}
  </aside>;
}
