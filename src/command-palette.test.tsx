import assert from "node:assert/strict";
import { test } from "node:test";
import { act, useState } from "react";
import { JSDOM } from "jsdom";
import { CommandPalette, type PaletteCommand } from "./dialogs/CommandPalette";

test("command search wraps enabled choices, rejects disabled commands, and restores focus", async () => {
  const dom = new JSDOM('<button id="opener">Commands</button><div id="root"></div>');
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const calls: string[] = [];
  const commands: PaletteCommand[] = [
    { id: "compose", label: "New message", shortcut: "C", run: () => calls.push("compose") },
    { id: "archive", label: "Archive message", disabled: true, run: () => calls.push("archive") },
    { id: "settings", label: "Settings", run: () => calls.push("settings") },
  ];
  function Harness() {
    const [open, setOpen] = useState(true);
    return open ? <CommandPalette commands={commands} onClose={() => { calls.push("close"); setOpen(false); }} /> : null;
  }
  const mount = async () => { await act(async () => root.render(<Harness key={calls.length} />)); };
  const press = async (key: string) => { await act(async () => document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))); };
  const search = async (value: string) => {
    const input = document.querySelector("input")!;
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    await act(async () => input.dispatchEvent(new dom.window.Event("input", { bubbles: true })));
  };
  try {
    document.getElementById("opener")!.focus();
    await mount();
    assert.equal(document.activeElement?.getAttribute("role"), "combobox");
    const selected = () => document.querySelector('[aria-selected="true"]')?.textContent;
    await press("ArrowUp"); assert.equal(selected(), "Settings");
    await press("ArrowDown"); assert.equal(selected(), "New messageC");
    await act(async () => (document.querySelector('[aria-disabled="true"]') as HTMLElement).click());
    assert.deepEqual(calls, []);
    await search("SET"); assert.equal(document.querySelectorAll('[role="option"]').length, 1);
    await press("Enter"); assert.deepEqual(calls, ["close", "settings"]);
    assert.equal(document.activeElement?.id, "opener");
    await mount(); await search("missing");
    assert.match(document.querySelector('[role="status"]')!.textContent!, /No matching commands/);
    await press("Enter"); assert.equal(calls.length, 2);
    await search("archive"); await press("Enter"); assert.equal(calls.length, 2);
    await press("Escape"); assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement?.id, "opener");
    await mount();
    await act(async () => (document.querySelectorAll('[role="option"]')[0] as HTMLElement).click());
    assert.deepEqual(calls.slice(-2), ["close", "compose"]);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
