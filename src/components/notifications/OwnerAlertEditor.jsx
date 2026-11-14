import { useRef, useState } from 'react';
import LogSheetShell from '@/components/forms/LogSheetShell';
import ChoiceRow from '@/components/notifications/ChoiceRow';
import ToggleRow from '@/components/notifications/ToggleRow';
import NotificationLevelField from '@/components/notifications/NotificationLevelField';
import { focusRing, mutedStyle, primaryStyle } from '@/lib/notifications/notificationFieldTheme';
import { mergeNotificationPatch } from '@/lib/notifications/notificationPresentation';
import {
  HIGH_MAX_MGDL,
  HIGH_MIN_MGDL,
  LOW_MAX_MGDL,
  LOW_MIN_MGDL,
  MISSING_DELAY_CHOICES,
  MISSING_REPEAT_MINUTES,
  ownerFormError,
  ownerValues,
} from '@/lib/notifications/notificationModel';

/**
 * The detail behind one row. Saving never switches the row on or off: only the
 * switch does that, so entering a level can never opt someone in.
 */
export default function OwnerAlertEditor({ row, draft, units, disabled, onSave, onCancel }) {
  const [patch, setPatch] = useState({});
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const formId = `owner-alert-${row.key}`;
  const local = mergeNotificationPatch(draft, patch);
  const values = ownerValues(local);

  const change = update => {
    setPatch(current => mergeNotificationPatch(current, update));
    setError(null);
  };

  const submit = async event => {
    event.preventDefault();
    if (lock.current || disabled) return;
    const problem = ownerFormError(local, draft);
    if (problem) {
      setError(problem);
      return;
    }
    lock.current = true;
    setPending(true);
    const result = await onSave(patch);
    lock.current = false;
    setPending(false);
    if (result?.ok) onCancel();
    else setError(result?.error || 'We could not confirm your changes. Please try again.');
  };

  return (
    <LogSheetShell
      compact
      open
      onClose={() => { if (!lock.current) onCancel(); }}
      title={row.label}
      footer={
        <div className="flex justify-end">
          <button form={formId} type="submit" disabled={disabled || pending} className={`min-h-11 rounded-full px-6 py-3 text-sm font-semibold active:opacity-80 disabled:opacity-60 ${focusRing}`} style={primaryStyle}>
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} noValidate aria-label={`Edit ${row.label.toLowerCase()}`} aria-busy={pending} className="space-y-4 pt-3">
        {row.key === 'low' && (
          <>
            <NotificationLevelField
              label="Let me know below"
              min={LOW_MIN_MGDL}
              max={LOW_MAX_MGDL}
              units={units}
              value={local.low_mgdl}
              disabled={disabled || pending}
              onChange={level => change({ low_mgdl: level })}
            />
            <p className="text-xs leading-relaxed" style={mutedStyle}>
              Every new reading below this level notifies you, with no wait and no reminder interval.
            </p>
          </>
        )}

        {row.key === 'high' && (
          <>
            <NotificationLevelField
              label="Let me know at or above"
              min={HIGH_MIN_MGDL}
              max={HIGH_MAX_MGDL}
              units={units}
              value={local.high_mgdl}
              disabled={disabled || pending}
              onChange={level => change({ high_mgdl: level })}
            />
            <ToggleRow
              label="Only after 15 minutes"
              description="Off means the first reading at or above your level notifies you straight away."
              checked={values.high_sustained_minutes === 15}
              disabled={disabled || pending}
              onChange={on => change({ high_sustained_minutes: on ? 15 : 0 })}
            />
            <p className="text-xs leading-relaxed" style={mutedStyle}>
              One notice per excursion. It speaks again once you have come back down and gone high again.
            </p>
          </>
        )}

        {row.key === 'changing_fast' && (
          <>
            <ChoiceRow
              label="Direction"
              options={[{ value: 'rising', label: 'Rising' }, { value: 'falling', label: 'Falling' }, { value: 'both', label: 'Both' }]}
              value={values.fast_direction}
              disabled={disabled || pending}
              onChange={direction => change({ fast_direction: direction })}
            />
            <ChoiceRow
              label="Pace"
              options={[2, 3].map(rate => ({
                value: rate,
                label: units === 'mmol/L' ? `About ${(rate / 18).toFixed(2)} mmol/L or faster (${rate} mg/dL)` : `${rate} mg/dL or faster`,
              }))}
              value={values.fast_rate}
              disabled={disabled || pending}
              onChange={rate => change({ fast_rate: rate })}
            />
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-xs text-ink-muted">Limit to a glucose level (optional)</summary>
              <NotificationLevelField
                label={values.fast_direction === 'falling' ? 'Only at or below (optional)' : 'Only at or above (optional)'}
                units={units}
                value={values.fast_level_mgdl}
                disabled={disabled || pending}
                onChange={level => change({ fast_level_mgdl: level })}
              />
            </details>
          </>
        )}

        {row.key === 'sensor_problems' && (
          <>
            <ChoiceRow
              label="Let me know when readings stop for"
              options={MISSING_DELAY_CHOICES.map(minutes => ({ value: minutes, label: `${minutes} minutes` }))}
              value={values.missing_delay_minutes}
              disabled={disabled || pending}
              onChange={minutes => change({ missing_delay_minutes: minutes })}
            />
            <p className="text-xs leading-relaxed" style={mutedStyle}>
              While readings are still missing it reminds you every {MISSING_REPEAT_MINUTES} minutes, and stops as soon as readings are arriving again.
            </p>
          </>
        )}

        {error && <p role="alert" className="text-sm text-red-text">{error}</p>}
      </form>
    </LogSheetShell>
  );
}