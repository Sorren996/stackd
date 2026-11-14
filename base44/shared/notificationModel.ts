// The owner's six-row notification model (owner decision, Nov 13 2026).
//
// One row per concern, so nothing is expressed twice:
//
//   1. Urgent low        fixed below 55, always on, never muted, through quiet hours
//   2. Low               one editable level, every distinct new reading below it
//   3. High              one editable level, the first reading at or above it,
//                        then quiet for that episode until it comes back down
//   4. Changing fast     one direction choice, one pace, optional level condition
//   5. Sensor problems   readings that stop arriving, 20 minute delay, 15 minute repeat
//   6. Every reading     the owner-only stream, off by default, with its pause window
//
// The per-category model that came before it (custom low, custom high, below
// comfort zone, above comfort zone, falling fast, rising fast) is not deleted:
// this module MAPS it. Every write produces the six-row values AND the legacy
// per-category mirrors, so the existing decision engine, saved episode state and
// older readers keep working unchanged, and no protection is silently lost.
//
// Nothing here is clinical advice: the levels are notification-only and never
// feed a calculation.

export const OWNER_MODEL_VERSION = 2;

/** The app's existing urgent-low boundary. Fixed: not editable, never muted. */
export const URGENT_LOW_MGDL = 55;

export const LOW_MIN_MGDL = 55;
export const LOW_MAX_MGDL = 100;
export const LOW_DEFAULT_MGDL = 70;

export const HIGH_MIN_MGDL = 140;
export const HIGH_MAX_MGDL = 400;
export const HIGH_DEFAULT_MGDL = 180;

export const FAST_RATES = [2, 3];
export const FAST_DIRECTIONS = ["rising", "falling", "both"];

/** 0 = immediately on the first qualifying reading; 15 = only after it lasts. */
export const HIGH_SUSTAINED_CHOICES = [0, 15];

export const MISSING_DELAY_CHOICES = [15, 20, 30];
export const MISSING_DEFAULT_DELAY_MINUTES = 20;
export const MISSING_DEFAULT_REPEAT_MINUTES = 15;

export const REPEAT_CHOICES = [15, 30, 60, 120];

/** The five switched rows, in the order the Notifications screen shows them. */
export const OWNER_ROW_KEYS = ["urgent_low", "low", "high", "changing_fast", "sensor_problems"];

/** Every field a stored preference row may hold, for create and update payloads. */
export const OWNER_PREFERENCE_FIELDS = [
  "model_version",
  "master_enabled",
  "categories",
  "low_mgdl",
  "high_mgdl",
  "high_sustained_minutes",
  "fast_direction",
  "fast_rate",
  "fast_level_mgdl",
  "custom_low_mgdl",
  "custom_high_mgdl",
  "custom_high_minutes",
  "above_range_minutes",
  "falling_fast_rate",
  "rising_fast_rate",
  "falling_fast_level_mgdl",
  "rising_fast_level_mgdl",
  "missing_delay_minutes",
  "repeat_minutes",
  "show_health_details",
  "quiet_hours_enabled",
  "quiet_start_hour",
  "quiet_end_hour",
  "quiet_timezone",
  "urgent_during_quiet",
  "all_readings_enabled",
  "all_readings_pause_enabled",
  "all_readings_pause_start_hour",
  "all_readings_pause_end_hour",
  "all_readings_pause_timezone",
];

export interface OwnerView {
  master_enabled: boolean;
  categories: Record<string, boolean>;
  low_mgdl: number;
  high_mgdl: number;
  high_sustained_minutes: number;
  fast_direction: string;
  fast_rate: number;
  fast_level_mgdl: number | null;
  missing_delay_minutes: number;
}

/**
 * What a NEW account starts with: everything that protects them is on, and the
 * every-reading stream (which is noise by nature) stays off.
 */
export const OWNER_DEFAULTS: OwnerView = {
  master_enabled: true,
  categories: {
    urgent_low: true,
    low: true,
    high: true,
    changing_fast: true,
    sensor_problems: true,
  },
  low_mgdl: LOW_DEFAULT_MGDL,
  high_mgdl: HIGH_DEFAULT_MGDL,
  high_sustained_minutes: 0,
  fast_direction: "both",
  fast_rate: 2,
  fast_level_mgdl: null,
  missing_delay_minutes: MISSING_DEFAULT_DELAY_MINUTES,
};

