import assert from "node:assert/strict";
import { test } from "node:test";
import { reuseMailState } from "./mail-state";
import type { State } from "../shared/types";

const state: State = {
  accounts: [{ id: "a", email: "reader@example.com", provider: "gmail" }],
  messages: [{ id: "a:1", accountId: "a", remoteId: "1", sender: "Sender", address: "sender@example.com",
    to: "reader@example.com", subject: "Synthetic", preview: "Preview", body: "Body", date: 1,
    unread: true, archived: false, category: "important", relevance: 2, reason: "", snoozedUntil: null,
    html: "<p>Body</p>", images: [{ src: "https://images.example.com/image.png", alt: "Synthetic image" }] }],
  labels: [{ id: "shared", accountId: "a", name: "Team", type: "user" },
    { id: "shared", accountId: "b", name: "Other team", type: "user" }],
  rules: [], googleConfigured: false, googleClientId: null, jevConfigured: false,
  jevProvider: "typesafe", aiConfigured: false, lastSync: null, syncing: false,
};

test("unchanged snapshots reuse state, including mail formatting, images and account-scoped labels", () => {
  assert.equal(reuseMailState(state, structuredClone(state)), state);
  const incoming = structuredClone(state); incoming.lastSync = 10;
  const result = reuseMailState(state, incoming);
  assert.notEqual(result, state);
  assert.equal(result.lastSync, 10);
  assert.equal(result.messages, state.messages);
  assert.equal(result.accounts, state.accounts);
  assert.equal(result.labels, state.labels);
});

test("changed mail, recipient privacy names, new records, removals and order remain observable", () => {
  for (const field of ["html", "body", "to"] as const) {
    const incoming = structuredClone(state); incoming.messages[0][field] = "Changed";
    const result = reuseMailState(state, incoming);
    assert.notEqual(result.messages[0], state.messages[0]);
    assert.equal(result.messages[0][field], "Changed");
  }
  const incoming = structuredClone(state);
  incoming.messages[0].images![0].alt = "Changed description";
  incoming.accounts[0].email = "another-reader@example.com";
  incoming.labels.reverse();
  const result = reuseMailState(state, incoming);
  assert.notEqual(result.messages[0], state.messages[0]);
  assert.notEqual(result.accounts[0], state.accounts[0]);
  assert.equal(result.labels[0], state.labels[1]);
  assert.equal(result.labels[1], state.labels[0]);
  incoming.messages = [];
  assert.equal(reuseMailState(state, incoming).messages.length, 0);
  incoming.messages = [{ ...state.messages[0], id: "a:2", remoteId: "2" }];
  assert.equal(reuseMailState(state, incoming).messages[0].id, "a:2");
});
