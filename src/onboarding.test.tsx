import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectDialog, SettingsPage } from "./App";
import type { Provider, State } from "../shared/types";

const state: State = {
  accounts: [], messages: [], rules: [], googleConfigured: false,
  googleClientId: null, jevConfigured: false, jevProvider: "typesafe",
  aiConfigured: false, lastSync: null,
};
const settings = (googleConfigured: boolean) => {
  globalThis.window = { desktop: undefined } as unknown as Window & typeof globalThis;
  globalThis.location = { origin: "http://127.0.0.1:3001" } as Location;
  return renderToStaticMarkup(<SettingsPage
    state={{ ...state, googleConfigured }} busy={false} api={async <T,>() => ({} as T)}
    perform={async () => {}} onConnectAccount={() => {}} onNotice={() => {}}
    windowSide="left" onWindowSide={() => {}}
  />);
};
const form = (provider: Exclude<Provider, "gmail">, busy = false) => renderToStaticMarkup(
  <ConnectDialog provider={provider} busy={busy} onClose={() => {}} onConnect={async () => {}} />,
);

test("unconfigured Google sign-in is not offered and account onboarding stays separate from developer setup", () => {
  const html = settings(false);
  assert.ok(!html.includes('href="/api/oauth/google"'));
  assert.match(html, /Connect account/);
  assert.match(html, /<details[^>]*><summary>Advanced connection setup<\/summary>/);
});
test("configured Google sign-in is offered", () => {
  assert.match(settings(true), /href="\/api\/oauth\/google"/);
});
test("Gmail app password form explains Workspace and policy limits without server fields", () => {
  const html = form("gmail-imap");
  assert.match(html, /Connect Gmail/);
  assert.match(html, /2-Step Verification/);
  assert.match(html, /Workspace/);
  assert.match(html, /account.*admin policy/);
  assert.match(html, /https:\/\/support.google.com\/accounts\/answer\/185833/);
  assert.ok(!html.includes('name="imapHost"'));
  assert.ok(!html.includes('name="username"'));
  assert.ok(!html.includes('type="text" name="password"'));
});
test("known providers have official password help and only custom IMAP exposes servers", () => {
  for (const provider of ["icloud", "fastmail", "yahoo"] as const) {
    const html = form(provider);
    assert.match(html, /<a [^>]*href="https:\/\//);
    assert.ok(!html.includes('name="imapHost"'));
  }
  assert.match(form("imap"), /name="imapHost"/);
  assert.match(form("imap"), /name="smtpHost"/);
});
test("busy connection form prevents another submission", () => {
  assert.match(form("gmail-imap", true), /<button[^>]*disabled=""[^>]*>Wait for the current action<\/button>/);
});