function finite(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampedInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = finite(value);
  if (number == null) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function isBlank(record: any): boolean {
  return !record || typeof record !== "object" || Object.keys(record).length === 0;
}

/**
 * The six rows an account held BEFORE this model, derived only from what it had
 * switched on. Used for the one-time migration, for any row that has not been
 * migrated yet, and for the follower-free owner path.
 *
 * The intent is preserved, never widened: a level is only taken from a rule the
 * account had on, the LOWEST enabled low is the one Low row that survives, and
 * the sustained-high delay is kept as the optional fifteen minutes.
 */
export function deriveOwnerFields(prefs: any, options: { targetLow?: unknown; targetHigh?: unknown } = {}) {
  const record = prefs || {};
  const legacy = record.categories || {};

  const lows: number[] = [];
  if (legacy.custom_low === true) {
    const custom = finite(record.custom_low_mgdl);
    if (custom != null) lows.push(custom);
  }
  if (legacy.low_glucose === true) lows.push(LOW_DEFAULT_MGDL);
  const targetLow = finite(options.targetLow);
  if (legacy.below_range === true && targetLow != null) lows.push(targetLow);

  const highs: number[] = [];
  if (legacy.custom_high === true) {
    const custom = finite(record.custom_high_mgdl);
    if (custom != null) highs.push(custom);
  }
  const targetHigh = finite(options.targetHigh);
  if (legacy.above_range === true && targetHigh != null) highs.push(targetHigh);

  // Any low rule that was on (urgent included) means this account wanted low
  // alerts; the same for high. Nothing that was on is dropped.
  const lowOn = lows.length > 0 || legacy.urgent_low === true;
  const highOn = highs.length > 0;

  const low = lows.length ? clampedInt(Math.min(...lows), LOW_MIN_MGDL, LOW_MAX_MGDL, LOW_DEFAULT_MGDL) : LOW_DEFAULT_MGDL;
  const high = highs.length ? clampedInt(Math.min(...highs), HIGH_MIN_MGDL, HIGH_MAX_MGDL, HIGH_DEFAULT_MGDL) : HIGH_DEFAULT_MGDL;

  const legacyDelay = Math.max(finite(record.custom_high_minutes) ?? 0, finite(record.above_range_minutes) ?? 0);
  const sustained = highOn ? (legacyDelay > 0 ? 15 : 0) : 0;

  const falling = legacy.falling_fast === true && FAST_RATES.includes(Number(record.falling_fast_rate));
  const rising = legacy.rising_fast === true && FAST_RATES.includes(Number(record.rising_fast_rate));
  const rates: number[] = [];
  if (falling) rates.push(Number(record.falling_fast_rate));
  if (rising) rates.push(Number(record.rising_fast_rate));
  const levelFalling = falling ? finite(record.falling_fast_level_mgdl) : null;
  const levelRising = rising ? finite(record.rising_fast_level_mgdl) : null;
  // A direction-specific level cannot describe both directions, so it is only
  // kept when it means the same thing for every direction being watched.
  const level = falling && rising
    ? levelFalling != null && levelFalling === levelRising ? levelFalling : null
    : levelFalling ?? levelRising;

  const delay = finite(record.missing_delay_minutes);

  return {
    categories: {
      urgent_low: true,
      low: lowOn,
      high: highOn,
      changing_fast: falling || rising,
      sensor_problems: legacy.missing_readings === true,
    },
    low_mgdl: low,
    high_mgdl: high,
    high_sustained_minutes: sustained,
    fast_direction: falling && rising ? "both" : rising ? "rising" : "falling",
    // The lower pace is the more sensitive one, so two different saved paces
    // resolve to more alerts, never fewer.
    fast_rate: rates.length ? Math.min(...rates) : OWNER_DEFAULTS.fast_rate,
    fast_level_mgdl: level,
    missing_delay_minutes: delay != null && MISSING_DELAY_CHOICES.includes(delay) ? delay : MISSING_DEFAULT_DELAY_MINUTES,
  };
}

/**
 * The six rows as they should be read for one stored record.
 *
 * A record saved with this model is read as itself. A record from before it is
 * derived, so an account is never treated as "everything off" just because it
 * has not been migrated yet. A missing record means the new-account defaults:
 * absent never means off.
 */
export function ownerView(prefs: any, options: { targetLow?: unknown; targetHigh?: unknown } = {}): OwnerView {
  if (isBlank(prefs)) return { ...OWNER_DEFAULTS, categories: { ...OWNER_DEFAULTS.categories } };
  const record = prefs;
  const derived = deriveOwnerFields(record, options);
  if (Number(record.model_version) !== OWNER_MODEL_VERSION) {
    return { master_enabled: record.master_enabled === true, ...derived };
  }
  const categories = record.categories || {};
  return {
    master_enabled: record.master_enabled === true,
    categories: {
      // Urgent low cannot be muted.
      urgent_low: true,
      low: categories.low === true,
      high: categories.high === true,
      changing_fast: categories.changing_fast === true,
      sensor_problems: categories.sensor_problems === true,
    },
    low_mgdl: clampedInt(record.low_mgdl, LOW_MIN_MGDL, LOW_MAX_MGDL, derived.low_mgdl),
    high_mgdl: clampedInt(record.high_mgdl, HIGH_MIN_MGDL, HIGH_MAX_MGDL, derived.high_mgdl),
    high_sustained_minutes: HIGH_SUSTAINED_CHOICES.includes(Number(record.high_sustained_minutes)) ? Number(record.high_sustained_minutes) : 0,
    fast_direction: FAST_DIRECTIONS.includes(String(record.fast_direction)) ? String(record.fast_direction) : derived.fast_direction,
    fast_rate: FAST_RATES.includes(Number(record.fast_rate)) ? Number(record.fast_rate) : derived.fast_rate,
    fast_level_mgdl: finite(record.fast_level_mgdl) == null ? null : clampedInt(record.fast_level_mgdl, 40, 400, 0),
    missing_delay_minutes: MISSING_DELAY_CHOICES.includes(Number(record.missing_delay_minutes)) ? Number(record.missing_delay_minutes) : MISSING_DEFAULT_DELAY_MINUTES,
  };
}

/**
 * Write the six-row values together with the legacy per-category mirrors the
 * existing engine reads. ONE stored row, two vocabularies, never out of step.
 */
export function withLegacyMirrors(prefs: any, options: { targetLow?: unknown; targetHigh?: unknown } = {}) {
  const record = prefs && typeof prefs === "object" ? prefs : {};
  const view = ownerView(record, options);
  const categories: Record<string, boolean> = { ...(record.categories || {}) };

  const lowOn = view.categories.low === true;
  const fixedLow = lowOn && view.low_mgdl === LOW_DEFAULT_MGDL;

  categories.urgent_low = true;
  categories.low_glucose = fixedLow;
  categories.custom_low = lowOn && !fixedLow;
  categories.below_range = false;
  categories.custom_high = view.categories.high === true;
  categories.above_range = false;
  categories.missing_readings = view.categories.sensor_problems === true;

  const falling = view.categories.changing_fast === true && view.fast_direction !== "rising";
  const rising = view.categories.changing_fast === true && view.fast_direction !== "falling";
  categories.falling_fast = falling;
  categories.rising_fast = rising;

  categories.low = lowOn;
  categories.high = view.categories.high === true;
  categories.changing_fast = view.categories.changing_fast === true;
  categories.sensor_problems = view.categories.sensor_problems === true;

  const repeats: Record<string, number> = {};
  for (const [key, value] of Object.entries(record.repeat_minutes || {})) {
    if (REPEAT_CHOICES.includes(Number(value))) repeats[key] = Number(value);
  }
  // Sensor problems keeps the fifteen minute repeat while readings are missing.
  if (categories.missing_readings) repeats.missing_readings = MISSING_DEFAULT_REPEAT_MINUTES;
  else delete repeats.missing_readings;

  return {
    ...record,
    model_version: OWNER_MODEL_VERSION,
    master_enabled: view.master_enabled === true,
    categories,
    low_mgdl: view.low_mgdl,
    high_mgdl: view.high_mgdl,
    high_sustained_minutes: view.high_sustained_minutes,
    fast_direction: view.fast_direction,
    fast_rate: view.fast_rate,
    fast_level_mgdl: view.fast_level_mgdl,
    missing_delay_minutes: view.missing_delay_minutes,
    // Legacy mirrors, written from the six rows.
    custom_low_mgdl: categories.custom_low ? view.low_mgdl : null,
    custom_high_mgdl: categories.custom_high ? view.high_mgdl : null,
    custom_high_minutes: view.high_sustained_minutes,
    above_range_minutes: null,
    falling_fast_rate: falling ? view.fast_rate : null,
    rising_fast_rate: rising ? view.fast_rate : null,
    falling_fast_level_mgdl: falling ? view.fast_level_mgdl : null,
    rising_fast_level_mgdl: rising ? view.fast_level_mgdl : null,
    repeat_minutes: repeats,
    // Urgent low is allowed through quiet hours, so that is not a choice.
    urgent_during_quiet: true,
    all_readings_enabled: record.all_readings_enabled === true,
  };
}

/** Only the fields the entity holds, so a payload never carries read-only keys. */
export function ownerPreferencePayload(record: any) {
  const row = record && typeof record === "object" ? record : {};
  const payload: Record<string, any> = {};
  for (const field of OWNER_PREFERENCE_FIELDS) {
    if (field in row && row[field] !== undefined) payload[field] = row[field];
  }
  return payload;
}

/**
 * Seed a new account's preferences at account creation, so the defaults are
 * stored rather than inferred, and create the claim ledger the evaluator needs.
 * Idempotent: an existing row is left exactly as it is.
 */
export async function seedOwnerPreferences(sr: any, user: { id: string }) {
  if (!sr || !user?.id) return { created: false };
  const page: any = await sr.entities.NotificationPreference.filter({ user_id: user.id }, { sort: "-created_date", limit: 1 });
  const rows = Array.isArray(page) ? page : page?.items || [];
  if (rows.length) return { created: false };

  const record = withLegacyMirrors({
    user_id: user.id,
    master_enabled: true,
    categories: { ...OWNER_DEFAULTS.categories },
    low_mgdl: OWNER_DEFAULTS.low_mgdl,
    high_mgdl: OWNER_DEFAULTS.high_mgdl,
    high_sustained_minutes: OWNER_DEFAULTS.high_sustained_minutes,
    fast_direction: OWNER_DEFAULTS.fast_direction,
    fast_rate: OWNER_DEFAULTS.fast_rate,
    fast_level_mgdl: null,
    missing_delay_minutes: OWNER_DEFAULTS.missing_delay_minutes,
    show_health_details: false,
    quiet_hours_enabled: false,
    urgent_during_quiet: true,
    all_readings_enabled: false,
    all_readings_pause_enabled: false,
    model_version: OWNER_MODEL_VERSION,
  });

  const created = await sr.entities.NotificationPreference.create({
    user_id: user.id,
    ...ownerPreferencePayload(record),
  });

  // The ledger belongs to the opt-in itself, so the anchor a notification claims
  // on has one identity from the very first reading.
  try {
    const ledgers: any = await sr.entities.NotificationLedger.filter({ user_id: user.id, scope_key: "self" }, { limit: 1 });
    const held = Array.isArray(ledgers) ? ledgers : ledgers?.items || [];
    if (!held.length) await sr.entities.NotificationLedger.create({ user_id: user.id, scope_key: "self", claimed_keys: [] });
  } catch {
    // A ledger that cannot be made here is made by the evaluator instead.
  }

  return { created: true, id: created?.id || null };
}

/** The audit-safe description of what one account's row became: no health values. */
export function migrationSummary(before: any, after: any) {
  const was = before?.categories || {};
  return {
    model_version: OWNER_MODEL_VERSION,
    was: {
      master_enabled: before?.master_enabled === true,
      urgent_low: was.urgent_low === true,
      custom_low: was.custom_low === true ? finite(before?.custom_low_mgdl) : null,
      low_glucose: was.low_glucose === true,
      below_range: was.below_range === true,
      custom_high: was.custom_high === true ? finite(before?.custom_high_mgdl) : null,
      above_range: was.above_range === true,
      falling_fast: was.falling_fast === true,
      rising_fast: was.rising_fast === true,
      missing_readings: was.missing_readings === true,
    },
    now: {
      low: after?.categories?.low === true ? finite(after?.low_mgdl) : false,
      high: after?.categories?.high === true ? finite(after?.high_mgdl) : false,
      changing_fast: after?.categories?.changing_fast === true
        ? { direction: after?.fast_direction, rate: finite(after?.fast_rate) }
        : false,
      sensor_problems: after?.categories?.sensor_problems === true,
    },
  };
}