import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import React, { act, Profiler } from "react";
import { JSDOM } from "jsdom";
import type { State } from "../shared/types";

// Synthetic DOM/React timing only. No browser, provider connection or saved profile.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/" });
dom.window.HTMLElement.prototype.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
  location: dom.window.location, history: dom.window.history, HTMLElement: dom.window.HTMLElement,
  requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 0; },
  IS_REACT_ACT_ENVIRONMENT: true,
});
let changed: (() => void) | undefined;
window.desktop = {
  platform: "win32", materials: true, oauthUrl: "", windowCommand() {},
  onWindowState: () => () => {}, onNavigation: () => () => {},
  onAccountConnected: () => () => {},
  onMailChanged: (callback) => { changed = callback; return () => { changed = undefined; }; },
};
const state: State = {
  accounts: [{ id: "synthetic", email: "reader@example.com", provider: "gmail" }],
  messages: Array.from({ length: 1800 }, (_, i) => ({
    id: `synthetic:${i}`, remoteId: String(i), accountId: "synthetic",
    sender: `Sender ${i % 40}`, address: `sender${i % 40}@example.com`, to: "reader@example.com",
    subject: `Synthetic message ${i}`, body: "Synthetic body. ".repeat(100), preview: "Synthetic preview",
    date: 1700000000000 - i * 60000, unread: false, category: "important", relevance: 2,
    reason: "", archived: false, snoozedUntil: null, html: null,
  })),
  labels: [], rules: [], googleConfigured: false, googleClientId: null,
  jevConfigured: false, jevProvider: "typesafe", aiConfigured: false, lastSync: null, syncing: false,
};
globalThis.fetch = async (input) => new Response(JSON.stringify(
  String(input) === "/api/state" ? { ...structuredClone(state), csrf: "synthetic" } : { errors: [] },
), { headers: { "Content-Type": "application/json" } });
const { createRoot } = await import("react-dom/client");
const { App } = await import("../src/App");
const container = document.getElementById("root");
assert.ok(container);
const root = createRoot(container);
let renderTime = 0;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
try {
  await act(async () => root.render(<Profiler id="inbox" onRender={(_id, _phase, duration) => { renderTime += duration; }}><App /></Profiler>));
  assert.equal(container.querySelectorAll(".row").length, 1800);
  assert.ok(document.documentElement.hasAttribute("data-glass"));
  for (const scenario of ["selection", "unchanged-refresh"] as const) {
    const renders: number[] = [], elapsed: number[] = [];
    for (let i = 0; i < 9; i++) {
      renderTime = 0;
      const start = performance.now();
      await act(async () => {
        if (scenario === "selection") dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "j", bubbles: true }));
        else changed?.();
      });
      if (i > 1) { renders.push(renderTime); elapsed.push(performance.now() - start); }
    }
    console.log(JSON.stringify({ scenario, messages: state.messages.length,
      medianReactMs: +median(renders).toFixed(2), medianElapsedMs: +median(elapsed).toFixed(2) }));
  }
} finally {
  await act(async () => root.unmount());
  dom.window.close();
}
