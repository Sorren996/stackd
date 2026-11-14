// The six rows the Notifications screen shows, in order, for the account that
// tracks for themselves. One row per concern, so nothing appears twice:
//
//   1. Urgent low        fixed below 55, always on, through quiet hours
//   2. Low               one level; every new reading below it
//   3. High              one level; the first reading at or above it
//   4. Changing fast     one direction choice, one pace, optional level
//   5. Sensor problems   readings that stop arriving
//   6. Every reading     the stream, off by default (its own card)
//
// Values are read from the saved row, with the same defaults the server stores
// for a new account, so the screen can never show a setting as "off" merely
// because it has not been saved yet.

export const URGENT_LOW_MGDL = 55;
export const LOW_MIN_MGDL = 55;
export const LOW_MAX_MGDL = 100;
export const HIGH_MIN_MGDL = 140;
export const HIGH_MAX_MGDL = 400;
export const FAST_RATES = [2, 3];
export const FAST_DIRECTIONS = ['rising', 'falling', 'both'];
export const HIGH_SUSTAINED_CHOICES = [0, 15];
export const MISSING_DELAY_CHOICES = [15, 20, 30];
export const MISSING_REPEAT_MINUTES = 15;

export const OWNER_ROWS = [
  {
    key: 'urgent_low',
    label: 'Urgent low',
    fixed: true,
  },
  {
    key: 'low',
    label: 'Low',
    editor: 'low',
  },
  {
    key: 'high',
    label: 'High',
    editor: 'high',
  },
  {
    key: 'changing_fast',
    label: 'Changing fast',
    editor: 'changing_fast',
  },
  {
    key: 'sensor_problems',
    label: 'Sensor problems',
    editor: 'sensor_problems',
  },
];

/** A level in the person's display units. */
export function levelLabel(value, units = 'mg/dL') {
  if (value == null) return 'not set';
  return units === 'mmol/L' ? (value / 18).toFixed(1) : String(value);
}

/** The saved row as the six rows read it, with the new-account defaults. */
export function ownerValues(prefs) {
  const record = prefs || {};
  const categories = record.categories || {};
  return {
    urgent_low: URGENT_LOW_MGDL,
    low_mgdl: record.low_mgdl ?? record.custom_low_mgdl ?? 70,
    high_mgdl: record.high_mgdl ?? record.custom_high_mgdl ?? 180,
    high_sustained_minutes: record.high_sustained_minutes ?? record.custom_high_minutes ?? 0,
    fast_direction: record.fast_direction ?? 'both',
    fast_rate: record.fast_rate ?? record.falling_fast_rate ?? record.rising_fast_rate ?? 2,
    fast_level_mgdl: record.fast_level_mgdl ?? null,
    missing_delay_minutes: record.missing_delay_minutes ?? 20,
    on: {
      urgent_low: true,
      low: categories.low === true,
      high: categories.high === true,
      changing_fast: categories.changing_fast === true,
      sensor_problems: categories.sensor_problems === true,
    },
  };
}

const paceLabel = (rate, units) =>
  units === 'mmol/L' ? `about ${(rate / 18).toFixed(2)} mmol/L` : `${rate} mg/dL`;

const directionLabel = direction =>
  direction === 'rising' ? 'rising' : direction === 'falling' ? 'falling' : 'rising or falling';

/** One plain sentence per row, saying exactly what that row does. */
export function rowSentence(key, prefs, units = 'mg/dL') {
  const values = ownerValues(prefs);
  if (key === 'urgent_low') return `Below ${levelLabel(URGENT_LOW_MGDL, units)} ${units}, every time. Always on, and it still comes through quiet hours.`;
  if (key === 'low') return `Every new reading below ${levelLabel(values.low_mgdl, units)} ${units}.`;
  if (key === 'high') {
    const base = `The first reading at or above ${levelLabel(values.high_mgdl, units)} ${units}`;
    return values.high_sustained_minutes === 15 ? `${base}, once it has stayed there for 15 minutes.` : `${base}, until you come back down.`;
  }
  if (key === 'changing_fast') {
    const level = values.fast_level_mgdl == null ? '' : `, only at or ${values.fast_direction === 'falling' ? 'below' : 'above'} ${levelLabel(values.fast_level_mgdl, units)} ${units}`;
    return `${directionLabel(values.fast_direction).replace(/^./, c => c.toUpperCase())} by ${paceLabel(values.fast_rate, units)} a minute or faster${level}.`;
  }
  return `No new readings for ${values.missing_delay_minutes} minutes, then a reminder every ${MISSING_REPEAT_MINUTES} minutes.`;
}

/**
 * What stops a save. Nothing here opts a row in: the switch is the only thing
 * that turns an alert on.
 */
export function ownerFormError(next, previous) {
  if (!next) return null;
  const low = next.low_mgdl;
  if (low != null && (!Number.isInteger(low) || low < LOW_MIN_MGDL || low > LOW_MAX_MGDL)) {
    return `Choose a low level from ${LOW_MIN_MGDL} to ${LOW_MAX_MGDL} mg/dL.`;
  }
  const high = next.high_mgdl;
  if (high != null && (!Number.isInteger(high) || high < HIGH_MIN_MGDL || high > HIGH_MAX_MGDL)) {
    return `Choose a high level from ${HIGH_MIN_MGDL} to ${HIGH_MAX_MGDL} mg/dL.`;
  }
  if (next.high_sustained_minutes != null && !HIGH_SUSTAINED_CHOICES.includes(next.high_sustained_minutes)) {
    return 'Choose whether a high has to last 15 minutes first.';
  }
  if (next.fast_rate != null && !FAST_RATES.includes(next.fast_rate)) {
    return 'Choose a pace of 2 or 3 mg/dL per minute.';
  }
  if (next.fast_direction != null && !FAST_DIRECTIONS.includes(next.fast_direction)) {
    return 'Choose rising, falling, or both.';
  }
  if (next.fast_level_mgdl != null && (!Number.isInteger(next.fast_level_mgdl) || next.fast_level_mgdl < 40 || next.fast_level_mgdl > 400)) {
    return 'Choose a level from 40 to 400 mg/dL, or leave it blank.';
  }
  if (next.missing_delay_minutes != null && !MISSING_DELAY_CHOICES.includes(next.missing_delay_minutes)) {
    return 'Choose how long to wait before a sensor-problems reminder.';
  }
  return null;
}