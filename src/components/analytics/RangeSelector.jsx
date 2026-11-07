// Compact period control for the Insights view. One segment per supported
// period; the selected segment is a solid espresso pill so the state is
// unmistakable at a glance and to a screen reader (aria-pressed).
const RANGES = [7, 14, 30, 60, 90];

export default function RangeSelector({ value, onChange }) {
  return (
    <div
      role="group"
      aria-label="Time period"
      className="flex w-full items-center gap-0.5 rounded-full p-0.5"
      style={{ background: "#fdf9f2", border: "1px solid #e6dccd", boxShadow: "0 2px 10px rgba(63,56,48,0.06)" }}
    >
      {RANGES.map((days) => {
        const selected = value === days;
        return (
          <button
            key={days}
            type="button"
            onClick={() => onChange(days)}
            aria-pressed={selected}
            aria-label={`Past ${days} days`}
            className="min-h-[34px] flex-1 rounded-full px-1 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              background: selected ? "#3f3830" : "transparent",
              color: selected ? "#fdf9f2" : "#6b6153",
              boxShadow: "none",
            }}
          >
            {days}d
          </button>
        );
      })}
    </div>
  );
}