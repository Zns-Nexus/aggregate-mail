import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageBody } from "./mail/MessageContent";
import { PrivacyContext } from "./ui/Privacy";

const render = (text: string, privacy = false) => renderToStaticMarkup(
  <PrivacyContext.Provider value={{ on: privacy, revealed: new Set(), toggle: () => {} }}>
    <MessageBody text={text} />
  </PrivacyContext.Provider>,
);

test("the real body renderer links explicit HTTP URLs and preserves surrounding text", () => {
  assert.equal(
    render("  Read [https://example.com/document]\n<http://example.com/a?x=1&y=2>, (https://example.com/a_(b))."),
    '  Read [<a href="https://example.com/document" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">https://example.com/document</a>]\n&lt;<a href="http://example.com/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">http://example.com/a?x=1&amp;y=2</a>&gt;, (<a href="https://example.com/a_(b)" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">https://example.com/a_(b)</a>).',
  );
});

test("body markup stays escaped and unsafe or malformed URLs stay text", () => {
  const html = render('<script>alert(1)</script> javascript:alert(1) javascript:https://example.com mailto:a@example.com ftp://example.com https:// http://[broken] https://example.com:bad https://example.com/%zz https://example.com\\path www.example.com');
  assert.ok(html.startsWith("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(!html.includes("<a "));
  assert.ok(!html.includes("<script>"));
});

test("curly quotation marks stay outside link destinations", () => {
  for (const [open, close] of [["“", "”"], ["‘", "’"]]) {
    assert.equal(
      render(`See ${open}https://example.com/report${close}.`),
      `See ${open}<a href="https://example.com/report" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">https://example.com/report</a>${close}.`,
    );
  }
});

test("privacy masks encoded addresses even when another URL byte is not UTF-8", () => {
  const html = render("https://example.com/?to=alice%40example.com&byte=%FF", true);
  assert.ok(!html.includes("<a "));
  assert.ok(!html.includes("alice"));
});

test("balanced brackets and nested parentheses stay in URLs, prose punctuation stays outside", () => {
  assert.equal(
    render("HTTP://[::1]/a_(b(c))!"),
    '<a href="HTTP://[::1]/a_(b(c))" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">HTTP://[::1]/a_(b(c))</a>!',
  );
});

test("privacy keeps addresses out of hrefs and never nests address controls in links", () => {
  const text = "https://example.com/?to=alice@example.com https://alice%40example.com@example.org/path https://example.com/?to=alice%40example.com https://example.com/public";
  const privateHtml = render(text, true);
  assert.equal((privateHtml.match(/<a /g) ?? []).length, 1);
  assert.ok(privateHtml.includes('href="https://example.com/public"'));
  assert.ok(!privateHtml.includes("alice"));
  assert.ok(!privateHtml.includes("%40"));
  assert.ok(!privateHtml.includes('href="https://example.com/?to='));
  const publicHtml = render(text);
  assert.equal((publicHtml.match(/<a /g) ?? []).length, 4);
  assert.ok(!publicHtml.includes('<span class="address'));
});

test("long runs of unmatched URL brackets do not stall the renderer", () => {
  const trailing = ")".repeat(20000);
  const start = performance.now();
  const html = render(`https://example.com/${trailing}`);
  assert.ok(html.endsWith(`</a>${trailing}`));
  assert.ok(performance.now() - start < 2000, "bracket trimming must not rescan the URL for every character");
});
