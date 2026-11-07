import { useId } from 'react';
import { Switch } from '@/components/ui/switch';
import { alertSummary, alertTimingSummary } from '@/lib/notifications/notificationPresentation';
export default function NotificationRuleRow({ rule, draft, thresholds, disabled, editing, onToggle, onEdit, children }) {
  const id = useId();
  const timing = alertTimingSummary(rule.key, draft, thresholds?.units);
  return <div className="border-t border-border/50 py-4 first:border-t-0 first:pt-1">
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h3 id={id} className={`text-sm text-ink ${rule.key === 'urgent_low' ? 'font-semibold' : 'font-medium'}`}>{rule.label}</h3>
        <p id={`${id}-summary`} className="mt-1 text-xs leading-relaxed text-ink-muted">{alertSummary(rule.key, draft, thresholds)}</p>
        {timing && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{timing}</p>}
      </div>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center">
        <Switch aria-labelledby={id} aria-describedby={`${id}-summary`} checked={draft.categories?.[rule.key] === true} disabled={disabled || editing || draft.master_enabled !== true} onCheckedChange={onToggle} className="relative after:absolute after:-inset-y-3 after:-inset-x-1" />
      </div>
    </div>
    <button type="button" className="min-h-11 min-w-11 text-left text-xs font-semibold text-brand underline underline-offset-4 disabled:opacity-50" aria-label={`Edit ${rule.label.toLowerCase()}`} aria-expanded={Boolean(children)} aria-controls={`${id}-editor`} disabled={disabled || editing} onClick={onEdit}>Edit</button>
    {children && <div id={`${id}-editor`}>{children}</div>}
  </div>;
}