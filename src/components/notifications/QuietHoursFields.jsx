import ToggleRow from "./ToggleRow";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

function HourSelect({ label, value, onChange, timeZone }) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-xs" style={{ color: "#746959" }}>
        {label}
      </span>
      <select
        value={value == null ? "" : String(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`${label} (${timeZone})`}
        className="min-h-[40px] rounded-lg px-2 text-sm"
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

/**
 * Quiet hours for one recipient.
 *
 * The window may cross midnight, and the zone is the person's own confirmed
 * timezone so the hours follow daylight saving instead of drifting.
 */
export default function QuietHoursFields({
  enabled,
  startHour,
  endHour,
  timeZone,
  urgentDuringQuiet,
  onChange,
  disabled = false,
}) {
  const zone = timeZone || "UTC";
  return (
    <div>
      <ToggleRow
        label="Quiet hours"
        description="Hold non-urgent notifications during a window you choose."
        checked={Boolean(enabled)}
        disabled={disabled}
        onChange={(next) =>
          onChange(
            next
              ? { quiet_hours_enabled: true, quiet_start_hour: startHour ?? 21, quiet_end_hour: endHour ?? 7, quiet_timezone: zone }
              : { quiet_hours_enabled: false }
          )
        }
      />

      {enabled && (
        <div className="pb-2">
          <div className="flex gap-2">
            <HourSelect
              label="From"
              value={startHour}
              timeZone={zone}
              onChange={(hour) => onChange({ quiet_start_hour: hour })}
            />
            <HourSelect
              label="Until"
              value={endHour}
              timeZone={zone}
              onChange={(hour) => onChange({ quiet_end_hour: hour })}
            />
          </div>
          <p className="pt-1.5 text-xs" style={{ color: "#746959" }}>
            Times use {zone}. A window that runs past midnight is handled.
          </p>
          <div className="pt-1">
            <ToggleRow
              label="Allow urgent low during quiet hours"
              description="Separate choice. Off means nothing is sent in this window, urgent included."
              checked={Boolean(urgentDuringQuiet)}
              disabled={disabled}
              onChange={(next) => onChange({ urgent_during_quiet: next })}
            />
          </div>
        </div>
      )}
    </div>
  );
}