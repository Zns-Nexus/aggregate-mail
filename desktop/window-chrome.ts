import { readFileSync, writeFileSync } from "node:fs";

// Window controls outside macOS: the app's drawn traffic lights, or the
// operating system's own caption buttons over the top-right corner.
export type WindowControls = "mac" | "windows";

/** The saved window-controls style. Anything missing or unreadable is the drawn lights. */
export function readWindowControls(file: string): WindowControls {
  try {
    const saved: unknown = JSON.parse(readFileSync(file, "utf8"));
    return saved && typeof saved === "object" && (saved as { controls?: unknown }).controls === "windows" ? "windows" : "mac";
  } catch {
    return "mac";
  }
}

export function writeWindowControls(file: string, controls: WindowControls) {
  writeFileSync(file, JSON.stringify({ controls }));
}

const hex = /^#[\da-f]{6}$/i;

/** Caption-button colors from the renderer: the pane surface and its text, as #rrggbb. */
export function overlayColors(input: unknown): { color: string; symbolColor: string } | null {
  if (!input || typeof input !== "object") return null;
  const { color, symbolColor } = input as Record<string, unknown>;
  return typeof color === "string" && typeof symbolColor === "string" && hex.test(color) && hex.test(symbolColor)
    ? { color, symbolColor } : null;
}

/** Where a keyboard- or pointer-opened menu appears, in window coordinates. */
export function menuPosition(input: unknown): { x: number; y: number } | Record<string, never> {
  if (!input || typeof input !== "object") return {};
  const { x, y } = input as Record<string, unknown>;
  return Number.isInteger(x) && Number.isInteger(y) && (x as number) >= 0 && (y as number) >= 0 && (x as number) < 20000 && (y as number) < 20000
    ? { x: x as number, y: y as number } : {};
}

export type NativeMenuItem = { id: string; label: string; enabled: boolean; accelerator?: string; separator?: boolean };

// Display-only shortcut text that Electron accepts as an accelerator.
const accelerator = /^((Ctrl|Cmd|Alt|Shift)\+){0,3}([A-Z0-9]|Left|Right|Up|Down|Enter|[,./;'[\]\\])$/;

/** A mail context menu from the renderer, checked before it reaches the native menu. */
export function nativeMenuItems(input: unknown): NativeMenuItem[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) return null;
  const items: NativeMenuItem[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") return null;
    const { id, label, enabled, accelerator: key, separator } = item as Record<string, unknown>;
    if (typeof id !== "string" || !/^[a-z-]{1,40}$/.test(id) || typeof label !== "string" || !label || label.length > 80 ||
      typeof enabled !== "boolean") return null;
    items.push({
      id, label, enabled,
      ...(typeof key === "string" && accelerator.test(key) ? { accelerator: key } : {}),
      ...(separator === true ? { separator: true } : {}),
    });
  }
  return items;
}
