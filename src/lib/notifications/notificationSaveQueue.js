import { mergeNotificationPatch, savedPatchMatches } from './notificationPresentation.js';
import { notificationFormError } from './notificationForm.js';
export const settingKeys = patch => Object.entries(patch).flatMap(([key, value]) => value && typeof value === 'object' ? Object.keys(value).map(name => `${key}.${name}`) : [key]);
// One account/relationship queue. Network writes are serialized patches, while
// feedback is immediate. Responses cannot overwrite a later queued intention.
export function createNotificationSaveQueue(initial, save, emit) {
  let confirmed = initial || {}, running = false, error = null;
  const requests = [];
  const snapshot = () => ({ draft: requests.reduce((value, item) => mergeNotificationPatch(value, item.patch), confirmed), pending: requests.length > 0, pendingKeys: [...new Set(requests.flatMap(item => settingKeys(item.patch)))], error });
  const notify = () => emit(snapshot());
  async function drain() {
    if (running) return;
    running = true;
    while (requests.length) {
      const item = requests[0];
      let result;
      try {
        const saved = await save(item.patch);
        if (!saved) throw new Error('Unconfirmed save');
        confirmed = saved;
        if (!savedPatchMatches(saved, item.patch)) throw new Error('Sharing permissions changed. Review this choice and try again.');
        result = { ok: true };
      } catch (failure) {
        error = failure.message || 'We could not save that choice. Please try again.';
        result = { ok: false, error };
      }
      requests.shift(); notify(); item.resolve(result);
    }
    running = false;
  }
  return {
    snapshot,
    replace(value) { if (!requests.length) { confirmed = value || {}; notify(); } },
    apply(patch) {
      const problem = notificationFormError(mergeNotificationPatch(snapshot().draft, patch), snapshot().draft);
      if (problem) { error = problem; notify(); return Promise.resolve({ ok: false, error }); }
      error = null;
      return new Promise(resolve => { requests.push({ patch, resolve }); notify(); void drain(); });
    },
  };
}