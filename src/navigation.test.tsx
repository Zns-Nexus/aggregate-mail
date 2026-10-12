import { test } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { JSDOM } from "jsdom";
import type { Mail, State } from "../shared/types";

async function mount(native = false, setup?: (state: State, storage: Storage) => void) {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/" });
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
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
    html: null, images: [{ src: "https://images.example.com/photo.png", alt: "Photo" }],
  });
  const state: State = {
    accounts: [{ id: "a", email: "first@example.com", provider: "imap" },
      { id: "b", email: "second@example.com", provider: "imap" }],
    messages: [makeMail("a:1", "Alpha"), makeMail("a:2", "Beta"),
      makeMail("b:1", "Gamma", "b"), makeMail("a:3", "Other message", "a", "other")],
    labels: [], rules: [], googleConfigured: false, googleClientId: null, jevConfigured: false,
    jevProvider: "typesafe", aiConfigured: false, lastSync: null, syncing: false,
  };
  setup?.(state, dom.window.localStorage);
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
  let readWait: Promise<void> | undefined;
  let releaseRead: (() => void) | undefined;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (options?.method === "PATCH") {
      mutations.push(url);
      const mail = state.messages.find((mail) => url.endsWith(encodeURIComponent(mail.id)));
      await readWait;
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
  const key = async (key: string, options: KeyboardEventInit = {}) => {
    await act(async () => dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true, ...options })));
  };
  const input = async (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const prototype = field.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  };
  return { state, storage: dom.window.localStorage, window: dom.window, container, button, click, back, forward, open, mouse, key, input, mutations,
    title: () => container.querySelector(".message h1")?.textContent,
    native: async (direction: "back" | "forward") => { await act(async () => navigate?.(direction)); },
    refresh: async () => { await act(async () => changed?.()); },
    menu: async (id: string) => {
      const row = container.querySelector<HTMLElement>(`[id='mail-${id}']`)!;
      await act(async () => row.dispatchEvent(new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    },
    subscriptions: () => subscriptions,
    holdRead: () => { readWait = new Promise<void>((resolve) => { releaseRead = resolve; }); },
    finishRead: async () => { await act(async () => { releaseRead?.(); await readWait; readWait = undefined; }); },
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

test("context menu Open navigates and marks read without a menu guard blocking it", async () => {
  const app = await mount();
  try {
    await app.menu("a:1");
    assert.equal(app.title(), undefined);
    assert.equal(app.mutations.length, 0);
    await app.click(app.container.querySelector<HTMLButtonElement>('[role="menuitem"]')!);
    assert.equal(app.title(), "Alpha");
    assert.equal(app.mutations.length, 1);
  } finally { await app.close(); }
});

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
    await app.click(app.back());
    app.state.messages.find((mail) => mail.id === "a:1")!.unread = true;
    await app.refresh();
    await app.click(app.forward());
    assert.equal(app.mutations.length, mutationCount + 1, "history reopening unread mail marks it read");
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


test("Settings persist opening mode and custom keys while single-click opens and marks read once", async () => {
  const app = await mount();
  try {
    const first = app.container.querySelector<HTMLElement>("[id='mail-a:1']")!;
    await app.click(first);
    assert.equal(app.title(), undefined);
    assert.equal(app.mutations.length, 0);
    await app.click(app.button("Settings"));
    const opening = app.container.querySelector<HTMLSelectElement>('[data-interaction-settings] select')!;
    await act(async () => { opening.value = "single"; opening.dispatchEvent(new app.window.Event("change", { bubbles: true })); });
    const search = [...app.container.querySelectorAll<HTMLInputElement>('[data-interaction-settings] input')]
      .find((input) => input.value === "/")!;
    search.focus();
    await act(async () => search.dispatchEvent(new app.window.KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true })));
    assert.equal(search.value, "F");
    assert.equal(app.container.querySelector('[aria-label="Search all synced mail"]'), null);
    const saved = JSON.parse(app.storage.getItem("emc2.interaction.v1")!);
    assert.equal(saved.opening, "single"); assert.equal(saved.shortcuts.search.key, "f");
    const preferences = app.storage.getItem("emc2.interaction.v1");
    assert.equal(app.window.document.activeElement, search);
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true },
      { shiftKey: true }, { isComposing: true }, { repeat: true }]) {
      await act(async () => search.dispatchEvent(new app.window.KeyboardEvent("keydown", {
        key: "Escape", bubbles: true, cancelable: true, ...options,
      })));
      assert.ok(app.container.querySelector(".settings"), "modified/repeated/composing Escape stays guarded");
    }
    const consumed = new app.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    consumed.preventDefault();
    await act(async () => search.dispatchEvent(consumed));
    assert.ok(app.container.querySelector(".settings"), "consumed Escape stays guarded");
    await act(async () => search.dispatchEvent(new app.window.KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, cancelable: true,
    })));
    assert.equal(app.container.querySelector(".settings"), null, "focused shortcut Escape closes Settings");
    assert.equal(app.storage.getItem("emc2.interaction.v1"), preferences, "Escape does not change a binding");
    assert.equal(app.title(), undefined);
    assert.equal(app.mutations.length, 0, "Escape does not run a mail action");
    assert.equal(app.container.querySelector('[role="dialog"]'), null);
    assert.equal(app.container.querySelector('[aria-label="Search all synced mail"]'), null);
    const row = app.container.querySelector<HTMLElement>("[id='mail-a:1']")!;
    await act(async () => {
      row.dispatchEvent(new app.window.MouseEvent("click", { detail: 1, bubbles: true }));
      row.dispatchEvent(new app.window.MouseEvent("click", { detail: 2, bubbles: true }));
      row.dispatchEvent(new app.window.MouseEvent("dblclick", { detail: 2, bubbles: true }));
    });
    assert.equal(app.title(), "Alpha"); assert.equal(app.mutations.length, 1);
    await app.key("ArrowLeft", { altKey: true });
    assert.equal(app.title(), undefined);
    await app.key("ArrowRight", { altKey: true });
    assert.equal(app.title(), "Alpha"); assert.equal(app.mutations.length, 1);
    await app.key("Escape");
    await app.key("f");
    assert.ok(app.container.querySelector('[aria-label="Search all synced mail"]'));
  } finally { await app.close(); }
});

