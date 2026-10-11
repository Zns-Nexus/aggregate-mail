export const interactionActions = [
  { id: "next", label: "Next email", key: "j" },
  { id: "previous", label: "Previous email", key: "k" },
  { id: "open", label: "Open email", key: "Enter" },
  { id: "important", label: "Important", key: "i" },
  { id: "other", label: "Other", key: "o" },
  { id: "search", label: "Search", key: "/" },
  { id: "compose", label: "Compose", key: "c" },
  { id: "reply", label: "Reply", key: "r" },
  { id: "done", label: "Done", key: "e" },
  { id: "snooze", label: "Snooze", key: "s" },
  { id: "teach", label: "Teach sorting", key: "m" },
  { id: "density", label: "Comfortable / Compact", key: "d" },
  { id: "privacy", label: "Hide personal information on / off", key: "p" },
  { id: "settings", label: "Settings", key: "," },
  { id: "help", label: "Keyboard shortcuts", key: "?" },
  { id: "back", label: "Back", key: "ArrowLeft", alt: true },
  { id: "forward", label: "Forward", key: "ArrowRight", alt: true },
] as const;

export type InteractionAction = (typeof interactionActions)[number]["id"];
export type Shortcut = { key: string; ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean };
export type InteractionPreferences = {
  opening: "double" | "single";
  shortcuts: Record<InteractionAction, Shortcut>;
};
export const defaults: InteractionPreferences = {
  opening: "double",
  shortcuts: Object.fromEntries(interactionActions.map((action) =>
    [action.id, { key: action.key, alt: "alt" in action && action.alt }])) as InteractionPreferences["shortcuts"],
};
const storageKey = "emc2.interaction.v1";

function canonical(shortcut: Shortcut): Shortcut {
  return { key: shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key,
    ctrl: !!shortcut.ctrl, meta: !!shortcut.meta, alt: !!shortcut.alt,
    // Printable symbols already encode Shift in KeyboardEvent.key.
    shift: !!shortcut.shift && (/^[a-z]$/i.test(shortcut.key) || ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(shortcut.key)) };
}
function same(a: Shortcut, b: Shortcut) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
export function shortcutFromEvent(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): Shortcut {
  return canonical({ key: event.key, ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey, shift: event.shiftKey });
}
export function shortcutLabel(shortcut: Shortcut): string {
  const binding = canonical(shortcut);
  const key = ({ ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down" } as Record<string, string>)[binding.key] ||
    (binding.key.length === 1 ? binding.key.toUpperCase() : binding.key);
  return [binding.ctrl && "Ctrl", binding.meta && "Cmd", binding.alt && "Alt", binding.shift && "Shift", key].filter(Boolean).join("+");
}

export function validateShortcut(action: InteractionAction, shortcut: Shortcut, value: InteractionPreferences): string | null {
  const binding = canonical(shortcut);
  const navigation = binding.alt && !binding.ctrl && !binding.meta && !binding.shift &&
    ["ArrowLeft", "ArrowRight"].includes(binding.key);
  if (!(/^[a-z0-9,./;\[\]'\\?]$/.test(binding.key) || ["Enter", "ArrowUp", "ArrowDown"].includes(binding.key) || navigation))
    return "Choose a letter, punctuation key, Enter, or an arrow shortcut. Escape and editing keys are reserved.";
  if (binding.ctrl || binding.meta || (binding.alt && !navigation && !binding.shift))
    return "Command, Control, and Alt shortcuts are reserved for the system. Use a single key, Shift combination, or Alt+Left/Right.";
  if (/^[0-9]$/.test(binding.key) && !binding.shift && !binding.alt)
    return "Number keys are reserved for account filters.";
  if (binding.key === "t" && !binding.shift && !binding.alt && action !== "teach")
    return "T is reserved as the Teach sorting alias.";
  const conflict = interactionActions.find((other) => other.id !== action && same(binding, value.shortcuts[other.id]));
  return conflict ? `Already used for ${conflict.label}.` : null;
}

export function read(): InteractionPreferences {
  const fallback = (): InteractionPreferences => structuredClone(defaults);
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!stored || typeof stored !== "object") return fallback();
    const input = stored as Record<string, unknown>;
    const value = fallback();
    if (input.opening === "single") value.opening = "single";
    if (!input.shortcuts || typeof input.shortcuts !== "object") return value;
    const bindings = input.shortcuts as Record<string, unknown>;
    for (const { id } of interactionActions) {
      const candidate = bindings[id];
      if (!candidate || typeof candidate !== "object") { value.shortcuts = fallback().shortcuts; return value; }
      const fields = candidate as Record<string, unknown>;
      if (typeof fields.key !== "string" || ["ctrl", "meta", "alt", "shift"].some((key) => fields[key] !== undefined && typeof fields[key] !== "boolean")) { value.shortcuts = fallback().shortcuts; return value; }
      value.shortcuts[id] = canonical(candidate as Shortcut);
    }
    if (interactionActions.some(({ id }) => validateShortcut(id, value.shortcuts[id], value)))
      value.shortcuts = fallback().shortcuts;
    return value;
  } catch { return fallback(); }
}
export function save(value: InteractionPreferences): boolean {
  if (!["double", "single"].includes(value.opening) || interactionActions.some(({ id }) => validateShortcut(id, value.shortcuts[id], value))) return false;
  try {
    // Serialize only the preference contract, never unrelated object fields.
    localStorage.setItem(storageKey, JSON.stringify({ opening: value.opening,
      shortcuts: Object.fromEntries(interactionActions.map(({ id }) => [id, canonical(value.shortcuts[id])])) }));
    return true;
  } catch { return false; }
}

export function matches(event: KeyboardEvent, action: InteractionAction, value: InteractionPreferences, platform = ""): boolean {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.getModifierState?.("AltGraph")) return false;
  const target = event.target;
  if (target && "closest" in target && typeof target.closest === "function" &&
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"], [data-interaction-settings]')) return false;
  const binding = shortcutFromEvent(event);
  if (same(binding, value.shortcuts[action])) return true;
  if (action === "teach" && same(value.shortcuts.teach, defaults.shortcuts.teach) && same(binding, { key: "t" })) return true;
  return platform === "darwin" && (action === "back" || action === "forward") &&
    same(binding, { key: action === "back" ? "[" : "]", meta: true });
}
