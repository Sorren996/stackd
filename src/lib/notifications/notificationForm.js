export const NOTIFICATION_ISOLATION_COPY = 'These thresholds only control notifications. They don’t change your comfort zone or calculations.';
export function notificationFormError(prefs, previous) {
  const low = prefs.custom_low_mgdl, high = prefs.custom_high_mgdl;
  if (low != null && (!Number.isInteger(low) || low < 60 || low > 150)) return 'Choose a notification low from 60–150 mg/dL.';
  if (high != null && (!Number.isInteger(high) || high < 100 || high > 400)) return 'Choose a notification high from 100–400 mg/dL.';
  if (low != null && high != null && high - low < 20) return 'Keep at least 20 mg/dL between your notification low and high.';
  for (const key of ['falling_fast', 'rising_fast']) {
    const level = prefs[`${key}_level_mgdl`], rate = prefs[`${key}_rate`];
    if (level != null && (!Number.isInteger(level) || level < 40 || level > 400)) return 'Choose a level from the offered options.';
    if (rate != null && ![2, 3].includes(rate)) return 'Choose a pace of 2 or 3 mg/dL per minute.';
  }
  if (prefs.custom_high_minutes != null && ![0, 15, 30, 60].includes(prefs.custom_high_minutes)) return 'Choose one of the first-alert delays.';
  if (Object.values(prefs.repeat_minutes || {}).some(n => n != null && ![15, 30, 60, 120].includes(n))) return 'Choose one of the repeat intervals.';
  if (!prefs.master_enabled) return null;
  for (const key of ['custom_low', 'custom_high']) if (prefs.categories?.[key] && prefs[`${key}_mgdl`] == null) return 'Choose a notification level first; this does not turn the alert on.';
  for (const key of ['falling_fast', 'rising_fast']) if (prefs.categories?.[key] && ![2, 3].includes(prefs[`${key}_rate`])) return 'Choose a minimum pace first.';
  if (prefs.categories?.above_range && ![15, 30, 60].includes(prefs.above_range_minutes) && (!previous?.master_enabled || previous?.categories?.above_range !== true)) return 'Choose how long above your comfort zone first.';
  if (prefs.categories?.missing_readings && ![15, 20, 30].includes(prefs.missing_delay_minutes)) return 'Choose a missing-readings delay first.';
  return null;
}
export const notificationValue = (value, units) => value == null ? 'not set' : units === 'mmol/L' ? (value / 18).toFixed(1) : String(value);