import { useEffect, useState } from "react";
import type { McpSettings } from "../../shared/types";
import type { Api, Perform } from "../api";
import { ChevronDown } from "../ui/icons";

export function McpSection({
  api,
  perform,
  busy,
}: {
  api: Api;
  perform: Perform;
  busy: boolean;
}) {
  const [settings, setSettings] = useState<McpSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<McpSettings>("/mcp")
      .then(setSettings)
      .catch((error: unknown) =>
        setError(
          error instanceof Error
            ? error.message
            : "Could not load MCP settings.",
        ),
      );
  }, [api]);
  // Turning MCP on reveals its options and turning it off folds them away.
  useEffect(() => {
    if (settings) setOpen(settings.enabled);
  }, [settings?.enabled]);
  const update = (
    input:
      | Partial<Pick<McpSettings, "enabled" | "allowSending">>
      | { regenerateToken: boolean },
  ) =>
    void perform(async () => {
      setSettings(await api<McpSettings>("/mcp", "PATCH", input));
    });
  const endpoint = "http://127.0.0.1:32145/mcp";
  const snippets = [
    ["Endpoint", endpoint],
    ...(settings?.token
      ? [
          ["Token", settings.token],
          [
            "Claude Code",
            `claude mcp add --transport http emc2 ${endpoint} --header "Authorization: Bearer ${settings.token}"`,
          ],
          [
            "JSON config",
            JSON.stringify(
              {
                mcpServers: {
                  "emc2": {
                    url: endpoint,
                    headers: { Authorization: `Bearer ${settings.token}` },
                  },
                },
              },
              null,
              2,
            ),
          ],
        ]
      : []),
  ];
  return (
    <section className="mcp-settings">
      <div className="section-head">
        <h1>MCP</h1>
        <button
          className="disclosure"
          aria-expanded={open}
          aria-controls="mcp-options"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide options" : "Show options"}
          <ChevronDown color="currentColor" size={12} className={open ? "up" : undefined} />
        </button>
      </div>
      <p className="note">
        Let AI clients read synced mail while the app is running. Sending
        replies is opt-in.
      </p>
      {error && <p role="alert">{error}</p>}
      {settings && (
        <>
          <div className="settings-group">
          <label className="settings-row">
            <span>Enable MCP</span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.enabled}
              disabled={busy}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
          </label>
          </div>
          {open && (
            <div className="disclosure-body" id="mcp-options">
              <div className="settings-group">
              <label className="settings-row">
                <span>Allow sending replies</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings.allowSending}
                  disabled={busy || !settings.enabled}
                  onChange={(e) => update({ allowSending: e.target.checked })}
                />
              </label>
              {snippets.map(([label, value]) => (
                <div className="mcp-copy" key={label}>
                  <div>
                    <strong>{label}</strong>
                    <pre>{value}</pre>
                  </div>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void perform(
                        () => navigator.clipboard.writeText(value),
                        `${label} copied.`,
                      )
                    }
                  >
                    Copy
                  </button>
                </div>
              ))}
              </div>
              {settings.token && (
                <button
                  className="button settings-action"
                  disabled={busy}
                  onClick={() => update({ regenerateToken: true })}
                >
                  Regenerate token
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
