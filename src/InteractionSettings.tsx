import { useId, useState } from "react";
import { defaults, interactionActions, shortcutFromEvent, shortcutLabel, validateShortcut, type InteractionPreferences } from "./interaction";

export function InteractionSettings({ value, onChange }: {
  value: InteractionPreferences;
  onChange: (value: InteractionPreferences) => void;
}) {
  const prefix = useId();
  const [error, setError] = useState("");
  return <section data-interaction-settings aria-label="Interaction settings">
    <label htmlFor={`${prefix}-opening`}>Open email</label>
    <select id={`${prefix}-opening`} value={value.opening}
      onChange={(event) => onChange({ ...value, opening: event.target.value as InteractionPreferences["opening"] })}>
      <option value="double">Double click</option>
      <option value="single">Single click</option>
    </select>
    <p>Double click selects a row first, then opens it. Single click opens it once and marks it read once.</p>
    <p id={`${prefix}-hint`}>Focus a shortcut and press a key combination. Escape closes settings. Tab moves focus. Editing and system shortcuts stay reserved.</p>
    {interactionActions.map(({ id, label }) => <div key={id}>
      <label htmlFor={`${prefix}-${id}`}>{label}</label>
      <input id={`${prefix}-${id}`} type="text" readOnly value={shortcutLabel(value.shortcuts[id])}
        aria-describedby={`${prefix}-hint`} onKeyDown={(event) => {
          if (event.key === "Escape") return;
          event.stopPropagation();
          if (event.key === "Tab") return;
          if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
          if (event.ctrlKey || event.metaKey || event.nativeEvent.isComposing || event.repeat) return;
          event.preventDefault();
          const shortcut = shortcutFromEvent(event.nativeEvent);
          const problem = validateShortcut(id, shortcut, value);
          setError(problem || "");
          if (!problem) onChange({ ...value, shortcuts: { ...value.shortcuts, [id]: shortcut } });
        }} />
    </div>)}
    <p role="status" aria-live="polite">{error}</p>
    <p>Fixed shortcuts: Escape closes email or dialogs; Tab switches Important / Other from the inbox; 0-9 filters accounts. On Mac, Cmd+[ and Cmd+] go Back and Forward.</p>
    <button type="button" onClick={() => { setError(""); onChange(structuredClone(defaults)); }}>Reset interaction defaults</button>
  </section>;
}
