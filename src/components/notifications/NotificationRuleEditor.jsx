import { useRef, useState } from 'react';
import NotificationRuleFields from '@/components/notifications/NotificationRuleFields';
import { notificationFormError } from '@/lib/notifications/notificationForm';
import { mergeNotificationPatch, needsAlertSetup } from '@/lib/notifications/notificationPresentation';
export default function NotificationRuleEditor({ rule, draft, thresholds, enableOnSave, disabled, onSave, onCancel }) {
  const [patch, setPatch] = useState({});
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const local = mergeNotificationPatch(draft, patch);
  const change = update => { setPatch(current => mergeNotificationPatch(current, update)); setError(null); };
  const submit = async event => {
    event.preventDefault();
    if (lock.current || disabled) return;
    if (Array.from(event.currentTarget.elements).some(field => field.validity?.badInput || field.validity?.stepMismatch)) return setError('Enter a valid number using the step shown by your units.');
    const changes = enableOnSave ? mergeNotificationPatch(patch, { categories: { [rule.key]: true } }) : patch;
    const next = mergeNotificationPatch(draft, changes);
    const problem = ((enableOnSave || next.categories?.[rule.key]) && needsAlertSetup(rule.key, next) ? 'Choose the level, pace or timing for this alert before saving.' : null) || notificationFormError(next, draft);
    if (problem) return setError(problem);
    lock.current = true; setPending(true); setError(null);
    const result = await onSave(changes);
    lock.current = false; setPending(false);
    if (result?.ok) onCancel(); else setError(result?.error || 'We could not confirm your changes. Please try again.');
  };
  return <form onSubmit={submit} noValidate aria-label={`Edit ${rule.label.toLowerCase()}`} aria-busy={pending} className="rounded-2xl bg-paper-sunk p-3 sm:p-4">
    {enableOnSave && <p className="pb-3 text-xs leading-relaxed text-ink-muted">Choose your settings, then save to turn this alert on. Cancel leaves it off.</p>}
    <NotificationRuleFields rule={rule} draft={local} thresholds={thresholds} units={thresholds?.units || 'mg/dL'} disabled={disabled || pending} onChange={change} />
    {error && <p role="alert" className="mt-3 text-sm text-red-text">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="submit" disabled={disabled || pending} className="min-h-11 flex-1 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-paper disabled:opacity-50">{pending ? 'Saving…' : enableOnSave ? 'Save & turn on' : 'Save changes'}</button>
      <button type="button" disabled={pending} onClick={onCancel} className="min-h-11 rounded-xl px-4 py-3 text-sm text-ink underline disabled:opacity-50">Cancel</button>
    </div>
  </form>;
}