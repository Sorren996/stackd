import { useEffect, useRef, useState } from 'react';
import { notificationFormError } from '@/lib/notifications/notificationForm';
import { mergeNotificationPatch, savedPatchMatches } from '@/lib/notifications/notificationPresentation';
import { describeNotificationError } from '@/lib/notifications/notificationApi';
export default function useNotificationDraft(preferences, onSave) {
  const [draft, setDraft] = useState(preferences || {});
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  useEffect(() => { setDraft(preferences || {}); }, [preferences]);
  const apply = async patch => {
    if (lock.current) return { ok: false, error: 'Please wait for your changes to finish saving.' };
    const next = mergeNotificationPatch(draft, patch);
    const problem = notificationFormError(next, draft);
    setError(problem);
    if (problem) return { ok: false, error: problem };
    lock.current = true; setPending(true);
    try {
      const saved = await onSave(next);
      setDraft(saved);
      if (!savedPatchMatches(saved, patch)) {
        const message = 'Your saved settings differ from this change. Sharing permissions may have changed; review the settings and try again.';
        setError(message);
        return { ok: false, error: message };
      }
      return { ok: true };
    } catch (failure) {
      const message = failure?.reason === 'confirmation_failed' ? 'Your change may have saved, but we could not confirm it. Please try again.' : describeNotificationError(failure);
      setError(message);
      return { ok: false, error: message };
    } finally { lock.current = false; setPending(false); }
  };
  return { draft, error, pending, apply };
}