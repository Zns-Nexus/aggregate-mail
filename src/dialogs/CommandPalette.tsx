import { useId, useState } from "react";
import { Dialog } from "../ui/Dialog";

export type PaletteCommand = {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
};

export function CommandPalette({ commands, onClose }: { commands: PaletteCommand[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const id = useId();
  const visible = commands.filter((command) => command.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const enabled = visible.filter((command) => !command.disabled);
  const active = enabled.find((command) => command.id === selected) ?? enabled[0];
  const optionId = (command: PaletteCommand) => `${id}-${commands.indexOf(command)}`;
  const execute = (command: PaletteCommand) => {
    if (command.disabled) return;
    onClose();
    command.run();
  };
  return <Dialog title="Commands" onClose={onClose}>
    <div className="command-palette">
      <input role="combobox" aria-label="Search commands" aria-autocomplete="list" aria-expanded="true"
        aria-controls={`${id}-list`} aria-activedescendant={active ? optionId(active) : undefined}
        placeholder="Search commands…" value={query}
        onChange={(event) => { setQuery(event.target.value); setSelected(null); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!enabled.length) return;
            const index = active ? enabled.indexOf(active) : 0;
            const next = enabled[(index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length];
            setSelected(next.id);
            document.getElementById(optionId(next))?.scrollIntoView?.({ block: "nearest" });
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (active) execute(active);
          }
        }} />
      <div id={`${id}-list`} role="listbox" aria-label="Commands" className="command-options">
        {visible.map((command) => <div key={command.id} id={optionId(command)} role="option"
          aria-selected={active?.id === command.id} aria-disabled={command.disabled || undefined}
          className="command-option" onMouseDown={(event) => event.preventDefault()}
          onMouseMove={() => { if (!command.disabled) setSelected(command.id); }}
          onClick={() => execute(command)}>
          <span>{command.label}</span>{command.shortcut && <kbd>{command.shortcut}</kbd>}
        </div>)}
      </div>
      {!visible.length && <p className="command-empty" role="status">No matching commands</p>}
    </div>
  </Dialog>;
}
