import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "./icons";

// A dark dropdown: the native select popup ignores the app's theme on Windows.
export function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(value);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);
  useEffect(() => {
    if (!open) return;
    setActive(value);
    const away = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [open, value]);
  const commit = (next: T) => {
    setOpen(false);
    trigger.current?.focus();
    if (next !== value) onChange(next);
  };
  const move = (step: number) => {
    const index = options.findIndex((option) => option.value === active);
    setActive(options[Math.min(options.length - 1, Math.max(0, index + step))].value);
  };
  return (
    <div className="dropdown" ref={root}>
      <button
        type="button"
        ref={trigger}
        className="dropdown-trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            move(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            move(-1);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            commit(active);
          } else if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {options.find((option) => option.value === value)?.label}
        <ChevronDown color="currentColor" size={12} className={open ? "up" : undefined} />
      </button>
      {open && (
        <ul
          className="dropdown-menu"
          id={id}
          role="listbox"
          aria-label={label}
        >
          {options.map((option) => (
            <li
              key={option.value}
              id={`${id}-${option.value}`}
              role="option"
              aria-selected={option.value === value}
              className={option.value === active ? "active" : undefined}
              onMouseEnter={() => setActive(option.value)}
              onClick={() => commit(option.value)}
            >
              {option.label}
              {option.value === value && <Check color="currentColor" size={12} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
