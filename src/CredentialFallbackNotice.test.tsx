import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CredentialFallbackNotice,
  aboutStorageSentence,
  credentialStorageFooter,
} from "./shell/CredentialFallbackNotice";

test("credential fallback notice appears only in Linux local-key mode", () => {
  assert.equal(renderToStaticMarkup(<CredentialFallbackNotice />), "");
  assert.equal(renderToStaticMarkup(<CredentialFallbackNotice mode="other" />), "");
  const html = renderToStaticMarkup(<CredentialFallbackNotice mode="linux-local" />);
  assert.match(html, /role="alert"/);
  assert.match(html, /protected only by file\s+permissions/);
  assert.match(html, /GNOME Keyring or KWallet/);
});

test("expanded fallback notice offers a hide-for-session control", () => {
  const html = renderToStaticMarkup(
    <CredentialFallbackNotice mode="linux-local" initialCollapsed={false} />,
  );
  assert.match(html, /Hide for this session/);
  assert.match(html, /aria-expanded="true"/);
});

test("collapsed fallback notice stays discoverable as a one-line chip", () => {
  const html = renderToStaticMarkup(
    <CredentialFallbackNotice mode="linux-local" initialCollapsed />,
  );
  assert.doesNotMatch(html, /GNOME Keyring/);
  assert.match(html, /Credential protection: weaker local key/);
  assert.match(html, /Show details/);
  assert.match(html, /aria-expanded="false"/);
  assert.equal(
    renderToStaticMarkup(<CredentialFallbackNotice initialCollapsed />),
    "",
  );
});

test("storage copy is state-aware", () => {
  assert.equal(credentialStorageFooter(), "Encrypted on this computer.");
  assert.equal(aboutStorageSentence(), "Mail is stored encrypted on this computer");
  const footer = credentialStorageFooter("linux-local");
  const about = aboutStorageSentence("linux-local");
  for (const text of [footer, about]) {
    assert.doesNotMatch(text, /encrypted on this computer/i);
    assert.match(text, /local key/);
    assert.match(text, /file permissions/);
    assert.match(text, /weaker than system/);
  }
});
