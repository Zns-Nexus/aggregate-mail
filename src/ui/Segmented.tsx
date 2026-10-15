/** A row of mutually exclusive choices, drawn as a segmented control. */
export function Segmented<T extends string>({ labelledBy, value, choices, disabled, onChange }: {
  labelledBy: string;
  value: T;
  choices: readonly { id: T; label: string }[];
  disabled?: (choice: T) => boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-labelledby={labelledBy}>
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          role="radio"
          aria-checked={value === choice.id}
          className={value === choice.id ? "active" : undefined}
          disabled={disabled?.(choice.id)}
          onClick={() => onChange(choice.id)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
