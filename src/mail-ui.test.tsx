import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { GmailLabel, Mail } from "../shared/types";
import { LabelForm, PrivacyContext } from "./App";
import { customLabels, densityShortcut, markReadOnOpen, matchesLabel, selectedMail } from "./mail-ui";

const mail: Mail = {
  id: "a:1", accountId: "a", remoteId: "1", sender: "Sender",
  address: "sender@example.com", to: "me@example.com", subject: "Subject",
  body: "Body", preview: "Body", date: 1700000000000, unread: true,
  category: "important", relevance: 2, reason: "Team", archived: true,
  snoozedUntil: null, labelIds: ["Label_1", "UNREAD"],
};
const labels: GmailLabel[] = [
  { id: "Label_1", accountId: "a", name: "Team <notes>", type: "user" },
  { id: "Label_2", accountId: "a", name: "me@example.com", type: "user" },
  { id: "Label_1", accountId: "b", name: "Other account", type: "user" },
  { id: "UNREAD", accountId: "a", name: "Unread", type: "system" },
];

test("density shortcuts recognize main keyboard and numpad without hijacking other modifiers", () => {
  const event = { key: "", code: "", ctrlKey: true, altKey: false, metaKey: false };
  for (const key of ["+", "=", "Add"]) assert.equal(densityShortcut({ ...event, key }), "comfortable");
  for (const key of ["-", "Subtract"]) assert.equal(densityShortcut({ ...event, key }), "compact");
  assert.equal(densityShortcut({ ...event, code: "NumpadAdd" }), "comfortable");
  assert.equal(densityShortcut({ ...event, code: "NumpadSubtract" }), "compact");
  assert.equal(densityShortcut({ ...event, key: "+", ctrlKey: false }), null);
  assert.equal(densityShortcut({ ...event, key: "+", altKey: true }), null);
  assert.equal(densityShortcut({ ...event, key: "+", metaKey: true }), null);
  assert.equal(densityShortcut({ ...event, key: "d" }), null);
});

test("Gmail label filters and editors stay account-scoped, escape names and preserve address privacy", () => {
  assert.equal(matchesLabel(mail), true);
  assert.equal(matchesLabel(mail, labels[0]), true);
  assert.equal(matchesLabel(mail, labels[1]), false);
  assert.equal(matchesLabel(mail, labels[2]), false);
  assert.equal(matchesLabel({ ...mail, labelIds: undefined }, labels[0]), false);
  const editable = customLabels(mail, labels);
  assert.deepEqual(editable.map((label) => label.id), ["Label_1", "Label_2"]);
  const render = (privacy: boolean) => renderToStaticMarkup(
    <PrivacyContext.Provider value={{ on: privacy, revealed: new Set(), toggle() {} }}>
      <LabelForm mail={mail} labels={editable} busy={false} onSave={() => {}} />
    </PrivacyContext.Provider>,
  );
  const html = render(false);
  assert.match(html, /Team &lt;notes&gt;/);
  assert.match(html, /checked=""/);
  assert.doesNotMatch(html, /Other account|Unread/);
  assert.match(render(true), /class="address veiled"[^>]*>me@example.com<\/span>/);
});

test("opening archived unread mail requests read, coalesces duplicate opens and allows retry after failure", async () => {
  const pending = new Set<string>();
  let calls = 0;
  let finish = () => {};
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const update = async () => { calls++; await gate; };
  const first = markReadOnOpen(mail, pending, update);
  await markReadOnOpen(mail, pending, update);
  assert.equal(calls, 1);
  assert.equal(pending.has(mail.id), true);
  finish();
  await first;
  assert.equal(pending.size, 0);
  await assert.rejects(markReadOnOpen(mail, pending, async () => { throw new Error("offline"); }), /offline/);
  assert.equal(pending.size, 0);
  await markReadOnOpen(mail, pending, async () => { calls++; });
  assert.equal(calls, 2);
  await markReadOnOpen({ ...mail, unread: false }, pending, update);
  assert.equal(calls, 2);
});

test("opened mail stays visible after marking read removes it from the Unread label filter", () => {
  const read = { ...mail, unread: false, labelIds: ["Label_1"] };
  const next = { ...mail, id: "a:2" };
  assert.equal(selectedMail([read, next], [next], read.id, true), read);
  assert.equal(selectedMail([read, next], [next], read.id, false), next);
});
