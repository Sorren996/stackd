import { ChevronDown } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import NotificationRuleFields from '@/components/notifications/NotificationRuleFields';
import { CATEGORY_COPY } from '@/lib/notifications/notificationCopy';
import { notificationValue } from '@/lib/notifications/notificationForm';
export default function NotificationRuleList({ draft, thresholds, grants, disabled, onChange }) {
  const units = thresholds?.units || 'mg/dL';
  const summary = key => {
    if (key === 'custom_low' || key === 'custom_high') return `${key === 'custom_low' ? '≤' : '≥'} ${notificationValue(draft[`${key}_mgdl`], units)} ${units}`;
    if (key === 'below_range') return `< ${notificationValue(thresholds?.target_low, units)} ${units}`;
    if (key === 'above_range') return `> ${notificationValue(thresholds?.target_high, units)} ${units}`;
    if (key === 'urgent_low') return `< ${notificationValue(55, units)} ${units}`;
    if (key.endsWith('_fast')) return draft[`${key}_rate`] ? `${units === 'mmol/L' ? (draft[`${key}_rate`] / 18).toFixed(2) : draft[`${key}_rate`]}+ ${units}/min` : 'Pace not set';
    return draft.missing_delay_minutes ? `${draft.missing_delay_minutes} min` : 'Delay not set';
  };
  const rules = CATEGORY_COPY.filter(rule => !grants || grants[rule.key] === true);
  return <div className="divide-y divide-border">
    {!rules.length && <p className="py-3 text-xs text-ink-muted">No notification categories are shared with you right now.</p>}
    {rules.map(rule => <details key={rule.key} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3 text-ink [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{rule.label}</span><span className="text-xs text-ink-muted">{summary(rule.key)} · {draft.categories?.[rule.key] ? 'On' : 'Off'}</span></span>
        <ChevronDown className="h-4 w-4 shrink-0 group-open:rotate-180" />
      </summary>
      <label className="flex min-h-11 items-center justify-between gap-3 pb-2 text-xs text-ink">Receive {rule.label.toLowerCase()}
        <Switch aria-label={`Receive ${rule.label.toLowerCase()}`} checked={draft.categories?.[rule.key] === true} disabled={disabled || draft.master_enabled !== true} onCheckedChange={checked => onChange({ categories: { [rule.key]: checked } })} />
      </label>
      <NotificationRuleFields rule={rule} draft={draft} units={units} disabled={disabled} onChange={onChange} />
    </details>)}
    <p className="py-3 text-xs leading-relaxed text-ink-muted">One push covers simultaneous conditions, with the most serious first. Level episodes re-arm only after two fresh readings, spaced 3–7 minutes apart, at least 5 mg/dL back beyond the boundary; pace episodes use a 0.5 mg/dL/min recovery margin. Gaps never count as recovery. Repeats are off unless you choose an interval.</p>
  </div>;
}