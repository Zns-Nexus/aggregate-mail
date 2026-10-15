import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Runs appearance code against a fresh DOM with a synthetic desktop bridge.
async function withDesktop(platform: string, run: (calls: string[], dom: JSDOM) => Promise<void>) {
  const dom = new JSDOM("<!doctype html>", { url: "http://localhost/" });
  const calls: string[] = [];
  Object.assign(dom.window, { desktop: { platform, materials: true, setMaterial: (material: string) => calls.push(material),
    setScheme: (mode: string) => calls.push(`scheme:${mode}`) } });
  const keys = ["window", "document", "localStorage"] as const;
  const previous = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: dom.window.localStorage });
  try { await run(calls, dom); } finally {
    keys.forEach((key, i) => previous[i] ? Object.defineProperty(globalThis, key, previous[i]!) : Reflect.deleteProperty(globalThis, key));
    dom.window.close();
  }
}

test("transparency picks the Windows material live and migrates the earlier on/off switch", async () => {
  await withDesktop("win32", async (calls, dom) => {
    const { applyAppearance, defaultAppearance, readAppearance } = await import("./appearance");
    dom.window.localStorage.setItem("emc2.appearance.v1", JSON.stringify({ theme: "midnight", accent: "pink", glass: false }));
    assert.deepEqual(readAppearance(), { mode: "dark", theme: "midnight", accent: "pink", transparency: "off", reading: "split" });
    for (const transparency of ["glass", "subtle", "off"] as const)
      applyAppearance({ ...defaultAppearance, transparency });
    assert.deepEqual(calls.filter((call) => !call.startsWith("scheme:")), ["acrylic", "mica", "none"]);
    assert.equal(dom.window.document.documentElement.hasAttribute("data-glass"), false);
  });
});

test("macOS offers Off and Glass only and reads a stored Subtle as Glass", async () => {
  await withDesktop("darwin", async (_calls, dom) => {
    const { readAppearance, transparencyChoices } = await import("./appearance");
    assert.deepEqual(transparencyChoices().map((choice) => choice.id), ["off", "glass"]);
    dom.window.localStorage.setItem("emc2.appearance.v1", JSON.stringify({ transparency: "subtle" }));
    assert.equal(readAppearance().transparency, "glass");
  });
});

test("light mode sets the scheme, a deeper accent and the native theme; System follows the OS", async () => {
  await withDesktop("win32", async (calls, dom) => {
    const { applyAppearance, defaultAppearance, resolveScheme } = await import("./appearance");
    const root = dom.window.document.documentElement;
    applyAppearance({ ...defaultAppearance, mode: "light", accent: "blue" }, "light");
    assert.equal(root.dataset.scheme, "light");
    assert.equal(root.style.getPropertyValue("--accent"), "#2563eb");
    assert.ok(calls.includes("scheme:light"));
    assert.equal(resolveScheme("system", true), "light");
    assert.equal(resolveScheme("system", false), "dark");
    assert.equal(resolveScheme("dark", true), "dark");
  });
});
