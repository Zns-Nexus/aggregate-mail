import type { ContextMenuParams, MenuItemConstructorOptions } from "electron";

export function editingMenu({ isEditable, selectionText, editFlags }: Pick<ContextMenuParams, "isEditable" | "selectionText" | "editFlags">): MenuItemConstructorOptions[] {
  if (isEditable) return [
    { role: "undo", enabled: editFlags.canUndo },
    { role: "redo", enabled: editFlags.canRedo },
    { type: "separator" },
    { role: "cut", enabled: editFlags.canCut },
    { role: "copy", enabled: editFlags.canCopy },
    { role: "paste", enabled: editFlags.canPaste },
    { type: "separator" },
    { role: "selectAll", enabled: editFlags.canSelectAll },
  ];
  return selectionText ? [{ role: "copy", enabled: editFlags.canCopy }] : [];
}
