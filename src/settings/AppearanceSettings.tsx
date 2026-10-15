import {
  accents, modes, readingLayouts, supportsGlass, themes, transparencyChoices,
  type Appearance, type Scheme,
} from "../appearance";
import { Segmented } from "../ui/Segmented";

/** Mode, theme, accent, transparency and reading layout, grouped as System Settings groups them. */
export function AppearanceSettings({ value, scheme, onChange }: {
  value: Appearance;
  scheme: Scheme;
  onChange: (value: Appearance) => void;
}) {
  const glass = supportsGlass();
  return (
    <div className="appearance-settings">
      <div className="settings-group">
        <div className="settings-row">
          <span id="mode-label">Mode</span>
          <Segmented labelledBy="mode-label" value={value.mode} choices={modes}
            onChange={(mode) => onChange({ ...value, mode })} />
        </div>
        <div className="settings-row stacked">
          <span id="theme-label">Theme</span>
          <div className="theme-choices" role="radiogroup" aria-labelledby="theme-label">
            {themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={value.theme === theme.id}
                className={value.theme === theme.id ? "active" : undefined}
                onClick={() => onChange({ ...value, theme: theme.id })}
              >
                <span className="theme-preview" style={{ background: theme[scheme] }} aria-hidden="true">
                  <i />
                  <b />
                </span>
                {scheme === "light" ? theme.lightLabel : theme.label}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span id="accent-label">Accent</span>
          <div className="accent-choices" role="radiogroup" aria-labelledby="accent-label">
            {accents.map((accent) => (
              <button
                key={accent.id}
                type="button"
                role="radio"
                aria-checked={value.accent === accent.id}
                aria-label={accent.label}
                title={accent.label}
                className={value.accent === accent.id ? "active" : undefined}
                style={{ background: accent[scheme] }}
                onClick={() => onChange({ ...value, accent: accent.id })}
              />
            ))}
          </div>
        </div>
      </div>
      <h2>Window</h2>
      <div className="settings-group">
        <div className="settings-row">
          <span id="transparency-label">Transparency</span>
          <Segmented labelledBy="transparency-label" value={glass ? value.transparency : "off"}
            choices={transparencyChoices()} disabled={(choice) => !glass && choice !== "off"}
            onChange={(transparency) => onChange({ ...value, transparency })} />
        </div>
        <div className="settings-row">
          <span id="reading-label">Reading pane</span>
          <Segmented labelledBy="reading-label" value={value.reading} choices={readingLayouts}
            onChange={(reading) => onChange({ ...value, reading })} />
        </div>
      </div>
      <p className="note">
        {!glass ? "Transparency needs macOS or Windows 11. "
          : value.transparency === "glass" ? "Glass blurs what is behind the window. It can lag while the window moves. "
          : value.transparency === "subtle" ? "Subtle tints the window from your wallpaper and stays smooth. " : ""}
        {value.reading === "split"
          ? "Side by side shows opened mail beside the list; narrow windows open it in place of the list."
          : "Full width opens mail in place of the list until you close it."}
      </p>
    </div>
  );
}