test("privacy removes connected recipient names and addresses from list, headers, body and attributes", async () => {
  const app = await mount(false, (state, storage) => {
    storage.setItem("privacy", "on");
    state.messages[0] = { ...state.messages[0], to: '"Nora Lane" <first@example.com>',
      cc: "Kai Rivers <second@example.com>", subject: "For Nora Lane", preview: "Hello Nora and Kai",
      body: "Hello Nora Lane", reason: "Priority for Nora Lane",
      html: '<table style="background-color:#fff;color:#222"><tbody><tr><td>Hello <b>Nora</b> Lane and Kai</td></tr><tr><td><a href="https://example.com/?name=Nora%2520Lane" title="Nora Lane">Private destination</a><img src="https://images.example.com/photo.png" alt="Nora Lane"></td></tr></tbody></table>' };
  });
  try {
    const assertHidden = () => {
      const markup = app.container.innerHTML;
      for (const value of ["Nora", "Lane", "Kai", "first@example.com", "second@example.com", "%2520"])
        assert.ok(!markup.includes(value), `hidden ${value} must not be in markup`);
    };
    assertHidden();
    await app.open("a:1");
    assertHidden();
    await app.key("s"); assert.ok(app.container.querySelector('[role="dialog"]'));
    assertHidden(); await app.click(app.button("Close dialog"));
    assert.equal(app.container.querySelector(".message-body img"), null);
    assert.equal(app.button("Show images").disabled, true);
    assert.ok(app.container.querySelector(".formatted-mail table"));
    const control = app.container.querySelector(".image-controls")!;
    const body = app.container.querySelector(".message-body")!;
    assert.ok(control.compareDocumentPosition(body) & 4, "Show images precedes body");
    await app.click(app.button("Show personal information"));
    assert.ok(app.container.textContent?.includes("Nora"));
    await app.click(app.button("Show images"));
    assert.equal(app.container.querySelectorAll(".message-body img").length, 1);
    assert.equal(app.container.querySelectorAll(".message-images figure").length, 0, "formatted images are not duplicated");
    await app.key("p");
    assertHidden(); assert.equal(app.container.querySelector(".message-body img"), null);
  } finally { await app.close(); }
});

