/**
 * A short row of choices (durations, delays). Always shows the exact minutes so
 * a timing is chosen with its real value in view, never inferred.
 */
export default function ChoiceRow({ label, options, value, onChange, disabled = false }) {
  return (
    <div className="pb-3 pt-1">
      <p className="pb-1.5 text-xs" style={{ color: "#746959" }}>
        {label}
      </p>
      <div className="flex gap-2">
        {options.map((option) => {
          const selected = Number(value) === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className="min-h-[36px] flex-1 rounded-full text-xs font-medium transition disabled:opacity-50"
              style={{
                background: selected ? "#3f3830" : "#f4ece1",
                color: selected ? "#fdf9f2" : "#4a423a",
                border: `1px solid ${selected ? "#3f3830" : "#eadccf"}`,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}