import { useEffect, useRef, useState } from 'react';
import { createNotificationSaveQueue } from '@/lib/notifications/notificationSaveQueue';
import { describeNotificationError } from '@/lib/notifications/notificationApi';
export default function useNotificationDraft(preferences, onSave) {
  const save = useRef(onSave);
  save.current = onSave;
  const [state, setState] = useState({ draft: preferences || {}, error: null, pending: false, pendingKeys: [] });
  const queue = useRef(null);
  if (!queue.current) queue.current = createNotificationSaveQueue(preferences, async patch => {
    try { return await save.current(patch); }
    catch (failure) { throw new Error(describeNotificationError(failure)); }
  }, setState);
  useEffect(() => { queue.current.replace(preferences); }, [preferences]);
  return { ...state, apply: queue.current.apply };
}