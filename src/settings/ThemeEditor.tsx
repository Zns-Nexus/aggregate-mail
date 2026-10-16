import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { Segmented } from "../ui/Segmented";
import {
  generatePalette, maxThemeFileBytes, paletteFields, parseThemeFile, themeColorSchema,
  themeNameSchema, type CustomTheme, type Palette, type ThemePreview,
} from "../themes";

function ColorField({ field, value, onChange }: {
  field: (typeof paletteFields)[number];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText((current) => {
    const color = themeColorSchema.safeParse(current);
    return color.success && color.data === value ? current : value;
  }), [value]);
  const valid = themeColorSchema.safeParse(text).success;
  return (
    <div className="settings-row theme-color">
      <label htmlFor={id}>{field.label}</label>
      <div>
        <input type="color" aria-label={`${field.label} color`} value={value}
          onChange={(event) => { setText(event.target.value); onChange(event.target.value); }} />
        <input id={id} aria-label={`${field.label} hex`} value={text} required
          pattern="#[a-fA-F0-9]{3}([a-fA-F0-9]{3})?" maxLength={7}
          aria-invalid={!valid} spellCheck={false}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const color = themeColorSchema.safeParse(next);
            if (color.success) onChange(color.data);
          }} />
      </div>
    </div>
  );
}

export function ThemeEditor({ initial, scheme: initialScheme, editing, onSave, onPreview, onClose }: {
  initial: CustomTheme;
  scheme: ThemePreview["scheme"];
  editing: boolean;
  onSave: (theme: CustomTheme) => string | null;
  onPreview: (preview: ThemePreview | null) => void;
  onClose: () => void;
}) {
  const [theme, setTheme] = useState(initial);
  const [scheme, setScheme] = useState(initialScheme);
  const [advanced, setAdvanced] = useState(editing);
  const [error, setError] = useState("");
  const palette = theme.palettes[scheme];
  useLayoutEffect(() => { onPreview({ scheme, palette }); }, [scheme, palette, onPreview]);
  useLayoutEffect(() => () => onPreview(null), [onPreview]);
  const updateColor = (field: keyof Palette, color: string) => {
    const next = { ...palette, [field]: color };
    setTheme({ ...theme, palettes: { ...theme.palettes,
      [scheme]: !advanced && (field === "canvas" || field === "accent")
        ? generatePalette(next.canvas, next.accent, scheme) : next,
    } });
  };
  return (
    <Dialog title={editing ? "Edit theme" : "Create theme"} onClose={onClose}>
      <form className="theme-editor" onSubmit={(event) => {
        event.preventDefault();
        if (!event.currentTarget.checkValidity()) return;
        const name = themeNameSchema.safeParse(theme.name);
        if (!name.success) { setError("Enter a name of 1 to 48 characters."); return; }
        const failure = onSave({ ...theme, name: name.data });
        if (failure) setError(failure);
      }}>
        <label className="theme-name">Name
          <input value={theme.name} required maxLength={48}
            onChange={(event) => { setTheme({ ...theme, name: event.target.value }); setError(""); }} />
        </label>
        <div className="settings-row">
          <span id="palette-label">Edit palette</span>
          <Segmented labelledBy="palette-label" value={scheme}
            choices={[{ id: "dark", label: "Dark" }, { id: "light", label: "Light" }]}
            onChange={setScheme} />
        </div>
        <p className="note">Previewing across the app. Cancel restores your current theme.</p>
        <div className="settings-group theme-colors" key={scheme}>
          {paletteFields.filter((field) => advanced || field.id === "canvas" || field.id === "accent").map((field) => (
            <ColorField key={field.id} field={field} value={palette[field.id]}
              onChange={(color) => updateColor(field.id, color)} />
          ))}
        </div>
        <label className="settings-row">
          <span>Advanced colors</span>
          <input type="checkbox" role="switch" checked={advanced}
            onChange={(event) => setAdvanced(event.target.checked)} />
        </label>
        <p className="note">{advanced
          ? "Adjust each color independently. Both palettes are saved together."
          : "Background and accent generate matching colors for this palette. Use Advanced to fine-tune them."}</p>
        {error && <p className="theme-error" role="alert">{error}</p>}
        <div className="theme-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">Save theme</button>
        </div>
      </form>
    </Dialog>
  );
}

export function ImportTheme({ onImport, onClose }: {
  onImport: (theme: Omit<CustomTheme, "id">) => string | null;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  return (
    <Dialog title="Import theme" onClose={onClose}>
      <form className="theme-editor" onSubmit={(event) => {
        event.preventDefault();
        if (reading) return;
        try {
          const failure = onImport(parseThemeFile(text));
          if (failure) setError(failure);
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "This theme could not be imported.");
        }
      }}>
        <p className="dialog-copy">Choose an Emc² theme JSON file or paste its contents. Import creates a new theme.</p>
        <label className="theme-name">Theme file
          <input type="file" accept=".json,application/json" disabled={reading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setError("");
              if (file.size > maxThemeFileBytes) { setError("Theme files must be 64 KB or smaller."); return; }
              setReading(true);
              try {
                const contents = await file.text();
                if (active.current) setText(contents);
              } catch { if (active.current) setError("This file could not be read. Try pasting its JSON."); }
              finally { if (active.current) setReading(false); }
            }} />
        </label>
        <label className="theme-name">Theme JSON
          <textarea value={text} required maxLength={maxThemeFileBytes} rows={8} spellCheck={false} disabled={reading}
            onChange={(event) => { setText(event.target.value); setError(""); }} />
        </label>
        {error && <p className="theme-error" role="alert">{error}</p>}
        <div className="theme-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={reading || !text.trim()}>{reading ? "Reading file…" : "Import theme"}</button>
        </div>
      </form>
    </Dialog>
  );
}
