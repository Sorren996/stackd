// Notification-only configuration. Never reads or writes UserSettings.
export const NEW_CATEGORIES = ['custom_low', 'custom_high', 'falling_fast', 'rising_fast'];
export const OPTION_DEFAULTS = {
  custom_low_mgdl: null, custom_high_mgdl: null, custom_high_minutes: 0, above_range_minutes: null,
  falling_fast_rate: null, rising_fast_rate: null,
  falling_fast_level_mgdl: null, rising_fast_level_mgdl: null,
  repeat_minutes: {},
};
// Caller-supplied activation markers are ignored. Only an explicit new opt-in
// (including master re-enable) starts a new activation, on the next fresh sample.
export function categoryActivation(existing, value, newId = () => crypto.randomUUID()) {
  const activation = { ...(existing?.category_activation || {}) };
  for (const key of ['urgent_low', 'low', 'high', 'changing_fast', 'sensor_problems', 'custom_low', 'custom_high', 'below_range', 'above_range', 'falling_fast', 'rising_fast', 'low_glucose', 'missing_readings']) {
    if (value.master_enabled && value.categories?.[key] === true && (existing?.master_enabled !== true || existing?.categories?.[key] !== true)) activation[key] = `${new Date().toISOString()}|${newId()}`;
  }
  return activation;
}
export function sanitizeNotificationOptions(input = {}, existing = {}, categories = {}, master = false) {
  const value = { ...OPTION_DEFAULTS };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { value, error: 'invalid_notification_preferences' };
  for (const key of Object.keys(OPTION_DEFAULTS)) {
    value[key] = key in input ? input[key] : existing[key] ?? OPTION_DEFAULTS[key];
  }
  for (const [key, min, max] of [
    // The Low row allows 55–100, so its mirror must accept that whole range.
    ['custom_low_mgdl', 55, 150], ['custom_high_mgdl', 100, 400],
    ['falling_fast_level_mgdl', 40, 400], ['rising_fast_level_mgdl', 40, 400],
  ]) {
    const v = value[key];
    if (v != null && (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max)) return { value, error: `invalid_${key}` };
  }
  if (value.custom_low_mgdl != null && value.custom_high_mgdl != null && value.custom_high_mgdl - value.custom_low_mgdl < 20) return { value, error: 'notification_threshold_separation' };
  if (value.above_range_minutes != null && ![15, 30, 60].includes(value.above_range_minutes)) return { value, error: 'invalid_above_range_minutes' };
  if (![0, 15, 30, 60].includes(value.custom_high_minutes)) return { value, error: 'invalid_custom_high_minutes' };
  for (const direction of ['falling', 'rising']) {
    const rate = value[`${direction}_fast_rate`];
    if (rate != null && ![2, 3].includes(rate)) return { value, error: 'invalid_velocity_rate' };
    if (master && categories[`${direction}_fast`] && rate == null) return { value, error: 'velocity_rate_required' };
  }
  for (const key of ['custom_low', 'custom_high']) {
    if (master && categories[key] && value[`${key}_mgdl`] == null) return { value, error: 'notification_threshold_required' };
  }
  if (!value.repeat_minutes || typeof value.repeat_minutes !== 'object' || Array.isArray(value.repeat_minutes)) return { value, error: 'invalid_repeat_minutes' };
  const repeats = {};
  for (const key of ['custom_low', 'custom_high', 'below_range', 'above_range', 'falling_fast', 'rising_fast', 'urgent_low', 'low_glucose', 'missing_readings']) {
    const n = value.repeat_minutes[key] ?? null;
    if (n != null && ![15, 30, 60, 120].includes(n)) return { value, error: 'invalid_repeat_minutes' };
    if (n != null) repeats[key] = n;
  }
  value.repeat_minutes = repeats;
  return { value, error: null };
}