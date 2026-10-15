import { test } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { JSDOM } from "jsdom";
import type { Mail, State } from "../shared/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

async function mount() {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/" });
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const globals = {
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    location: dom.window.location, history: dom.window.history, HTMLElement: dom.window.HTMLElement,
    requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 0; },
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map(Object.keys(globals).map((key) =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  const makeMail = (accountId: string, uid: number): Mail => ({
    id: `${accountId}:1:${uid}`, remoteId: `1:${uid}`, accountId,
    sender: "Team", address: "sender@example.com", to: "Private Reader <reader@example.com>",
    subject: `Private Reader message ${uid}`, body: "Synthetic body", preview: "Preview",
    date: 2000 - uid, unread: true, labelIds: ["INBOX", "UNREAD"],
    category: "important", relevance: 2, reason: "", archived: false, snoozedUntil: null,
    html: null, images: [], messageId: `<${accountId}-${uid}@example.com>`,
  });
  const state: State = {
    accounts: [{ id: "a", email: "reader@example.com", provider: "imap" },
      { id: "b", email: "second@example.com", provider: "imap" }],
    messages: [makeMail("a", 5), makeMail("a", 6), makeMail("b", 5)],
    labels: [], rules: [], googleConfigured: false, googleClientId: null, jevConfigured: false,
    jevProvider: "typesafe", aiConfigured: false, lastSync: null, syncing: false,
  };
  let changed: (() => void) | undefined;
  (dom.window as unknown as Window).desktop = {
    platform: "linux", materials: false, oauthUrl: "", windowCommand() {}, onNavigation: () => () => {},
    onWindowState: () => () => {}, onAccountConnected: () => () => {},
    onMailChanged: (callback) => { changed = callback; return () => { changed = undefined; }; },
  };
  const previousFetch = globalThis.fetch;
  const mutations: { id: string; action: string }[] = [];
  let readGate: Promise<void> | undefined;
  let trashGate: Promise<void> | undefined;
  let stateGate: ReturnType<typeof deferred<State>> | undefined;
  let rejectRead = false, rejectTrash = false, rejectRefresh = false;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    let data: unknown = {};
    if (url === "/api/state") {
      if (rejectRefresh) throw new Error("Synthetic refresh failure");
      data = { ...(stateGate ? await stateGate.promise : structuredClone(state)), csrf: "synthetic" };
    } else if (url === "/api/sync") {
      data = { errors: [] };
    } else if (options?.method === "PATCH") {
      const id = decodeURIComponent(url.slice("/api/messages/".length));
      const { action, until } = JSON.parse(String(options.body)) as { action: string; until?: number };
      mutations.push({ id, action });
      if (action === "read") await readGate;
      if (action === "trash") await trashGate;
      const failed = (action === "read" && rejectRead) || (action === "trash" && rejectTrash);
      if (failed) return { ok: false, json: async () => ({ error: "Synthetic provider failure" }) } as Response;
      const mail = state.messages.find((mail) => mail.id === id)!;
      if (action === "read") {
        mail.unread = false;
        mail.labelIds = mail.labelIds?.filter((label) => label !== "UNREAD");
      } else if (action === "snooze") mail.snoozedUntil = until!;
      else if (action === "unsnooze") mail.snoozedUntil = null;
      else if (action === "archive") mail.archived = true;
      else if (action === "trash") state.messages = state.messages.filter((mail) => mail.id !== id);
      data = { ok: true };
    } else throw new Error(`Unexpected synthetic request: ${url}`);
    return { ok: true, json: async () => data } as Response;
  };
  const { createRoot } = await import("react-dom/client");
  const { App } = await import("./App");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  await act(async () => root.render(<App />));
  const button = (label: string, scope: ParentNode = container) => {
    const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.getAttribute("aria-label") === label || button.textContent?.trim() === label || button.firstChild?.textContent?.trim() === label);
    assert.ok(found, `button ${label}`);
    return found;
  };
  const click = async (target: HTMLElement) => { await act(async () => target.click()); };
  const key = async (key: string, target: EventTarget = dom.window, options: KeyboardEventInit = {}) => {
    const event = new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
    await act(async () => target.dispatchEvent(event));
    return event;
  };
  const row = (id = "a:1:5") => container.querySelector<HTMLButtonElement>(`[id='mail-${id}']`)!;
  const trash = (id = "a:1:5") => button("Move to Trash", row(id).parentElement!);
  const toolbar = () => container.querySelector<HTMLElement>(".mail-actions")!;
  const dialog = () => container.querySelector<HTMLElement>('[role="dialog"]')!;
  return {
    state, container, button, click, key, row, trash, toolbar, dialog, mutations,
    refresh: async () => { await act(async () => changed?.()); },
    open: async (id = "a:1:5") => { await click(row(id)); await key("Enter", row(id)); },
    // JSDOM has no native button default action; model Enter after dispatching the key.
    activate: async (target: HTMLButtonElement) => {
      target.focus();
      const event = await key("Enter", target);
      if (!event.defaultPrevented && !target.disabled) await click(target);
    },
    holdRead: () => { const gate = deferred<void>(); readGate = gate.promise; return gate; },
    holdTrash: () => { const gate = deferred<void>(); trashGate = gate.promise; return gate; },
    holdState: () => { stateGate = deferred<State>(); return stateGate; },
    finish: async (gate: ReturnType<typeof deferred<void>>) => { await act(async () => gate.resolve()); },
    finishState: async (gate: ReturnType<typeof deferred<State>>, snapshot: State) => {
      stateGate = undefined;
      await act(async () => gate.resolve(snapshot));
    },
    failRead: (value: boolean) => { rejectRead = value; },
    failTrash: (value: boolean) => { rejectTrash = value; },
    failRefresh: (value: boolean) => { rejectRefresh = value; },
    async close() {
      await act(async () => root.unmount());
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

test("selected and reader toolbars confirm reads immediately, coalesce opens and reject stale snapshots", async () => {
  const app = await mount();
  try {
    await app.click(app.row());
    assert.equal(app.mutations.length, 0, "selection alone never marks read");
    assert.equal(app.toolbar().getAttribute("aria-label"), "Selected email actions");
    assert.equal(app.container.querySelector("button button"), null);
    const read = app.holdRead();
    await app.click(app.button("Mark as read", app.toolbar()));
    const pending = app.button("Marking as read…", app.toolbar());
    assert.equal(pending.disabled, true);
    assert.equal(pending.getAttribute("aria-busy"), "true");
    assert.match(app.toolbar().textContent!, /Read update pending/);
    assert.ok(app.row().classList.contains("unread"), "no success while pending");
    await app.open();
    await app.key("Escape");
    await app.open();
    assert.equal(app.mutations.length, 1, "explicit and repeated automatic reads share the same request");
    const stale = structuredClone(app.state);
    const refresh = app.holdState();
    await app.refresh();
    await app.finish(read);
    assert.equal(app.toolbar().getAttribute("aria-label"), "Opened email actions");
    assert.equal(app.button("Read", app.toolbar()).disabled, true, "PATCH success updates before the delayed reload");
    await app.key("Escape");
    assert.equal(app.row().classList.contains("unread"), false);
    assert.equal(app.row("b:1:5").classList.contains("unread"), true, "same remote ID in another account is untouched");
    await app.finishState(refresh, stale);
    assert.equal(app.row().classList.contains("unread"), false, "older snapshot cannot undo a confirmed read");
  } finally { await app.close(); }
});

test("failed reads stay unread without automatic retry; keyboard reopen retries and refresh failure keeps success", async () => {
  const app = await mount();
  try {
    app.failRead(true);
    await app.open();
    assert.equal(app.button("Mark as read", app.toolbar()).disabled, false);
    assert.match(app.container.querySelector(".notice")!.textContent!, /provider failure.*retry/);
    assert.equal(app.mutations.length, 1);
    await app.key("Escape");
    assert.equal(app.row().classList.contains("unread"), true);
    app.failRead(false);
    app.failRefresh(true);
    await app.open();
    assert.equal(app.mutations.length, 2);
    assert.ok(app.button("Read", app.toolbar()).disabled);
    assert.match(app.container.querySelector(".notice")!.textContent!, /marked as read.*refresh failed/);
    await app.key("Escape");
    assert.equal(app.row().classList.contains("unread"), false);
  } finally { await app.close(); }
});

test("pointer Snooze and keyboard Return to inbox use the local message action", async () => {
  const app = await mount();
  try {
    await app.click(app.row("b:1:5"));
    await app.click(app.button("Snooze", app.toolbar()));
    await app.activate(app.button("In one hour", app.dialog()));
    assert.deepEqual(app.mutations, [{ id: "b:1:5", action: "snooze" }]);
    assert.equal(app.row("b:1:5"), null);
    assert.equal(app.state.messages.find((mail) => mail.id === "a:1:5")!.snoozedUntil, null);
    await app.click(app.button("Snoozed1"));
    await app.activate(app.button("Return to inbox", app.toolbar()));
    assert.deepEqual(app.mutations.at(-1), { id: "b:1:5", action: "unsnooze" });
    assert.equal(app.state.messages.find((mail) => mail.id === "b:1:5")!.snoozedUntil, null);
    await app.click(app.button("Inbox3"));
    await app.key("s");
    assert.equal(app.dialog().getAttribute("aria-label"), "Snooze");
    await app.key("Escape");
    assert.equal(app.dialog(), null);
    await app.click(app.button("Archive", app.toolbar()));
    assert.equal(app.mutations.at(-1)!.action, "archive");
  } finally { await app.close(); }
});

test("Trash confirmation is private, cancelable and keyboard accessible; success removes only the confirmed mail", async () => {
  const app = await mount();
  try {
    await app.click(app.button("Hide personal information"));
    await app.click(app.row());
    await app.activate(app.trash());
    assert.equal(app.mutations.length, 0);
    assert.doesNotMatch(app.dialog().outerHTML, /Private Reader|reader@example.com|sender@example.com/);
    assert.doesNotMatch(app.toolbar().outerHTML, /Private Reader|reader@example.com/);
    await app.click(app.button("Cancel", app.dialog()));
    assert.equal(app.mutations.length, 0);
    assert.ok(app.row());
    await app.click(app.trash());
    const cancel = app.button("Cancel", app.dialog());
    cancel.focus();
    const tab = await app.key("Tab", cancel, { shiftKey: true });
    assert.equal(tab.defaultPrevented, false);
    const confirm = app.button("Move to Trash", app.dialog());
    confirm.focus();
    assert.equal((await app.key("Tab", confirm)).defaultPrevented, true);
    assert.equal(app.container.ownerDocument.activeElement?.getAttribute("aria-label"), "Close dialog");
    const gate = app.holdTrash();
    await app.activate(confirm);
    assert.equal(app.button("Moving to Trash…", app.dialog()).disabled, true);
    assert.equal(app.button("Cancel", app.dialog()).disabled, true);
    await app.key("Escape");
    assert.ok(app.dialog(), "pending move cannot be dismissed");
    assert.ok(app.row(), "pending move retains mail");
    assert.equal(app.mutations.length, 1);
    app.failRefresh(true);
    await app.finish(gate);
    assert.equal(app.dialog(), null);
    assert.equal(app.row(), null);
    assert.ok(app.row("a:1:6"));
    assert.ok(app.row("b:1:5"));
    assert.match(app.container.querySelector(".notice")!.textContent!, /moved to Trash.*refresh failed/);
  } finally { await app.close(); }
});

test("failed reader Trash keeps mail visible and never retries or claims success", async () => {
  const app = await mount();
  try {
    await app.open();
    app.failTrash(true);
    await act(async () => app.container.querySelector<HTMLElement>(".message")!
      .dispatchEvent(new app.container.ownerDocument.defaultView!.MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    await app.click(app.button("Move to Trash", app.container.querySelector('[role="menu"]')!));
    await app.click(app.button("Move to Trash", app.dialog()));
    assert.ok(app.container.querySelector(".message"));
    assert.ok(app.dialog());
    assert.match(app.container.querySelector(".notice")!.textContent!, /provider failure.*Check your provider/);
    assert.doesNotMatch(app.container.querySelector(".notice")!.textContent!, /Email moved to Trash/);
    assert.equal(app.mutations.filter((request) => request.action === "trash").length, 1);
    assert.equal(app.button("Move to Trash", app.dialog()).disabled, false);
    await app.key("Escape");
    assert.ok(app.container.querySelector(".message"));
  } finally { await app.close(); }
});

test("archived IMAP without Message-ID disables Trash with an accessible explanation", async () => {
  const app = await mount();
  try {
    app.state.messages[0].archived = true;
    app.state.messages[0].messageId = undefined;
    await app.refresh();
    await app.click(app.button("Archive"));
    const trash = app.trash();
    assert.equal(trash.disabled, true);
    assert.match(trash.getAttribute("aria-description")!, /Message-ID is missing.*provider/);
    await app.click(trash);
    assert.equal(app.dialog(), null);
    assert.equal(app.mutations.length, 0);
  } finally { await app.close(); }
});

test("row Trash targets an unselected email without opening or marking it read", async () => {
  const app = await mount();
  try {
    await app.click(app.row("a:1:6"));
    const trash = app.trash("b:1:5");
    assert.ok(trash.querySelector("svg"));
    assert.equal(trash.textContent, "");
    assert.equal(app.container.querySelector("button button"), null);
    await app.activate(trash);
    assert.equal(app.container.querySelector(".message"), null);
    assert.equal(app.row("a:1:6").getAttribute("aria-current"), "true");
    assert.equal(app.mutations.length, 0);
    await app.click(app.button("Move to Trash", app.dialog()));
    assert.deepEqual(app.mutations, [{ id: "b:1:5", action: "trash" }]);
    assert.ok(app.row("a:1:5"));
    assert.ok(app.row("a:1:6"));
    assert.equal(app.row("b:1:5"), null);
  } finally { await app.close(); }
});
