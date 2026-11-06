import { useEffect, useState } from 'react';
import { notificationFormError } from '@/lib/notifications/notificationForm';
export default function useNotificationDraft(preferences, onSave) {
  const [draft, setDraft] = useState(preferences || {});
  const [error, setError] = useState(null);
  useEffect(() => { setDraft(preferences || {}); setError(null); }, [preferences]);
  const apply = patch => {
    const next = { ...draft, ...patch, categories: { ...draft.categories, ...(patch.categories || {}) } };
    const problem = notificationFormError(next, draft);
    setError(problem);
    if (problem) return;
    setDraft(next);
    onSave(next);
  };
  return { draft, error, apply };
}