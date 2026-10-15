import assert from "node:assert/strict";
import { test } from "node:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { PrivacyContext } from "./ui/Privacy";
import { ToastStack, useToasts } from "./ui/Toasts";

test("toasts queue without dropping errors, deduplicate, redact, pause expiry and dismiss", async (context) => {
  const dom = new JSDOM('<button id="opener">Mail</button><div id="root"></div>');
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  context.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  let notices!: ReturnType<typeof useToasts>;
  function Harness() {
    notices = useToasts();
    return <PrivacyContext.Provider value={{ on: true, revealed: new Set(), toggle() {} }}>
      <ToastStack toasts={notices.toasts} onDismiss={notices.dismiss} />
    </PrivacyContext.Provider>;
  }
  const tick = async (ms: number) => { await act(async () => context.mock.timers.tick(ms)); };
  try {
    document.getElementById("opener")!.focus();
    await act(async () => root.render(<Harness />));
    await act(async () => {
      notices.push("Saved reader@example.com", "success"); notices.push("Saved reader@example.com", "success");
      notices.push("Could not save", "error"); notices.push("Synced"); notices.push("Archived", "success"); notices.push("Uncertain delivery", "error");
    });
    assert.equal(notices.toasts.length, 5); assert.equal(document.querySelectorAll(".toast").length, 4);
    assert.equal(document.querySelectorAll('[role="alert"]').length, 1);
    assert.equal(document.querySelector(".toast-pending")!.textContent, "1 more notification");
    assert.equal(document.body.innerHTML.includes("reader@example.com"), false);
    assert.equal(document.activeElement?.id, "opener");
    await tick(2000);
    const first = document.querySelector(".toast")!;
    await act(async () => first.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true })));
    await tick(5000);
    assert.ok(notices.toasts.some((toast) => toast.kind === "success"));
    assert.equal(document.querySelectorAll('[role="alert"]').length, 2);
    await act(async () => first.dispatchEvent(new dom.window.MouseEvent("mouseout", { bubbles: true })));
    const dismiss = first.querySelector("button")!;
    await act(async () => dismiss.focus());
    await tick(5000); assert.ok(document.body.contains(first));
    await act(async () => document.getElementById("opener")!.focus());
    await tick(3999); assert.ok(document.body.contains(first));
    await tick(1); assert.equal(document.body.contains(first), false);
    await tick(10000); assert.equal(notices.toasts.length, 2);
    await act(async () => (document.querySelector(".toast button") as HTMLButtonElement).click());
    assert.equal(notices.toasts.length, 1);
    assert.equal(document.querySelector('[role="alert"]')!.textContent, "Uncertain delivery");
    await act(async () => {
      notices.push("1 new unread email.", "info", "arrival:1");
      notices.push("1 new unread email.", "info", "arrival:2");
      notices.push("1 new unread email.", "info", "arrival:2");
    });
    assert.equal(notices.toasts.length, 3, "distinct arrivals survive text deduplication; repeated event stays silent");
  } finally {
    await act(async () => root.unmount()); context.mock.timers.reset(); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
