import ToggleRow from "./ToggleRow";
import HourSelect from "./HourSelect";

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
  // The owner's own alerts always let urgent low through, so that is not a
  // choice on their screen; a follower's permission is the sharer's, not theirs.
  urgentAlwaysOn = false,
  onChange,
  disabled = false,
  pending = false,
}) {
  const zone = timeZone || "UTC";
  return (
    <div>
      <ToggleRow
        label="Quiet hours"
        pending={pending}
        description="Hold non-urgent notifications during a window you choose."
        checked={Boolean(enabled)}
        disabled={disabled}
        onChange={(next) =>
          onChange(
            next
              ? {
                  quiet_hours_enabled: true,
                  quiet_start_hour: startHour ?? 21,
                  quiet_end_hour: endHour ?? 7,
                  quiet_timezone: zone,
                  ...(urgentAlwaysOn ? { urgent_during_quiet: true } : {}),
                }
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
              disabled={disabled}
              onChange={(hour) => onChange({ quiet_start_hour: hour })}
            />
            <HourSelect
              label="Until"
              value={endHour}
              timeZone={zone}
              disabled={disabled}
              onChange={(hour) => onChange({ quiet_end_hour: hour })}
            />
          </div>
          <p className="pt-1.5 text-xs" style={{ color: "#746959" }}>
            Times use {zone}. A window that runs past midnight is handled.
          </p>
          <p className="pt-1.5 text-xs" style={{ color: "#746959" }}>
            {urgentAlwaysOn
              ? "Urgent low still comes through this window. Every other alert is held."
              : "Urgent low follows your choice below."}
          </p>
          {!urgentAlwaysOn && (
            <div className="pt-1">
              <ToggleRow
                label="Allow urgent low during quiet hours"
                description="Separate choice. Off means nothing is sent in this window, urgent included."
                checked={Boolean(urgentDuringQuiet)}
                disabled={disabled}
                onChange={(next) => onChange({ urgent_during_quiet: next })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}