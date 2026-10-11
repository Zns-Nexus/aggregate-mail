import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageText } from "./App";
import { FormattedMail } from "./FormattedMail";

test("image status styles preserve body paragraph size, spacing and sender presentation", () => {
  const markup = renderToStaticMarkup(<section className="message-images">
    <div className="message-body"><MessageText text="Plain text" />
      <FormattedMail html='<p>Formatted text</p><p style="font-size:24px">Large text</p>'
        showImages={false} privacy={false} renderText={(text) => text} redactText={(text) => text} />
    </div><p role="status">Loading images</p>
  </section>);
  const dom = new JSDOM(`<style></style>${markup}`);
  try {
    const document = dom.window.document;
    document.querySelector("style")!.textContent = readFileSync(new URL("./style.css", import.meta.url), "utf8");
    // jsdom does not resolve inherited font sizes, so read the first specified ancestor.
    const fontSize = (element: Element): string => {
      for (let current: Element | null = element; current; current = current.parentElement) {
        const size = dom.window.getComputedStyle(current).fontSize;
        if (size) return size;
      }
      return "";
    };
    const paragraphs = [...document.querySelectorAll(".message-body p")];
    assert.deepEqual(paragraphs.map(fontSize), ["15px", "15px", "24px"]);
    assert.deepEqual(paragraphs.map((p) => dom.window.getComputedStyle(p).marginBottom), ["0.85em", "0.85em", "0.85em"]);
    assert.equal(fontSize(document.querySelector('[role="status"]')!), "13px");
  } finally { dom.window.close(); }
});
