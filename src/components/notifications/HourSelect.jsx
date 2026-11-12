const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour);

/** 12-hour clock label with minutes, e.g. 10:00 PM. */
export function hourLabel(hour) {
  const value = Number(hour);
  if (!Number.isFinite(value)) return "";
  const suffix = value >= 12 ? "PM" : "AM";
  const display = value % 12 === 0 ? 12 : value % 12;
  return `${display}:00 ${suffix}`;
}

export { HOUR_OPTIONS };

/** One hour picker on the app's own cream field. */
export default function HourSelect({ label, value, onChange, timeZone, disabled, ariaLabel }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs" style={{ color: "#746959" }}>
        {label}
      </span>
      <select
        disabled={disabled}
        value={value == null ? "" : String(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`${ariaLabel || label} (${timeZone})`}
        className="min-h-11 w-full min-w-0 rounded-lg px-2 text-base"
        style={{ background: "#fdf9f2", border: "1px solid #eadccf", color: "#3f3830" }}
      >
        {HOUR_OPTIONS.map((hour) => (
          <option key={hour} value={hour}>
            {hourLabel(hour)}
          </option>
        ))}
      </select>
    </label>
  );
}