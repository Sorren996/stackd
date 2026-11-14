import { memo, useId } from 'react';
import { ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { switchThumbClass, switchTrackClass } from '@/lib/notifications/notificationFieldTheme';
import { alertSummary, alertTimingSummary } from '@/lib/notifications/notificationPresentation';
function NotificationRuleRow({ rule, draft, thresholds, disabled, pending, onToggle, onEdit }) {
  const id = useId();
  const fixed = ['low_glucose', 'urgent_low'].includes(rule.key);
  const timing = alertTimingSummary(rule.key, draft, thresholds?.units);
  const summary = alertSummary(rule.key, draft, thresholds);
  return <div className="flex items-center gap-3 py-3">
    <div className="min-w-0 flex-1">
      <h3 id={id} className={`text-sm leading-snug text-ink ${rule.key === 'urgent_low' ? 'font-semibold' : 'font-medium'}`}>{rule.label}</h3>
      {fixed ? <p id={`${id}-summary`} className="mt-1 text-xs leading-relaxed text-ink-muted">{summary}</p> :
        <button type="button" onClick={onEdit} aria-label={`Edit ${rule.label.toLowerCase()}`} aria-haspopup="dialog" disabled={disabled || pending} className="flex min-h-11 w-full items-center gap-1.5 text-left text-xs leading-relaxed text-ink-muted active:opacity-60 disabled:opacity-60">
          <span id={`${id}-summary`} className="min-w-0">{summary}{timing && <span className="block">{timing}</span>}</span><ChevronRight className="h-3.5 w-3.5 shrink-0 text-brand" />
        </button>}
      {pending && <span role="status" className="text-xs text-ink-muted">Saving…</span>}
    </div>
    <div className="flex h-11 w-11 shrink-0 items-center justify-center">
      <Switch aria-labelledby={id} aria-describedby={`${id}-summary`} aria-busy={pending} checked={draft.categories?.[rule.key] === true} disabled={disabled || pending || draft.master_enabled !== true} onCheckedChange={onToggle} thumbClassName={switchThumbClass} className={switchTrackClass} />
    </div>
  </div>;
}
export default memo(NotificationRuleRow, (a, b) => a.rule.key === b.rule.key && a.disabled === b.disabled && a.pending === b.pending && a.draft.master_enabled === b.draft.master_enabled && a.draft.categories?.[a.rule.key] === b.draft.categories?.[b.rule.key] && alertSummary(a.rule.key, a.draft, a.thresholds) === alertSummary(b.rule.key, b.draft, b.thresholds) && alertTimingSummary(a.rule.key, a.draft, a.thresholds?.units) === alertTimingSummary(b.rule.key, b.draft, b.thresholds?.units));