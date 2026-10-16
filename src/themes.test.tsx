import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customThemeSchema, customThemesSchema, generatePalette, maxThemeFileBytes,
  parseThemeFile, serializeThemeFile, themeColorSchema, uniqueThemeName, type CustomTheme,
} from "./themes";

const theme: CustomTheme = {
  id: "custom:08c1f804-538d-4322-bdf4-8a1c070986d6", name: "Nightfall",
  palettes: {
    dark: generatePalette("#1a1b26", "#7aa2f7", "dark"),
    light: generatePalette("#eef0f8", "#3456bc", "light"),
  },
};

test("theme files round-trip both palettes without exporting device identity", () => {
  const exported = serializeThemeFile(theme);
  assert.deepEqual(parseThemeFile(exported), { name: theme.name, palettes: theme.palettes });
  assert.equal(exported.includes(theme.id), false);
  assert.equal(themeColorSchema.parse("#AbC"), "#aabbcc");
  assert.equal(customThemeSchema.parse(theme).palettes.dark.canvas, "#1a1b26");
});

test("generated text remains readable when a dark palette starts from a bright background", () => {
  assert.equal(generatePalette("#ffffff", "#7aa2f7", "dark").text, "#1d1d1f");
  assert.equal(generatePalette("#000000", "#7aa2f7", "dark").text, "#ffffff");
  assert.equal(generatePalette("#000000", "#3456bc", "light").text, "#1d1d1f");
});

test("import rejects unsupported formats, missing palettes, active CSS, and oversized input", () => {
  const file = JSON.parse(serializeThemeFile(theme));
  const invalid = [
    null, [], { ...file, version: 2 }, { ...file, format: "other" }, { ...file, name: " " },
    { ...file, name: "a".repeat(49) }, { ...file, palettes: { dark: theme.palettes.dark } },
    { ...file, css: "body { display: none }" },
    { ...file, palettes: { ...file.palettes, dark: { ...theme.palettes.dark, canvas: "url(https://example.com/tracker)" } } },
    { ...file, palettes: { ...file.palettes, dark: { ...theme.palettes.dark, veil: "transparent" } } },
    { ...file, palettes: { ...file.palettes, dark: { ...theme.palettes.dark, text: "var(--secret)" } } },
    { ...file, palettes: { ...file.palettes, dark: { ...theme.palettes.dark, accent: "#123456; color: red" } } },
  ];
  for (const value of invalid) assert.throws(() => parseThemeFile(JSON.stringify(value)), /Emc² version 1/);
  assert.throws(() => parseThemeFile("invalid"), /valid JSON/);
  assert.throws(() => parseThemeFile(" ".repeat(maxThemeFileBytes + 1)), /64 KB/);
  assert.throws(() => parseThemeFile("é".repeat(maxThemeFileBytes / 2 + 1)), /64 KB/, "bound bytes, not characters");
});

test("libraries reject duplicate or reserved ids and give imported copies distinct names", () => {
  assert.equal(customThemeSchema.safeParse({ ...theme, id: "black" }).success, false);
  assert.equal(customThemesSchema.safeParse([theme, theme]).success, false);
  assert.equal(customThemesSchema.safeParse(Array.from({ length: 33 }, () => ({ ...theme, id: `custom:${crypto.randomUUID()}` }))).success, false);
  assert.equal(uniqueThemeName("nightfall", [theme]), "nightfall (2)");
  assert.equal(uniqueThemeName("Nightfall", [theme, { ...theme, name: "Nightfall (2)" }]), "Nightfall (3)");
  assert.ok(uniqueThemeName("x".repeat(48), [{ ...theme, name: "x".repeat(48) }]).length <= 48);
});
