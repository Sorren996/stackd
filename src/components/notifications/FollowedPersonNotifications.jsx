import { useEffect, useState } from "react";
import ToggleRow from "./ToggleRow";
import ChoiceRow from "./ChoiceRow";
import QuietHoursFields from "./QuietHoursFields";
import {
  CATEGORY_COPY,
  MISSING_DELAY_OPTIONS,
  PREVIEW_PRIVACY_HINT,
} from "@/lib/notifications/notificationCopy";

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * One person the viewer follows.
 *
 * Only the categories that person actually permits appear as switches. Anything
 * they have not shared is shown as unavailable and cannot be turned on here —
 * the server clamps it as well, so this is convenience, not the guard.
 */
export default function FollowedPersonNotifications({ person, saving, onSave }) {
  const [draft, setDraft] = useState(person.preferences);
  const [hint, setHint] = useState(null);

  useEffect(() => {
    setDraft(person.preferences);
  }, [person.preferences]);

  const apply = (patch) => {
    const next = {
      ...draft,
      ...patch,
      categories: { ...draft.categories, ...(patch.categories || {}) },
    };
    setDraft(next);
    onSave(next);
  };

  const masterOn = draft.master_enabled === true;

  const toggleCategory = (key, value) => {
    if (value && key === "missing_readings" && !draft.missing_delay_minutes) {
      setHint(key);
      return;
    }
    setHint(null);
    apply({ categories: { [key]: value } });
  };

  return (
    <div>
      <ToggleRow
        label={`Notifications about ${person.name}`}
        description={
          person.status === "paused"
            ? "Sharing is paused right now, so nothing will be sent."
            : "Push about the readings they share with you."
        }
        checked={masterOn}
        disabled={saving || person.status !== "active"}
        onChange={(next) => apply({ master_enabled: next })}
      />

      <div className="border-t pt-1" style={{ borderColor: "#eadccf" }}>
        {CATEGORY_COPY.map((category) => {
          const permitted = person.grants?.[category.key] === true;
          const on = draft.categories?.[category.key] === true;
          return (
            <div key={category.key} className="py-1">
              <ToggleRow
                label={category.label}
                description={permitted ? category.description : "Not shared with you for notifications."}
                checked={on}
                disabled={saving || !masterOn || !permitted}
                note={hint === category.key ? "Choose a delay below first." : null}
                onChange={(next) => toggleCategory(category.key, next)}
              />
              {category.key === "missing_readings" && permitted && (on || hint === category.key) && (
                <ChoiceRow
                  label="How long readings must be quiet before it notifies"
                  options={MISSING_DELAY_OPTIONS}
                  value={draft.missing_delay_minutes}
                  disabled={saving}
                  onChange={(minutes) => {
                    setHint(null);
                    apply({ missing_delay_minutes: minutes });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-1 border-t pt-1" style={{ borderColor: "#eadccf" }}>
        <ToggleRow
          label="Show health details in previews"
          description={PREVIEW_PRIVACY_HINT}
          checked={draft.show_health_details === true}
          disabled={saving}
          onChange={(next) => apply({ show_health_details: next })}
        />
        <QuietHoursFields
          enabled={draft.quiet_hours_enabled === true}
          startHour={draft.quiet_start_hour}
          endHour={draft.quiet_end_hour}
          timeZone={draft.quiet_timezone || deviceTimeZone()}
          urgentDuringQuiet={draft.urgent_during_quiet === true}
          disabled={saving}
          onChange={apply}
        />
      </div>
    </div>
  );
}