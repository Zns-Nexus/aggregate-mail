import { test } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { JSDOM } from "jsdom";
import type { Mail, State } from "../shared/types";

async function mount(native = false) {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/" });
  let discard = true;
  const globals = {
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    location: dom.window.location, history: dom.window.history, HTMLElement: dom.window.HTMLElement,
    requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 0; },
    IS_REACT_ACT_ENVIRONMENT: true,
    confirm: () => discard,
  };
  const previous = new Map(Object.keys(globals).map((key) =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  const makeMail = (id: string, subject: string, accountId = "a", category: Mail["category"] = "important"): Mail => ({
    id, subject, accountId, category, remoteId: id, sender: "Sender", address: "sender@example.com",
    to: "reader@example.com", preview: subject, body: subject, date: 1000, unread: true,
    relevance: 2, reason: "", archived: false, snoozedUntil: null,
    images: [{ src: "https://images.example.com/photo.png", alt: "Photo" }],
  });
  const state: State = {
    accounts: [{ id: "a", email: "first@example.com", provider: "imap" },
      { id: "b", email: "second@example.com", provider: "imap" }],
    messages: [makeMail("a:1", "Alpha"), makeMail("a:2", "Beta"),
      makeMail("b:1", "Gamma", "b"), makeMail("a:3", "Other message", "a", "other")],
    labels: [], rules: [], googleConfigured: false, googleClientId: null, jevConfigured: false,
    jevProvider: "typesafe", aiConfigured: false, lastSync: null,
  };
  let changed: (() => void) | undefined;
  let navigate: ((direction: "back" | "forward") => void) | undefined;
  let subscriptions = 0;
  const desktop: NonNullable<Window["desktop"]> = {
    platform: native ? "linux" : "darwin", oauthUrl: "", windowCommand() {},
    onWindowState: () => () => {}, onAccountConnected: () => () => {},
    onMailChanged: (callback) => { changed = callback; return () => { changed = undefined; }; },
    onNavigation: (callback) => {
      subscriptions++; navigate = callback;
      return () => { subscriptions--; navigate = undefined; };
    },
  };
  (dom.window as unknown as Window).desktop = desktop;
  const previousFetch = globalThis.fetch;
  const mutations: string[] = [];
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (options?.method === "PATCH") {
      mutations.push(url);
      const mail = state.messages.find((mail) => url.endsWith(encodeURIComponent(mail.id)));
      if (mail) mail.unread = false;
    }
    return { ok: true, json: async () => url === "/api/state" ? { ...state, csrf: "synthetic" } :
      url === "/api/sync" ? { errors: [] } : {} } as Response;
  };
  const { createRoot } = await import("react-dom/client");
  const { App } = await import("./App");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  await act(async () => root.render(<App />));
  const button = (label: string) => {
    const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.getAttribute("aria-label") === label || button.textContent?.trim() === label);
    assert.ok(found, `button ${label}`);
    return found;
  };
  const click = async (target: HTMLElement) => { await act(async () => target.click()); };
  const back = () => button("Back");
  const forward = () => button("Forward");
  const open = async (id: string) => {
    const row = container.querySelector<HTMLElement>(`[id='mail-${id}']`)!;
    assert.ok(row);
    await click(row);
    await act(async () => row.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true })));
  };
  const mouse = async (side: number) => {
    const events = ["mousedown", "mouseup", "auxclick"].map((type) =>
      new dom.window.MouseEvent(type, { button: side, bubbles: true, cancelable: true }));
    await act(async () => { for (const event of events) dom.window.dispatchEvent(event); });
    assert.ok(events.every((event) => event.defaultPrevented));
  };
  const key = async (key: string) => {
    await act(async () => dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true })));
  };
  const input = async (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const prototype = field.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  };
  return { state, container, button, click, back, forward, open, mouse, key, input, mutations,
    title: () => container.querySelector(".message h1")?.textContent,
    native: async (direction: "back" | "forward") => { await act(async () => navigate?.(direction)); },
    refresh: async () => { await act(async () => changed?.()); },
    subscriptions: () => subscriptions,
    discardDraft: (value: boolean) => { discard = value; },
    async close() {
      await act(async () => root.unmount());
      assert.equal(subscriptions, 0);
      assert.equal(changed, undefined);
      dom.window.close();
      globalThis.fetch = previousFetch;
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test("mounted App traverses intentional mail routes, restores context and truncates Forward", async () => {
  const app = await mount();
  try {
    assert.ok(app.back().disabled && app.forward().disabled);
    await app.click(app.container.querySelector<HTMLElement>("[id='mail-b:1']")!);
    await app.key("j");
    assert.ok(app.back().disabled); // Selection alone is not navigation.
    await app.open("a:1");
    assert.equal(app.title(), "Alpha");
    assert.equal(app.container.querySelector(".mail-navigation kbd")?.textContent, "Esc");
    await app.click(app.button("Show images"));
    assert.ok(app.container.querySelector(".message-images img"));
    const mutationCount = app.mutations.length;
    await app.click(app.back());
    assert.equal(app.title(), undefined);
    assert.ok(app.container.querySelector("[id='mail-a:1']")?.classList.contains("selected"));
    await app.click(app.forward());
    assert.equal(app.title(), "Alpha");
    assert.equal(app.container.querySelector(".message-images img"), null);
    assert.equal(app.mutations.length, mutationCount);
    const beta = [...app.container.querySelectorAll<HTMLButtonElement>(".context-list button")]
      .find((button) => button.textContent?.startsWith("Beta"))!;
    await app.click(beta);
    assert.equal(app.title(), "Beta");
    await app.mouse(3);
    assert.equal(app.title(), "Alpha");
    await app.mouse(4);
    assert.equal(app.title(), "Beta");
    await app.click(app.back());
    await app.click(app.button("Other1"));
    assert.equal(app.title(), undefined);
    assert.ok(app.forward().disabled);
    await app.click(app.button("1first"));
    await app.click(app.button("Search mail"));
    const search = app.container.querySelector<HTMLInputElement>(".search input")!;
    await app.input(search, "Other");
    await app.input(search, "Other message");
    await app.open("a:3");
    await app.click(app.back());
    assert.equal(app.container.querySelector<HTMLInputElement>(".search input")?.value, "Other message");
    assert.equal(app.button("1first").getAttribute("aria-pressed"), "true");
    assert.equal(app.container.querySelector(".tabs .active")?.getAttribute("aria-current"), "page");
    await app.click(app.back()); // All keystrokes form one search visit.
    assert.equal(app.container.querySelector<HTMLInputElement>(".search input"), null);
    await app.click(app.forward());
    await app.click(app.forward());
    assert.equal(app.title(), "Other message");
    app.state.messages.find((mail) => mail.id === "a:3")!.archived = true;
    await app.refresh();
    assert.equal(app.title(), "Other message"); // Changed classification cannot open an unrelated row.
    await app.click(app.back());
    app.state.messages = app.state.messages.filter((mail) => mail.id !== "a:3");
    app.state.accounts = app.state.accounts.filter((account) => account.id !== "a");
    await app.refresh();
    await app.click(app.forward());
    assert.equal(app.title(), undefined);
    assert.equal(app.button("0All").getAttribute("aria-pressed"), "true");
    assert.equal(app.container.ownerDocument.location.href, "http://localhost/");
    assert.equal(app.container.ownerDocument.defaultView!.localStorage.length, 0);
  } finally { await app.close(); }
});

test("mounted App guards drafts/dialogs and uses one native side-button source with cleanup", async () => {
  const app = await mount(true);
  try {
    await app.open("a:1");
    await app.click(app.button("Other1"));
    assert.equal(app.subscriptions(), 1);
    await app.mouse(3);
    assert.equal(app.title(), undefined); // DOM delivery cannot duplicate Electron's command.
    await app.native("back");
    assert.equal(app.title(), "Alpha");
    await app.native("forward");
    assert.equal(app.title(), undefined);
    await app.native("back");
    const mutations = app.mutations.length;
    for (const shortcut of ["c", "m", "s", "?"]) {
      await app.key(shortcut);
      assert.ok(app.container.querySelector('[role="dialog"]'));
      const body = app.container.querySelector<HTMLTextAreaElement>("textarea");
      if (shortcut === "c") {
        assert.ok(body);
        await app.input(body, "Keep this draft");
      }
      assert.ok(app.back().disabled && app.forward().disabled);
      await app.native("back");
      await app.native("forward");
      assert.equal(app.title(), "Alpha");
      if (shortcut === "c") assert.equal(body!.value, "Keep this draft");
      if (shortcut === "c") {
        app.discardDraft(false);
        await app.key("Escape");
        assert.equal(body!.value, "Keep this draft");
        assert.ok(app.container.querySelector('[role="dialog"]'));
        app.discardDraft(true);
      }
      await app.key("Escape");
    }
    await app.key("Escape");
    assert.equal(app.title(), undefined);
    assert.equal(app.mutations.length, mutations);
    await app.click(app.button("Settings"));
    await app.native("back");
    assert.ok(app.container.querySelector(".settings"));
    await app.click(app.button("Close settings"));
    await app.native("back");
    assert.equal(app.title(), undefined);
    assert.ok(app.back().disabled);
  } finally { await app.close(); }
});
