import assert from "node:assert/strict";
import { test } from "node:test";
import type { Account, Mail } from "../shared/types";
import { compileMailSearch } from "./mail-search";

const accounts: Account[] = [
  { id: "work-id", email: "work@example.com", name: "Work inbox", provider: "imap" },
  { id: "home-id", email: "home@example.com", provider: "imap" },
];
const mail: Mail = {
  id: "work-id:1", accountId: "work-id", remoteId: "1", sender: "Ada Lovelace",
  address: "ada@example.com", to: "me@example.com", cc: "team@example.com",
  subject: "Quarterly planning", preview: "Review the launch plan", body: "The project is ready.",
  date: Date.UTC(2025, 2, 1), unread: true, pinned: true, category: "important", relevance: 2,
  reason: "Team", archived: true, snoozedUntil: null,
};

test("plain text, quoted phrases, field terms and exclusions combine with AND", () => {
  assert.equal(compileMailSearch('quarterly "launch plan" -draft', accounts).matches(mail), true);
  assert.equal(compileMailSearch('subject:"quarterly planning" from:ADA', accounts).matches(mail), true);
  assert.equal(compileMailSearch("to:team@example.com body:project", accounts).matches(mail), true);
  assert.equal(compileMailSearch("subject:launch to:other@example.com", accounts).matches(mail), false);
  assert.equal(compileMailSearch("notfound", accounts).matches(mail), false);
});

test("account aliases, state filters, and unknown prefixes", () => {
  assert.equal(compileMailSearch("account:work-id", accounts).matches(mail), true);
  assert.equal(compileMailSearch("account:WORK@EXAMPLE.COM", accounts).matches(mail), true);
  assert.equal(compileMailSearch('account:"Work inbox"', accounts).matches(mail), true);
  assert.equal(compileMailSearch("account:home-id", accounts).matches(mail), false);
  assert.equal(compileMailSearch("is:unread is:pinned", accounts).matches(mail), true);
  assert.equal(compileMailSearch("is:read", accounts).matches(mail), false);
  assert.equal(compileMailSearch("label:Quarterly", accounts).matches(mail), false);
});

test("date bounds use UTC day starts with before exclusive and after inclusive", () => {
  const before = Date.UTC(2025, 2, 1) - 1;
  const start = Date.UTC(2025, 2, 1);
  const end = Date.UTC(2025, 2, 2);
  const at = (date: number) => ({ ...mail, date });
  assert.equal(compileMailSearch("before:2025-03-01").matches(at(before)), true);
  assert.equal(compileMailSearch("before:2025-03-01").matches(at(start)), false);
  assert.equal(compileMailSearch("after:2025-03-01").matches(at(start)), true);
  assert.equal(compileMailSearch("after:2025-03-01").matches(at(end)), true);
});

test("malformed recognized operators fail closed without echoing query text", () => {
  for (const query of ['"open', "from:", "is:maybe", "before:2025-02-29", "after:tomorrow", "-"]) {
    const result = compileMailSearch(query, accounts);
    assert.equal(result.matches(mail), false);
    assert.ok(result.error);
    assert.equal(result.error.includes(query), false);
  }
});
