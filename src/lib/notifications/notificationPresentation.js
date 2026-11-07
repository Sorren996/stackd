import { notificationValue } from './notificationForm.js';

export const ALERT_GROUPS = [
  { title: 'Glucose levels', keys: ['urgent_low', 'custom_low', 'below_range', 'custom_high', 'above_range'] },
  { title: 'Changing quickly', keys: ['falling_fast', 'rising_fast'] },
  { title: 'Connection', keys: ['missing_readings'] },
];
export function needsAlertSetup(key, prefs) {
  if (key === 'custom_low' || key === 'custom_high') return prefs[`${key}_mgdl`] == null;
  if (key.endsWith('_fast')) return ![2, 3].includes(prefs[`${key}_rate`]);
  if (key === 'above_range') return ![15, 30, 60].includes(prefs.above_range_minutes);
  if (key === 'missing_readings') return ![15, 20, 30].includes(prefs.missing_delay_minutes);
  return false;
}
export function alertSummary(key, prefs, thresholds = {}) {
  const units = thresholds.units || 'mg/dL';
  const level = value => `${notificationValue(value, units)} ${units}`;
  if (key === 'custom_low' || key === 'custom_high') return prefs[`${key}_mgdl`] == null ? 'Choose a level' : `At or ${key === 'custom_low' ? 'below' : 'above'} ${level(prefs[`${key}_mgdl`])}`;
  if (key === 'urgent_low') return `Below ${level(thresholds.urgent_low ?? 55)}`;
  if (key === 'below_range' || key === 'above_range') {
    const bound = thresholds[key === 'below_range' ? 'target_low' : 'target_high'];
    return bound == null ? 'Comfort zone not set' : `${key === 'below_range' ? 'Below' : 'Above'} ${level(bound)}`;
  }
  if (key.endsWith('_fast')) {
    const rate = prefs[`${key}_rate`];
    return rate == null ? 'Choose a pace' : `${key === 'falling_fast' ? 'Falling' : 'Rising'} by ${units === 'mmol/L' ? `about ${(rate / 18).toFixed(2)}` : rate} ${units} per minute or faster`;
  }
  return prefs.missing_delay_minutes == null ? 'Choose how long to wait' : `No new readings for ${prefs.missing_delay_minutes} minutes`;
}
export function alertTimingSummary(key, prefs, units = 'mg/dL') {
  const parts = [];
  const delay = key === 'custom_high' ? prefs.custom_high_minutes : key === 'above_range' ? prefs.above_range_minutes : null;
  if (delay > 0) parts.push(`After ${delay} minutes`);
  if (key === 'above_range' && delay == null) parts.push('Choose when to notify');
  const level = prefs[`${key}_level_mgdl`];
  if (key.endsWith('_fast') && level != null) parts.push(`Only at or ${key === 'falling_fast' ? 'below' : 'above'} ${notificationValue(level, units)} ${units}`);
  if (prefs.repeat_minutes?.[key]) parts.push(`Remind every ${prefs.repeat_minutes[key]} minutes`);
  return parts.join(' · ');
}
export function mergeNotificationPatch(prefs, patch) {
  return { ...prefs, ...patch, categories: { ...prefs.categories, ...patch.categories }, repeat_minutes: { ...prefs.repeat_minutes, ...patch.repeat_minutes } };
}
export function savedPatchMatches(saved, patch) {
  if (!saved) return false;
  return Object.entries(patch).every(([key, value]) => value && typeof value === 'object'
    ? Object.entries(value).every(([name, item]) => (saved[key]?.[name] ?? null) === (item ?? null))
    : (saved[key] ?? null) === (value ?? null));
}