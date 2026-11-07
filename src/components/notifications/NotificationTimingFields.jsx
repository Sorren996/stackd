import ChoiceRow from '@/components/notifications/ChoiceRow';
import { ABOVE_DURATION_OPTIONS } from '@/lib/notifications/notificationCopy';
export default function NotificationTimingFields({ rule, draft, disabled, onChange }) {
  const key = rule.key;
  const high = key === 'custom_high' || key === 'above_range';
  const delays = ABOVE_DURATION_OPTIONS.map(option => ({ ...option, label: `After ${option.value} minutes` }));
  return <details className="border-t border-border/50 pt-1">
    <summary className="flex min-h-11 cursor-pointer items-center text-sm text-ink">Timing &amp; reminders</summary>
    {high && <>
      <ChoiceRow label="Notify me" options={key === 'custom_high' ? [{ value: 0, label: 'Right away' }, ...delays] : delays} value={draft[key === 'custom_high' ? 'custom_high_minutes' : 'above_range_minutes'] ?? (key === 'custom_high' ? 0 : null)} disabled={disabled} onChange={value => onChange({ [key === 'custom_high' ? 'custom_high_minutes' : 'above_range_minutes']: value })} />
      <p className="pb-3 text-xs leading-relaxed text-ink-muted">{key === 'custom_high' ? 'With a wait selected, readings must stay at or above your chosen level for that time.' : 'Readings must stay above your comfort zone for the time you choose.'} Gaps restart the wait.</p>
    </>}
    <label className="block py-2 text-xs text-ink-muted">Remind me again
      <select className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-border bg-paper px-3 text-base text-ink" value={draft.repeat_minutes?.[key] ?? ''} disabled={disabled} onChange={event => onChange({ repeat_minutes: { [key]: event.target.value ? Number(event.target.value) : null } })}>
        <option value="">No repeats</option>{[15, 30, 60, 120].map(minutes => <option key={minutes} value={minutes}>Every {minutes} minutes</option>)}
      </select>
    </label>
    <p className="pb-3 text-xs leading-relaxed text-ink-muted">Reminders apply while this condition continues and the alert is still eligible. Delivery can be delayed.</p>
  </details>;
}