for (const target of ["filter", "editor"]) {
  test(`privacy hides message-derived names and destinations in Gmail label ${target}`, async () => {
    const app = await mount(false, (state, storage) => {
      storage.setItem("privacy", "on");
      state.accounts[0].provider = "gmail";
      state.labels = [{ id: "private", accountId: "a", name: "Nora Lane", type: "user" }];
      state.messages[0] = { ...state.messages[0], to: "Nora Lane <first@example.com>",
        subject: "For Nora", preview: "Hello Lane", body: "Hello Nora Lane", labelIds: ["private"],
        html: '<p>Hello Nora Lane <a href="https://example.com/?name=Nora%2520Lane">Private destination</a></p>' };
    });
    try {
      await app.open("a:1");
      assert.ok(app.container.querySelector(".message-labels .veiled"), "reader label is hidden");
      const assertHidden = () => {
        for (const value of ["Nora", "Lane", "first@example.com", "second@example.com", "%2520"])
          assert.ok(!app.container.innerHTML.includes(value), `hidden ${value} must not be in markup`);
      };
      assertHidden();
      await app.click(app.button(target === "filter" ? "Filter by Gmail label" : "Edit labels"));
      assertHidden();
      if (target === "filter") {
        assert.equal(app.container.querySelectorAll('.label-filter [role="option"]').length, 2);
      } else {
        assert.ok(app.container.querySelector('[role="dialog"] .label-options .veiled'));
        assert.equal(app.container.querySelector<HTMLInputElement>('.label-options input')?.checked, true);
      }
      assert.equal(app.container.querySelector(".message-body a"), null, "private destination has no anchor");
      assert.equal(app.mutations.length, 1, "only read-on-open runs");
    } finally { await app.close(); }
  });
}

test("privacy hides one-character recipient names and encoded destinations in mounted mail", async () => {
  const app = await mount(false, (state, storage) => {
    storage.setItem("privacy", "on");
    state.accounts[0].email = "reader@gmail.com";
    state.messages[0] = { ...state.messages[0], sender: "张 文", address: "reader@gmail.com", to: "张 文 <reader@gmail.com>",
      subject: "For 张", preview: "Hello 文", body: "Hello 张 and 文", reason: "Priority for 文",
      html: '<p>Hello <b>张</b> and 文 <a href="https://example.com/?name=%E5%BC%A0">Private destination</a> <a href="https://example.com/public">Public destination</a></p>' };
  });
  try {
    const assertHidden = () => {
      for (const value of ["张", "文", "reader@gmail.com", "%E5%BC%A0"])
        assert.ok(!app.container.innerHTML.includes(value), `hidden ${value} must not be in markup`);
      assert.equal(app.container.querySelector('[id="mail-a:1"] .avatar-letter')?.textContent ||
        app.container.querySelector('.message .avatar-letter')?.textContent, "·");
    };
    assertHidden();
    await app.open("a:1");
    assertHidden();
    assert.equal(app.container.querySelectorAll(".message-body a").length, 1);
    assert.equal(app.container.querySelector(".message-body a")?.getAttribute("href"), "https://example.com/public");
    await app.click(app.button("Show personal information"));
    assert.ok(app.container.textContent?.includes("张"));
    assert.ok(app.container.textContent?.includes("文"));
    assert.equal(app.container.querySelector('.message .avatar-letter')?.textContent, "张");
    assert.ok(app.container.querySelector('a[href="https://example.com/?name=%E5%BC%A0"]'));
    await app.key("p");
    assertHidden();
  } finally { await app.close(); }
});


test("unread navigation sends independent read requests while earlier reads are pending", async () => {
  const app = await mount();
  try {
    app.holdRead(); await app.open("a:1");
    assert.equal(app.title(), "Alpha"); assert.equal(app.mutations.length, 1);
    await app.key("j");
    assert.equal(app.title(), "Beta"); assert.equal(app.mutations.length, 2);
    await app.finishRead();
    assert.equal(app.state.messages.find((mail) => mail.id === "a:2")?.unread, false);
  } finally { await app.close(); }
});


test("empty and rejected formatting retain readable text and consent-controlled fallback images", async () => {
  for (const html of [null, "", "<script>discard</script>", "<br>".repeat(4001),
    "<html><head><style>p { color: red }</style></head><body><form><p>Discarded form</p></form></body></html>",
    "<div><span>   </span></div>", '<div><img src="javascript:invalid"></div>']) {
    const app = await mount(false, (state) => {
      state.messages[0] = { ...state.messages[0], html, body: "First paragraph\n\nSecond paragraph" };
    });
    try {
      await app.open("a:1");
      assert.equal(app.container.querySelector(".message-body p")?.textContent, "First paragraph");
      assert.equal(app.container.querySelector(".message-images img"), null);
      await app.click(app.button("Show images"));
      assert.equal(app.container.querySelectorAll(".message-images figure img").length, 1);
      assert.equal(app.container.querySelectorAll(".message-body p").length, 2);
      await app.click(app.button("Hide images"));
      assert.equal(app.container.querySelector(".message-images img"), null);
      await app.click(app.button("Show images"));
      await app.key("Escape"); await app.open("a:1");
      assert.equal(app.container.querySelector(".message-images img"), null, "reopening requires fresh consent");
    } finally { await app.close(); }
  }
});
