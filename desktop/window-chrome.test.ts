import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { nativeMenuItems, overlayColors, readWindowControls, writeWindowControls } from "./window-chrome.js";

test("window controls default to the drawn lights and round-trip the system buttons", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "emc2-window-"));
  try {
    const file = path.join(dir, "window.json");
    assert.equal(readWindowControls(file), "mac");
    writeWindowControls(file, "windows");
    assert.equal(readWindowControls(file), "windows");
    writeFileSync(file, "{not json");
    assert.equal(readWindowControls(file), "mac");
    writeFileSync(file, JSON.stringify({ controls: "other" }));
    assert.equal(readWindowControls(file), "mac");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("caption colors and native menu items are checked before they reach Electron", () => {
  assert.deepEqual(overlayColors({ color: "#0e0e10", symbolColor: "#FFFFFF" }), { color: "#0e0e10", symbolColor: "#FFFFFF" });
  for (const input of [null, { color: "#fff", symbolColor: "#000000" }, { color: "red", symbolColor: "#000000" }, { color: "#000000" }])
    assert.equal(overlayColors(input), null);
  assert.deepEqual(nativeMenuItems([
    { id: "open", label: "Open", enabled: true, accelerator: "Enter" },
    { id: "trash", label: "Move to Trash", enabled: false, accelerator: "javascript:x", separator: true },
  ]), [
    { id: "open", label: "Open", enabled: true, accelerator: "Enter" },
    { id: "trash", label: "Move to Trash", enabled: false, separator: true },
  ]);
  for (const input of [[], "open", [{ id: "Open!", label: "Open", enabled: true }], [{ id: "open", label: "", enabled: true }],
    [{ id: "open", label: "Open", enabled: "yes" }], Array.from({ length: 21 }, () => ({ id: "open", label: "Open", enabled: true }))])
    assert.equal(nativeMenuItems(input), null);
});
