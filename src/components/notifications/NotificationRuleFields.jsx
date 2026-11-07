import ChoiceRow from '@/components/notifications/ChoiceRow';
import NotificationLevelField from '@/components/notifications/NotificationLevelField';
import NotificationTimingFields from '@/components/notifications/NotificationTimingFields';
import { MISSING_DELAY_OPTIONS } from '@/lib/notifications/notificationCopy';
import { alertSummary } from '@/lib/notifications/notificationPresentation';
export default function NotificationRuleFields({ rule, draft, units, thresholds, disabled, onChange }) {
  const key = rule.key;
  const update = field => value => onChange({ [field]: value });
  const velocity = key.endsWith('_fast');
  return <div className="space-y-3">
    {['custom_low', 'custom_high'].includes(key) && <NotificationLevelField label={key === 'custom_low' ? 'Let me know at or below' : 'Let me know at or above'} min={key === 'custom_low' ? 60 : 100} max={key === 'custom_low' ? 150 : 400} units={units} value={draft[`${key}_mgdl`]} disabled={disabled} onChange={update(`${key}_mgdl`)} />}
    {['urgent_low', 'below_range', 'above_range'].includes(key) && <p className="text-sm leading-relaxed text-ink">{alertSummary(key, draft, thresholds)}. {key === 'urgent_low' ? 'This alert level is fixed.' : 'This follows the existing comfort zone.'}</p>}
    {key === 'missing_readings' && <ChoiceRow label="Let me know when readings stop for" options={MISSING_DELAY_OPTIONS.map(option => ({ ...option, label: `${option.value} minutes` }))} value={draft.missing_delay_minutes} disabled={disabled} onChange={update('missing_delay_minutes')} />}
    {velocity && <>
      <ChoiceRow label={key === 'falling_fast' ? 'Falling per minute by' : 'Rising per minute by'} options={[2, 3].map(rate => ({ value: rate, label: units === 'mmol/L' ? `About ${(rate / 18).toFixed(2)} mmol/L or faster (${rate} mg/dL)` : `${rate} mg/dL or faster` }))} value={draft[`${key}_rate`]} disabled={disabled} onChange={update(`${key}_rate`)} />
      <details><summary className="flex min-h-11 cursor-pointer items-center text-xs text-ink-muted">Limit to a glucose level (optional)</summary>
        <NotificationLevelField label={key === 'rising_fast' ? 'Only at or above (optional)' : 'Only at or below (optional)'} units={units} value={draft[`${key}_level_mgdl`]} disabled={disabled} onChange={update(`${key}_level_mgdl`)} />
      </details>
    </>}
    {key === 'above_range' && draft.above_range_minutes == null && <p className="text-xs text-ink-muted">Choose when to notify you under Timing &amp; reminders.</p>}
    <NotificationTimingFields rule={rule} draft={draft} disabled={disabled} onChange={onChange} />
  </div>;
}