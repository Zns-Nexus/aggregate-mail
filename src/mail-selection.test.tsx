import { test } from "node:test";
import assert from "node:assert/strict";
import type { Mail } from "../shared/types";
import { selectMail } from "./mail-ui";

const openedMail: Mail = {
  id: "account-a:mail-a",
  accountId: "account-a",
  remoteId: "mail-a",
  sender: "Sender A",
  address: "sender-a@example.com",
  replyTo: "reply-a@example.com",
  to: "reader@example.com",
  subject: "Message A",
  preview: "Body A",
  body: "Body A",
  date: 1,
  unread: false,
  category: "important",
  relevance: 2,
  reason: "Local sorting",
  archived: false,
  snoozedUntil: null,
  messageId: "<a@example.com>",
  threadId: "thread-a",
};
const otherMail: Mail = {
  ...openedMail,
  id: "account-b:mail-b",
  accountId: "account-b",
  remoteId: "mail-b",
  sender: "Sender B",
  address: "sender-b@example.com",
  replyTo: "reply-b@example.com",
  subject: "Message B",
  messageId: "<b@example.com>",
  threadId: "thread-b",
};

test("AI reclassification preserves the open message and its reply source", () => {
  const initial = [openedMail, otherMail];
  assert.equal(selectMail(initial, initial, openedMail.id, true), openedMail);

  const sorted: Mail = { ...openedMail, category: "other", reason: "AI sorting" };
  for (const remaining of [[otherMail], []]) {
    const selected = selectMail([sorted, ...remaining], remaining, openedMail.id, true);
    // The reader and startCompose receive this same current Mail object.
    assert.equal(selected, sorted);
    assert.equal(selected?.accountId, "account-a");
    assert.equal(selected?.replyTo, "reply-a@example.com");
    assert.equal(selected?.messageId, "<a@example.com>");
    assert.equal(selected?.threadId, "thread-a");
  }
});

test("closed-reader selection stays in the filtered list", () => {
  const messages = [openedMail, otherMail];
  assert.equal(selectMail(messages, messages, otherMail.id, false), otherMail);
  assert.equal(selectMail(messages, [otherMail], openedMail.id, false), otherMail);
  assert.equal(selectMail(messages, messages, null, false), openedMail);
  assert.equal(selectMail(messages, [], openedMail.id, false), undefined);
});

test("removing the opened message cannot retarget the reader or reply", () => {
  assert.equal(selectMail([otherMail], [otherMail], openedMail.id, true), undefined);
});
