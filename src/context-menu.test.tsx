import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextMenu, mailMenuRequest } from "./ContextMenu";

test("right-click requests a menu for the target mail and suppresses the default menu", () => {
  let prevented = 0;
  const anchor = { getBoundingClientRect: () => ({ left: 20, bottom: 60 }) } as HTMLElement;
  const event = { currentTarget: anchor, clientX: 0, clientY: 35, preventDefault() { prevented++; } };
  assert.deepEqual(mailMenuRequest(event, "synthetic-mail"), {
    mailId: "synthetic-mail", x: 0, y: 35, anchor,
  });
  assert.equal(prevented, 1);
  assert.deepEqual(mailMenuRequest({ currentTarget: anchor, preventDefault() { prevented++; } }, "keyboard-mail"), {
    mailId: "keyboard-mail", x: 20, y: 60, anchor,
  });
  assert.equal(prevented, 2);
});

test("message actions render as accessible menu items and preserve disabled actions", () => {
  let ran = false;
  const html = renderToStaticMarkup(<ContextMenu x={20} y={35} anchor={{ focus() {} }} onClose={() => {}} actions={[
    { label: "Open", key: "Enter", run() { ran = true; } },
    { label: "Done", disabled: true, run() { ran = true; } },
  ]} />);
  assert.match(html, /role="menu" aria-label="Message actions"/);
  assert.match(html, /role="menuitem">Open<kbd>Enter<\/kbd>/);
  assert.match(html, /role="menuitem" disabled="">Done/);
  assert.equal(ran, false);
});
