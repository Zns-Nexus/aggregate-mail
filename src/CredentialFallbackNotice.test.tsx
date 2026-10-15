import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CredentialFallbackNotice } from "./shell/CredentialFallbackNotice";

test("credential fallback notice appears only in Linux local-key mode", () => {
  assert.equal(renderToStaticMarkup(<CredentialFallbackNotice />), "");
  assert.equal(renderToStaticMarkup(<CredentialFallbackNotice mode="other" />), "");
  const html = renderToStaticMarkup(<CredentialFallbackNotice mode="linux-local" />);
  assert.match(html, /role="alert"/);
  assert.match(html, /protected only by file\s+permissions/);
  assert.match(html, /GNOME Keyring or KWallet/);
});
