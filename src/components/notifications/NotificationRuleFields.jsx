import ChoiceRow from '@/components/notifications/ChoiceRow';
import NotificationLevelField from '@/components/notifications/NotificationLevelField';
import { ABOVE_DURATION_OPTIONS, MISSING_DELAY_OPTIONS } from '@/lib/notifications/notificationCopy';
export default function NotificationRuleFields({ rule, draft, units, disabled, onChange }) {
  const key = rule.key;
  const update = field => value => onChange({ [field]: value });
  const velocity = key.endsWith('_fast');
  return <div className="pb-3 pl-1">
    <p className="pb-2 text-xs leading-relaxed text-ink-muted">{rule.description}</p>
    {['custom_low', 'custom_high'].includes(key) && <NotificationLevelField label={key === 'custom_low' ? 'At or below' : 'At or above'} min={key === 'custom_low' ? 60 : 100} max={key === 'custom_low' ? 150 : 400} units={units} value={draft[`${key}_mgdl`]} disabled={disabled} onChange={update(`${key}_mgdl`)} />}
    {key === 'custom_high' && <ChoiceRow label="First-alert delay" options={[{ value: 0, label: 'No delay' }, ...ABOVE_DURATION_OPTIONS]} value={draft.custom_high_minutes ?? 0} disabled={disabled} onChange={update('custom_high_minutes')} />}
    {key === 'above_range' && <ChoiceRow label="Continuously above for" options={ABOVE_DURATION_OPTIONS} value={draft.above_range_minutes} disabled={disabled} onChange={update('above_range_minutes')} />}
    {key === 'missing_readings' && <ChoiceRow label="Readings quiet for" options={MISSING_DELAY_OPTIONS} value={draft.missing_delay_minutes} disabled={disabled} onChange={update('missing_delay_minutes')} />}
    {velocity && <>
      <ChoiceRow label="Minimum pace" options={[{ value: 2, label: units === 'mmol/L' ? '0.11+ mmol/L/min' : '2+ mg/dL/min' }, { value: 3, label: units === 'mmol/L' ? '0.17+ mmol/L/min' : '3+ mg/dL/min' }]} value={draft[`${key}_rate`]} disabled={disabled} onChange={update(`${key}_rate`)} />
      <NotificationLevelField label={key === 'rising_fast' ? 'Only at or above (optional)' : 'Only at or below (optional)'} units={units} value={draft[`${key}_level_mgdl`]} disabled={disabled} onChange={update(`${key}_level_mgdl`)} />
      <p className="py-2 text-xs leading-relaxed text-ink-muted">Stackd estimates pace from four real CGM readings over about 15 minutes, not from a trend arrow. Gaps or unclear movement mean no pace notification; this is not the Dexcom alert algorithm.</p>
    </>}
    <label className="flex items-center justify-between gap-3 py-2 text-xs text-ink-muted">Repeat within this episode
      <select aria-label={`${rule.label} repeat`} className="rounded-lg border border-border bg-paper p-2 text-ink" value={draft.repeat_minutes?.[key] ?? ''} disabled={disabled} onChange={e => onChange({ repeat_minutes: { ...draft.repeat_minutes, [key]: e.target.value ? Number(e.target.value) : null } })}>
        <option value="">Once only</option>{[15, 30, 60, 120].map(n => <option key={n} value={n}>{n} min</option>)}
      </select>
    </label>
  </div>;
}