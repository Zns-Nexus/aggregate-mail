import assert from "node:assert/strict";
import { test } from "node:test";
import { act } from "react";
import { Window as DOMWindow } from "happy-dom";
import { UpdateNotice } from "./shell/UpdateNotice";
import type { UpdateBridge, UpdateCommand, UpdateState } from "../shared/updates";

async function mount(initial: UpdateState, execute: (command: UpdateCommand) => Promise<UpdateState>, onInstalling?: (installing: boolean) => void) {
  const dom = new DOMWindow({ url: "http://localhost/", settings: {
    enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true, disableCSSFileLoading: true,
    enableImageFileLoading: false, navigation: { disableMainFrameNavigation: true, disableChildFrameNavigation: true, disableChildPageNavigation: true },
  } });
  const globals = { window: dom, document: dom.document, HTMLElement: dom.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const prior = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  let listener: ((state: UpdateState) => void) | undefined;
  const bridge: UpdateBridge = { state: async () => initial, command: execute,
    onState: (callback) => { listener = callback; return () => { listener = undefined; }; }, onDrain: () => () => {} };
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<UpdateNotice bridge={bridge} onInstalling={onInstalling} />));
  return { container,
    button: (name?: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => name ? button.textContent?.includes(name) : true)!,
    commandButton: () => container.querySelector<HTMLButtonElement>("[data-update-command]")!,
    open: async () => { await act(async () => container.querySelector<HTMLButtonElement>("[aria-controls='update-details']")?.click()); },
    emit: async (state: UpdateState) => { await act(async () => listener?.(state)); },
    click: async () => { await act(async () => container.querySelector<HTMLButtonElement>("[data-update-command]")?.click()); },
    close: async () => {
      await act(async () => root.unmount()); assert.equal(listener, undefined);
      await dom.happyDOM.close();
      for (const [key, descriptor] of prior) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test("one click downloads then requests install, and progress prevents duplicate clicks", async () => {
  const calls: string[] = [];
  const installStates: boolean[] = [];
  let finish!: (state: UpdateState) => void;
  const ui = await mount({ phase: "available", version: "0.1.7" }, async (command) => {
    calls.push(command);
    if (command === "download") return new Promise((resolve) => { finish = resolve; });
    return { phase: "installing", version: "0.1.7" };
  }, (installing) => installStates.push(installing));
  try {
    assert.equal(ui.button().getAttribute("aria-expanded"), "false");
    assert.match(ui.button().getAttribute("aria-label")!, /Emc² 0.1.7 is available/);
    await ui.open();
    assert.deepEqual(calls, [], "Opening update details must not start a bridge command");
    assert.equal(ui.button("Download").textContent?.trim(), "Download, install and restart");
    await ui.click(); await ui.click(); assert.deepEqual(calls, ["download"]);
    await ui.emit({ phase: "downloading", version: "0.1.7", percent: 42 });
    assert.equal(ui.container.querySelector<HTMLProgressElement>("progress")?.value, 42);
    assert.match(ui.button().getAttribute("aria-label")!, /42%/);
    assert.equal(ui.commandButton().disabled, true);
    await act(async () => finish({ phase: "ready", version: "0.1.7" }));
    assert.deepEqual(calls, ["download", "install"]);
    assert.match(ui.container.textContent!, /Finishing mail work/);
    assert.ok(installStates.includes(true), "the existing installation handoff callback remains active");
  } finally { await ui.close(); }
});

test("failure and cancelled draft guard remain visible and permit an explicit retry", async () => {
  const calls: string[] = [];
  const ui = await mount({ phase: "available", version: "0.1.7" }, async (command) => {
    calls.push(command);
    return command === "download" ? { phase: "error", reason: "download" } : { phase: "available", version: "0.1.7" };
  });
  try {
    await ui.open();
    await ui.click(); assert.deepEqual(calls, ["download"]);
    assert.match(ui.container.textContent!, /download failed/);
    assert.equal(ui.commandButton().disabled, false); await ui.click(); assert.deepEqual(calls, ["download", "check"]);
    await ui.emit({ phase: "ready", version: "0.1.7", reason: "cancelled" });
    assert.match(ui.container.textContent!, /draft is still open/);
    assert.equal(ui.commandButton().textContent?.trim(), "Install and restart");
    assert.equal(ui.commandButton().disabled, false);
  } finally { await ui.close(); }
});

test("ad-hoc macOS and missing updater metadata give honest states without an install control", async () => {
  for (const state of [{ phase: "unsupported", reason: "mac-signing" }, { phase: "unavailable", reason: "metadata" }] as const) {
    const ui = await mount(state, async () => { throw new Error("Must not install"); });
    try {
      assert.match(ui.button().getAttribute("aria-label")!, /Automatic update unavailable/);
      await ui.open();
      assert.match(ui.container.textContent!, /unavailable/);
      assert.ok(!ui.container.textContent?.includes("Install and restart"));
      if (state.phase === "unsupported") assert.equal(ui.container.querySelector("[data-update-command]"), null);
      else assert.equal(ui.button("Check for updates").textContent?.trim(), "Check for updates");
    } finally { await ui.close(); }
  }
});

test("details can be dismissed with Escape and expose progress and failure status", async () => {
  const ui = await mount({ phase: "available", version: "0.1.7" }, async () => ({ phase: "error", reason: "verification" }));
  try {
    await ui.open();
    assert.equal(ui.button().getAttribute("aria-expanded"), "true");
    await ui.click();
    assert.match(ui.container.textContent!, /could not be verified/);
    assert.match(ui.button().getAttribute("aria-label")!, /Automatic update unavailable/);
    await act(async () => ui.button().dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(ui.button().getAttribute("aria-expanded"), "false");
    assert.equal(ui.container.querySelector("#update-details"), null);
  } finally { await ui.close(); }
});
