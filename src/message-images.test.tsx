import { test } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { MessageImages, MessageText, PrivacyContext } from "./App";
import { imageSource, type MailImage } from "../shared/types";

const image: MailImage = { src: "https://images.example.com/photo.png", alt: "Photo for alice@example.com" };

test("reader uses bounded paragraphs without altering links, indentation or address masking", () => {
  const text = "\r\n\r\nHello\r\n \r\n\t\r\n\u00a0\r\n  Read https://example.com/report\r\nSecond line\r\n\r\n\r\n";
  const html = renderToStaticMarkup(<MessageText text={text} />);
  assert.equal((html.match(/<p>/g) || []).length, 2);
  assert.ok(html.startsWith("<p>Hello</p><p>  Read <a "));
  assert.ok(html.includes("</a>\nSecond line</p>"));
  assert.equal(text.includes("\r\n \r\n\t\r\n"), true);
  const hidden = renderToStaticMarkup(<PrivacyContext.Provider value={{ on: true, revealed: new Set(), toggle() {} }}>
    <MessageText text={"Contact alice@example.com\n\n\nhttps://example.com/?to=alice%40example.com"} />
  </PrivacyContext.Provider>);
  assert.ok(hidden.includes('class="address veiled"'));
  assert.ok(!hidden.includes("<a "));
  assert.equal(renderToStaticMarkup(<MessageText text={"\n \n\t\n"} />), "");
});

test("image sources reject credentials, local hosts, unsupported schemes and malformed URLs", () => {
  for (const src of ["http://example.com/a", "//example.com/a", "/api/state", "javascript:alert(1)",
    "data:image/svg+xml,<svg/>", "cid:photo", "https://localhost/a", "https://127.0.0.1/a",
    "https://[::1]/a", "https://10.0.0.1/a", "https://2130706433/a", "https://mail.local/a",
    "https://mail.internal/a", "https://user:secret@example.com/a", "https://example.com:32145/a",
    "https://example.com\\a", "https://example.com/a\n", "https://example.com/" + "x".repeat(2048)]) {
    assert.equal(imageSource(src), null, src);
  }
  assert.equal(imageSource("HTTPS://images.example.com/a?x=1&y=2"), "https://images.example.com/a?x=1&y=2");
});

test("mounted reader blocks images until activation, reports loading/failure, and resets on message change", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  let calls: string[] = [];
  let resolve!: (result: { images: MailImage[] }) => void;
  let reject!: (error: Error) => void;
  const loadImages = (id: string) => {
    calls.push(id);
    return new Promise<{ images: MailImage[] }>((yes, no) => { resolve = yes; reject = no; });
  };
  const render = async (id: string, images?: MailImage[]) => {
    await act(async () => root.render(
      <PrivacyContext.Provider value={{ on: true, revealed: new Set(), toggle() {} }}>
        <MessageImages mail={{ id, images }} loadImages={loadImages} />
      </PrivacyContext.Provider>));
  };
  const button = () => container.querySelector("button")!;
  const click = async () => { await act(async () => button().click()); };
  try {
    await render("a:1");
    assert.equal(button().textContent, "Show images");
    assert.equal(button().type, "button"); // Native keyboard activation and focus semantics.
    assert.equal(button().getAttribute("aria-expanded"), "false");
    assert.equal(container.querySelector("img"), null);
    assert.deepEqual(calls, []);
    await click();
    assert.equal(button().textContent, "Loading images…");
    assert.equal(button().disabled, true);
    assert.equal(container.querySelector("img"), null);
    await act(async () => resolve({ images: [image, { src: "https://localhost/private", alt: "unsafe" }] }));
    let img = container.querySelector("img")!;
    assert.equal(container.querySelectorAll("img").length, 1);
    assert.equal(img.getAttribute("src"), image.src);
    assert.equal(img.getAttribute("referrerpolicy"), "no-referrer");
    assert.ok(!img.alt.includes("alice"));
    assert.equal(button().getAttribute("aria-expanded"), "true");
    await act(async () => img.dispatchEvent(new dom.window.Event("load")));
    assert.ok(!container.textContent?.includes("Loading image 1"));
    await act(async () => img.dispatchEvent(new dom.window.Event("error")));
    assert.equal(container.querySelector("img"), null);
    assert.ok(container.textContent?.includes("Image 1 could not be loaded."));
    await click();
    assert.equal(button().textContent, "Show images");
    assert.equal(container.querySelector("img"), null);

    await render("a:2");
    await click();
    const oldResolve = resolve;
    await render("b:1");
    await act(async () => oldResolve({ images: [image] }));
    assert.equal(button().textContent, "Show images");
    assert.equal(container.querySelector("img"), null);
    await click();
    await act(async () => reject(new Error("offline")));
    assert.equal(button().textContent, "Try images again");
    assert.ok(container.textContent?.includes("Images could not be loaded."));
    await click();
    await act(async () => resolve({ images: [] }));
    assert.ok(container.textContent?.includes("No supported remote images"));
    assert.equal(container.querySelector("img"), null);

    calls = [];
    await render("cached", [image]);
    assert.equal(container.querySelector("img"), null);
    await click();
    assert.ok(container.querySelector("img"));
    assert.deepEqual(calls, []);
    await render("empty", []);
    await click();
    assert.ok(container.textContent?.includes("Embedded images are not shown"));
    assert.deepEqual(calls, []);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
  }
});
