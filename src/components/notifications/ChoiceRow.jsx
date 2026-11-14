import { focusRing, primaryStyle, secondaryStyle } from '@/lib/notifications/notificationFieldTheme';

/**
 * A short row of choices (durations, delays). Always shows the exact minutes so
 * a timing is chosen with its real value in view, never inferred.
 *
 * The chosen option is rust with cream text; the others are cream fields with a
 * hairline edge and ink text. Both are fixed colours, so nothing here turns dark
 * against the cream card in dark mode.
 */
export default function ChoiceRow({ label, options, value, onChange, disabled = false }) {
  return <fieldset disabled={disabled} className="min-w-0 pb-3 pt-1">
    <legend className="pb-2 text-sm" style={{ color: '#2E2420' }}>{label}</legend>
    <div className="flex flex-wrap gap-2">
      {options.map(option => {
        // Compared as text so a worded choice (rising / falling / both) and a
        // numeric one (15 / 20 / 30 minutes) both highlight their own option.
        const selected = value != null && value !== '' && String(value) === String(option.value);
        return <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          aria-pressed={selected}
          className={`min-h-11 max-w-full rounded-full border px-4 py-2 text-left text-sm disabled:opacity-50 ${focusRing}`}
          style={selected ? primaryStyle : secondaryStyle}
        >{option.label}</button>;
      })}
    </div>
  </fieldset>;
}