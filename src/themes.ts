import { z } from "zod";

export const maxCustomThemes = 32;
export const maxThemeFileBytes = 64 * 1024;
export const themeColorSchema = z.string().regex(/^#(?:[\da-f]{3}|[\da-f]{6})$/i)
  .transform((color) => color.length === 4
    ? `#${[...color.slice(1)].map((digit) => digit + digit).join("")}`.toLowerCase()
    : color.toLowerCase());

export const paletteSchema = z.strictObject({
  canvas: themeColorSchema,
  surface: themeColorSchema,
  raised: themeColorSchema,
  text: themeColorSchema,
  secondaryText: themeColorSchema,
  mutedText: themeColorSchema,
  accent: themeColorSchema,
  link: themeColorSchema,
  border: themeColorSchema,
  danger: themeColorSchema,
  reason: themeColorSchema,
  veil: themeColorSchema,
});
export const themeNameSchema = z.string().trim().min(1).max(48);
const palettesSchema = z.strictObject({ dark: paletteSchema, light: paletteSchema });
export const customThemeIdSchema = z.templateLiteral(["custom:", z.string().uuid()]);
export const customThemeSchema = z.strictObject({
  id: customThemeIdSchema,
  name: themeNameSchema,
  palettes: palettesSchema,
});
export const customThemesSchema = z.array(customThemeSchema).max(maxCustomThemes)
  .refine((themes) => new Set(themes.map(({ id }) => id)).size === themes.length);

const themeFileSchema = z.strictObject({
  format: z.literal("emc2-theme"),
  version: z.literal(1),
  name: themeNameSchema,
  palettes: palettesSchema,
});
export type Palette = z.infer<typeof paletteSchema>;
export type CustomTheme = z.infer<typeof customThemeSchema>;
export type ThemePreview = { scheme: "dark" | "light"; palette: Palette };

export const paletteFields = [
  { id: "canvas", label: "Background", variable: "--bg" },
  { id: "accent", label: "Accent", variable: "--accent" },
  { id: "surface", label: "Mail and settings", variable: "--surface" },
  { id: "raised", label: "Menus and controls", variable: "--raised" },
  { id: "text", label: "Primary text", variable: "--text" },
  { id: "secondaryText", label: "Secondary text", variable: "--text-2" },
  { id: "mutedText", label: "Muted text", variable: "--text-3" },
  { id: "link", label: "Links", variable: "--link" },
  { id: "border", label: "Borders", variable: "--line" },
  { id: "reason", label: "Sorting reasons", variable: "--reason" },
  { id: "danger", label: "Errors and destructive actions", variable: "--danger" },
  { id: "veil", label: "Privacy bars", variable: "--veil" },
] as const satisfies readonly { id: keyof Palette; label: string; variable: string }[];

function mix(first: string, second: string, amount: number): string {
  const channel = (offset: number) => Math.round(
    parseInt(first.slice(offset, offset + 2), 16) * (1 - amount) +
    parseInt(second.slice(offset, offset + 2), 16) * amount,
  ).toString(16).padStart(2, "0");
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

function luminance(color: string): number {
  const channel = (offset: number) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return channel(1) * 0.2126 + channel(3) * 0.7152 + channel(5) * 0.0722;
}

export function generatePalette(canvas: string, accent: string, scheme: ThemePreview["scheme"]): Palette {
  const background = themeColorSchema.parse(canvas);
  const highlight = themeColorSchema.parse(accent);
  const surface = mix(background, "#ffffff", scheme === "light" ? 0.75 : 0.045);
  const surfaceLuminance = luminance(surface);
  const light = (surfaceLuminance + 0.05) / (luminance("#1d1d1f") + 0.05) > 1.05 / (surfaceLuminance + 0.05);
  const text = light ? "#1d1d1f" : "#ffffff";
  return {
    canvas: background, accent: highlight, surface,
    raised: mix(surface, text, light ? 0.025 : 0.06), text,
    secondaryText: mix(surface, text, light ? 0.8 : 0.65),
    mutedText: mix(surface, text, light ? 0.65 : 0.55),
    link: mix(highlight, text, light ? 0.12 : 0.28),
    border: mix(surface, text, light ? 0.16 : 0.12),
    danger: light ? "#c93434" : "#f07c7c",
    reason: light ? "#a4512f" : "#e3a08b",
    veil: mix(surface, text, light ? 0.2 : 0.1),
  };
}

export function applyPalette(palette: Palette, root: HTMLElement): void {
  for (const field of paletteFields) root.style.setProperty(field.variable, palette[field.id]);
  root.style.setProperty("--text-body", palette.text);
  root.style.setProperty("--text-4", palette.mutedText);
  root.style.setProperty("--line-2", `color-mix(in srgb, ${palette.border} 80%, ${palette.text})`);
  root.style.setProperty("--line-3", `color-mix(in srgb, ${palette.border} 65%, ${palette.text})`);
  root.style.setProperty("--hover", `color-mix(in srgb, ${palette.text} 4%, transparent)`);
  root.style.setProperty("--selected", `color-mix(in srgb, ${palette.text} 7%, transparent)`);
  root.style.setProperty("--veil-hover", `color-mix(in srgb, ${palette.veil} 90%, ${palette.text})`);
  root.style.setProperty("--avatar", palette.raised);
  root.style.setProperty("--avatar-text", palette.secondaryText);
}

export function clearPalette(root: HTMLElement): void {
  for (const field of paletteFields) root.style.removeProperty(field.variable);
  for (const variable of ["--text-body", "--text-4", "--line-2", "--line-3", "--hover", "--selected", "--veil-hover", "--avatar", "--avatar-text"])
    root.style.removeProperty(variable);
}

export function parseThemeFile(text: string): Omit<CustomTheme, "id"> {
  if (new TextEncoder().encode(text).length > maxThemeFileBytes)
    throw new Error("Theme files must be 64 KB or smaller.");
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new Error("Choose a valid JSON theme file."); }
  const result = themeFileSchema.safeParse(input);
  if (!result.success)
    throw new Error("Use an Emc² version 1 theme with a name, light and dark palettes, and hex colors (#RGB or #RRGGBB).");
  return { name: result.data.name, palettes: result.data.palettes };
}

export function serializeThemeFile(theme: CustomTheme): string {
  return `${JSON.stringify(themeFileSchema.parse({ format: "emc2-theme", version: 1, name: theme.name, palettes: theme.palettes }), null, 2)}\n`;
}

export function uniqueThemeName(name: string, themes: readonly CustomTheme[]): string {
  const names = new Set(themes.map((theme) => theme.name.toLowerCase()));
  let candidate = name.slice(0, 48);
  for (let copy = 2; names.has(candidate.toLowerCase()); copy++) {
    const suffix = ` (${copy})`;
    candidate = `${name.slice(0, 48 - suffix.length)}${suffix}`;
  }
  return candidate;
}
