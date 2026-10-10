import { test } from "node:test";
import assert from "node:assert/strict";
import { isExternalLink, isLocalNavigation } from "./navigation.js";
const origin = "http://127.0.0.1:32145";
test("desktop only navigates its own UI and hands safe links to the browser", () => {
  assert.ok(isLocalNavigation(`${origin}/?connected=1`, origin));
  assert.ok(!isLocalNavigation(`${origin}/api/state`, origin));
  assert.ok(isExternalLink(`${origin}/api/oauth/google`, origin));
  assert.ok(isExternalLink("https://accounts.google.com/", origin));
  assert.ok(isExternalLink("http://example.com/document?x=1", origin));
  for (const url of [
    "file:///C:/Windows",
    "javascript:alert(1)",
    "mailto:person@example.com",
    "ftp://example.com",
    "data:text/html,hello",
    `${origin}/api/send`,
    `${origin}/api/state`,
    `${origin}/api/oauth/google/extra`,
    `${origin}/`,
    "http://[broken]",
    "https://example.com:bad",
    "not a url",
  ])
    assert.ok(!isExternalLink(url, origin));
});
