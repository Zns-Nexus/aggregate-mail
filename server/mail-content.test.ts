import { test } from "node:test";
import assert from "node:assert/strict";
import { boundedMailHtml, MAIL_HTML_LIMIT, MAIL_NODE_LIMIT, MAIL_DEPTH_LIMIT,
  parseMailContent, mailStyle, mailLink, privateMailLink, type MailContentNode } from "../shared/mail-content.js";

test("bounded source preserves exact decoded HTML and treats absent or oversized HTML as null", () => {
  const html = "  <p>Original &amp; source</p>\r\n";
  assert.equal(boundedMailHtml(html), html);
  for (const input of [false, undefined, "", "  ", "a".repeat(MAIL_HTML_LIMIT + 1)] as const)
    assert.equal(boundedMailHtml(input), null);
});

test("parser preserves sender structure and drops active content, attributes and global CSS", () => {
  const nodes = parseMailContent('<html><head><style>body{color:red}</style></head><body><table id="outer" onclick="bad()"><tr><td colspan="2"><h1>Title</h1>Text &amp; more<img src="https://example.com/photo" srcset="leak 2x"></td></tr></table><script>bad()</script><form>secret</form><svg><text>hidden</text></svg><iframe>frame</iframe><object>object</object></body></html>');
  const serialized = JSON.stringify(nodes);
  for (const removed of ["onclick", "srcset", "outer", "bad()", "secret", "hidden", "frame", "object", "body{color:red}"])
    assert.ok(!serialized.includes(removed), removed);
  const textOf = (items: MailContentNode[]): string => items.map((node) => typeof node === "string" ? node : textOf(node.children)).join("");
  assert.equal(textOf(nodes!), "TitleText & more");
  for (const preserved of ['"table"', '"colspan":"2"', '"h1"', "https://example.com/photo"])
    assert.ok(serialized.includes(preserved), preserved);
});

test("input, nodes and depth are bounded before React traversal", () => {
  assert.equal(parseMailContent("x".repeat(MAIL_HTML_LIMIT + 1)), null);
  assert.equal(parseMailContent("<br>".repeat(MAIL_NODE_LIMIT + 1)), null);
  assert.equal(parseMailContent("<div>".repeat(MAIL_DEPTH_LIMIT + 1) + "text"), null);
  assert.deepEqual(parseMailContent("<p>Hello"), [{ tag: "p", attributes: {}, children: ["Hello"] }]);
});

test("inline style grammar retains bounded sender presentation and rejects resource or escape values", () => {
  assert.deepEqual(mailStyle("color:#123456;background-color:rgb(1, 2, 3);font-size:18pt;font-weight:700;text-align:center;padding:4px 1em;border:1px solid red;width:80%;position:fixed;z-index:999999"), {
    color: "#123456", backgroundColor: "rgb(1, 2, 3)", fontSize: "24px", fontWeight: "700", textAlign: "center",
    padding: "4px 16px", border: "1px solid red", width: "80%",
  });
  assert.deepEqual(mailStyle('background:url(https://example.com/track);background-image:url(x);font-family:RemoteFont;src:url(x);color:var(--token);color:expression(bad());color:r\\65 d;width:99999px;height:100vh;font-size:9em;line-height:999;transform:translateX(100vw);margin:-1px;opacity:0;display:none'), {});
});

test("links use explicit HTTP schemes and privacy catches encoded tokens, malformed UTF-8 and nested encoding", () => {
  for (const link of ["javascript:alert(1)", "data:text/html,bad", "file:///etc/passwd", "//example.com", "/api/state", "mailto:sender@example.com", "https://user:pass@example.com", "https://example.com/%zz", "https://example.com\\a"])
    assert.equal(mailLink(link), null, link);
  assert.equal(mailLink("HTTP://example.com/public"), "http://example.com/public");
  const redact = (s: string) => s.replace(/reader@example\.com|Morgan Example/gi, "[hidden]");
  for (const value of ["https://example.com/?to=reader@example.com", "https://example.com/?to=reader%40example.com&byte=%FF", "https://example.com/?to=reader%2540example.com", "https://example.com/?name=Morgan+Example", "https://example.com/?name=Morgan%20Example", "https://example.com/?to=reader%25252525252540example.com"])
    assert.equal(privateMailLink(value, redact), true, value);
  assert.equal(privateMailLink("https://example.com/public?q=one%20two", redact), false);
});
