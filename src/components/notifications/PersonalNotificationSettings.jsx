import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SectionCard from "@/components/editorial/SectionCard";
import ToggleRow from "./ToggleRow";
import ChoiceRow from "./ChoiceRow";
import QuietHoursFields from "./QuietHoursFields";
import {
  ABOVE_DURATION_OPTIONS,
  CATEGORY_COPY,
  MISSING_DELAY_OPTIONS,
  PERMISSION_NOTE,
  PREVIEW_PRIVACY_HINT,
} from "@/lib/notifications/notificationCopy";

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function rangeSentence(thresholds) {
  const low = thresholds?.target_low;
  const high = thresholds?.target_high;
  const units = thresholds?.units || "mg/dL";
  const urgent = thresholds?.urgent_low;
  if (low == null || high == null) {
    return `Your comfort zone is not set yet. Urgent low is below ${urgent} ${units}.`;
  }
  return `Comfort zone ${low}–${high} ${units} · urgent low below ${urgent} ${units}`;
}

/**
 * The person's own notifications.
 *
 * Every switch starts off and only the person can turn it on. Thresholds are
 * shown read-only and link to the range settings that own them — this screen
 * never redefines a clinical number.
 */
export default function PersonalNotificationSettings({ personal, thresholds, saving, onSave }) {
  const [draft, setDraft] = useState(personal);
  const [hint, setHint] = useState(null);

  useEffect(() => {
    setDraft(personal);
  }, [personal]);

  const apply = (patch) => {
    const next = {
      ...draft,
      ...patch,
      categories: { ...draft.categories, ...(patch.categories || {}) },
    };
    setDraft(next);
    onSave(next);
  };

  const toggleCategory = (key, value) => {
    if (value && key === "above_range" && !draft.above_range_minutes) {
      setHint("above_range");
      return;
    }
    if (value && key === "missing_readings" && !draft.missing_delay_minutes) {
      setHint("missing_readings");
      return;
    }
    setHint(null);
    apply({ categories: { [key]: value } });
  };

  const masterOn = draft.master_enabled === true;

  return (
    <SectionCard label="For me">
      <ToggleRow
        label="Notifications about me"
        description="Your own readings, on this device."
        checked={masterOn}
        disabled={saving}
        onChange={(next) => apply({ master_enabled: next })}
      />

      <div className="mt-1 border-t pt-1" style={{ borderColor: "#eadccf" }}>
        {CATEGORY_COPY.map((category) => {
          const on = draft.categories?.[category.key] === true;
          return (
            <div key={category.key} className="py-1">
              <ToggleRow
                label={category.label}
                description={category.description}
                checked={on}
                disabled={saving || !masterOn}
                note={hint === category.key ? "Choose a timing below first." : null}
                onChange={(next) => toggleCategory(category.key, next)}
              />

              {category.key === "above_range" && (on || hint === "above_range") && (
                <ChoiceRow
                  label="How long above your range before it notifies"
                  options={ABOVE_DURATION_OPTIONS}
                  value={draft.above_range_minutes}
                  disabled={saving}
                  onChange={(minutes) => {
                    setHint(null);
                    apply({ above_range_minutes: minutes });
                  }}
                />
              )}

              {category.key === "missing_readings" && (on || hint === "missing_readings") && (
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

      <div className="mt-2 border-t pt-2" style={{ borderColor: "#eadccf" }}>
        <ToggleRow
          label="Show health details in previews"
          description={PREVIEW_PRIVACY_HINT}
          checked={draft.show_health_details === true}
          disabled={saving}
          onChange={(next) => apply({ show_health_details: next })}
        />
      </div>

      <div className="mt-2 rounded-xl px-3 py-2.5" style={{ background: "#f4ece1" }}>
        <p className="text-xs leading-relaxed" style={{ color: "#3f3830" }}>
          {rangeSentence(thresholds)}
        </p>
        <Link
          to="/settings/insulin"
          className="mt-1 inline-block text-xs font-semibold underline"
          style={{ color: "#9c5228" }}
        >
          Change your range settings
        </Link>
      </div>

      <div className="mt-2 border-t pt-1" style={{ borderColor: "#eadccf" }}>
        <QuietHoursFields
          enabled={draft.quiet_hours_enabled === true}
          startHour={draft.quiet_start_hour}
          endHour={draft.quiet_end_hour}
          timeZone={draft.quiet_timezone || deviceTimeZone()}
          urgentDuringQuiet={draft.urgent_during_quiet === true}
          disabled={saving}
          onChange={apply}
        />
        <p className="pt-1 text-xs" style={{ color: "#746959" }}>
          {PERMISSION_NOTE}
        </p>
      </div>
    </SectionCard>
  );
}