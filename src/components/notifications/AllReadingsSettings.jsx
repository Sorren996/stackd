import SectionCard from "@/components/editorial/SectionCard";
import ToggleRow from "@/components/notifications/ToggleRow";
import HourSelect, { hourLabel } from "@/components/notifications/HourSelect";

/**
 * The all-readings stream.
 *
 * Owner only — a follower account never renders this, and the server refuses to
 * store it for one. It is one toggle with one pause window, not another
 * accordion, and it changes nothing about the alerts above it.
 */
export default function AllReadingsSettings({ draft, pendingKeys = [], disabled = false, onChange }) {
  const zone = draft.all_readings_pause_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const on = draft.all_readings_enabled === true;
  const paused = draft.all_readings_pause_enabled === true;
  const startHour = draft.all_readings_pause_start_hour ?? 22;
  const endHour = draft.all_readings_pause_end_hour ?? 6;
  const pending = pendingKeys.some((key) => key.startsWith("all_readings"));

  return (
    <SectionCard label="Every reading">
      <ToggleRow
        label="Receive all readings"
        description="One quiet note for each new reading, in addition to the alerts above."
        checked={on}
        pending={pendingKeys.includes("all_readings_enabled")}
        disabled={disabled}
        onChange={(value) =>
          onChange(
            value
              ? { all_readings_enabled: true }
              : { all_readings_enabled: false, all_readings_pause_enabled: false }
          )
        }
      />

      {on && (
        <div className="pb-2">
          <ToggleRow
            label="Pause these"
            description="Hold the all-readings notes during a window you choose."
            checked={paused}
            pending={pendingKeys.includes("all_readings_pause_enabled")}
            disabled={disabled}
            onChange={(value) =>
              onChange(
                value
                  ? {
                      all_readings_pause_enabled: true,
                      all_readings_pause_start_hour: startHour,
                      all_readings_pause_end_hour: endHour,
                      all_readings_pause_timezone: zone,
                    }
                  : { all_readings_pause_enabled: false }
              )
            }
          />

          {paused && (
            <div className="pb-1">
              <div className="flex gap-2">
                <HourSelect
                  label="From"
                  ariaLabel="Pause from"
                  value={startHour}
                  timeZone={zone}
                  disabled={disabled || pending}
                  onChange={(hour) => onChange({ all_readings_pause_start_hour: hour })}
                />
                <HourSelect
                  label="Until"
                  ariaLabel="Pause until"
                  value={endHour}
                  timeZone={zone}
                  disabled={disabled || pending}
                  onChange={(hour) => onChange({ all_readings_pause_end_hour: hour })}
                />
              </div>
              <p className="pt-2 text-sm" style={{ color: "#3f3830" }}>
                Pause these between {hourLabel(startHour)} and {hourLabel(endHour)}.
              </p>
              <p className="pt-1 text-xs" style={{ color: "#746959" }}>
                Times use {zone}.
              </p>
            </div>
          )}

          <p className="pt-1 text-xs" style={{ color: "#746959" }}>
            Your alerts above keep their own settings.
          </p>
        </div>
      )}
    </SectionCard>
  );
}