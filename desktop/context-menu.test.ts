import assert from "node:assert/strict";
import { test } from "node:test";
import { editingMenu } from "./context-menu.js";

const editFlags = {
  canUndo: false, canRedo: false, canCut: false, canCopy: false,
  canPaste: true, canDelete: false, canSelectAll: true, canEditRichly: false,
};

test("editing menus respect Chromium permissions and leave mail actions to the client", () => {
  assert.deepEqual(editingMenu({ isEditable: false, selectionText: "", editFlags }), []);
  assert.deepEqual(editingMenu({ isEditable: false, selectionText: "Selected text", editFlags: { ...editFlags, canCopy: true } }), [{ role: "copy", enabled: true }]);
  const items = editingMenu({ isEditable: true, selectionText: "", editFlags });
  assert.equal(items.find((item) => item.role === "copy")?.enabled, false);
  assert.equal(items.find((item) => item.role === "cut")?.enabled, false);
  assert.equal(items.find((item) => item.role === "paste")?.enabled, true);
  assert.equal(items.find((item) => item.role === "undo")?.enabled, false);
  assert.equal(items.find((item) => item.role === "selectAll")?.enabled, true);
});
