import { runStartupCheck } from '@/lib/startupRequest';

function rowsForOwner(rows, userId, imported = false) {
  if (!Array.isArray(rows) || rows.some(row => !row || (row.created_by_id !== userId && !(imported && row.user_id === userId)))) {
    throw Object.assign(new Error('Invalid setup response'), { startupInvalid: true });
  }
  return rows;
}

// Retains the existing legacy-account eligibility rule, but never writes a
// completion flag during a read/check and never substitutes local settings.
export async function loadStartupSetup(client, userId, signal) {
  if (!userId) throw Object.assign(new Error('Session required'), { status: 401 });
  const read = (stage, operation) => runStartupCheck(`${stage}:${userId}`, stage, operation, signal);
  const settingsRows = await read('setup-settings', async () => rowsForOwner(
    await client.entities.UserSettings.filter({ created_by_id: userId }, '-created_date', 1), userId));
  const settings = settingsRows[0] || null;
  if (settings?.onboarding_completed === true) return { settings, needsOnboarding: false };
  // Sequential short-circuit avoids three parallel existence checks and avoids
  // discarding a positive result because an unnecessary sibling request failed.
  for (const entity of ['GlucoseReading', 'CarbEntry', 'InsulinDose']) {
    const query = entity === 'GlucoseReading'
      ? { $or: [{ created_by_id: userId }, { user_id: userId }] }
      : { created_by_id: userId };
    const rows = await read(`setup-${entity}`, async () => rowsForOwner(
      await client.entities[entity].filter(query, '-created_date', 1), userId, entity === 'GlucoseReading'));
    if (rows.length) return { settings, needsOnboarding: false };
  }
  return { settings, needsOnboarding: true };
}