import { memo, useId } from 'react';
import { ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { switchThumbClass, switchTrackClass } from '@/lib/notifications/notificationFieldTheme';

/**
 * One of the six alert rows: a name, one plain sentence saying what it does,
 * and the switch that turns it on. The level, pace or delay sits behind the row
 * (tap the sentence), the way the app's own sensor settings do.
 */
function OwnerAlertRow({ row, sentence, checked, fixed, disabled, pending, onToggle, onEdit }) {
  const id = useId();
  return <div className="flex items-center gap-3 py-3">
    <div className="min-w-0 flex-1">
      <h3 id={id} className={`text-sm leading-snug text-ink ${fixed ? 'font-semibold' : 'font-medium'}`}>{row.label}</h3>
      {fixed
        ? <p id={`${id}-summary`} className="mt-1 text-xs leading-relaxed text-ink-muted">{sentence}</p>
        : <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${row.label.toLowerCase()}`}
            aria-haspopup="dialog"
            disabled={disabled || pending}
            className="flex min-h-11 w-full items-center gap-1.5 text-left text-xs leading-relaxed text-ink-muted active:opacity-60 disabled:opacity-60"
          >
            <span id={`${id}-summary`} className="min-w-0">{sentence}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-brand" />
          </button>}
      {pending && <span role="status" className="text-xs text-ink-muted">Saving…</span>}
    </div>
    <div className="flex h-11 w-11 shrink-0 items-center justify-center">
      <Switch
        aria-labelledby={id}
        aria-describedby={`${id}-summary`}
        aria-busy={pending}
        checked={checked}
        disabled={disabled || pending || fixed}
        onCheckedChange={onToggle}
        thumbClassName={switchThumbClass}
        className={switchTrackClass}
      />
    </div>
  </div>;
}

export default memo(OwnerAlertRow);