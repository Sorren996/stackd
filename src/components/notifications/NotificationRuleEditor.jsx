import { useRef, useState } from 'react';
import LogSheetShell from '@/components/forms/LogSheetShell';
import NotificationRuleFields from '@/components/notifications/NotificationRuleFields';
import { notificationFormError } from '@/lib/notifications/notificationForm';
import { mergeNotificationPatch, needsAlertSetup } from '@/lib/notifications/notificationPresentation';
export default function NotificationRuleEditor({ rule, draft, thresholds, enableOnSave, disabled, onSave, onCancel }) {
  const [patch, setPatch] = useState({});
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const formId = `notification-editor-${rule.key}`;
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
  return <LogSheetShell compact open onClose={() => { if (!lock.current) onCancel(); }} title={rule.label} footer={<div className="flex justify-end"><button form={formId} type="submit" disabled={disabled || pending} className="min-h-11 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-brand-ink active:opacity-80 disabled:opacity-60">{pending ? 'Saving…' : enableOnSave ? 'Save & turn on' : 'Save'}</button></div>}>
    <form id={formId} onSubmit={submit} noValidate aria-label={`Edit ${rule.label.toLowerCase()}`} aria-busy={pending} className="space-y-4 pt-3">
      <NotificationRuleFields rule={rule} draft={local} thresholds={thresholds} units={thresholds?.units || 'mg/dL'} disabled={disabled || pending} onChange={change} />
      {error && <p role="alert" className="text-sm text-red-text">{error}</p>}
    </form>
  </LogSheetShell>;
}