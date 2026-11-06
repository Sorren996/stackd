// The whole of the Stackd notification decision, as plain functions.
//
// Nothing here touches the network, the database or the push service, so every
// rule can be exercised by mocked tests: which reading is eligible, whether an
// episode has already spoken, what a preview may say, and whether quiet hours
// hold it back.
//
// Two invariants govern this file.
//
// 1. It never invents a clinical threshold. Urgent low is the app's existing
//    urgent threshold (strictly below 55 mg/dL) and the range comes from the
//    person's own target range settings. Nothing here advises on care.
// 2. An episode is derived only from real readings: synthetic carry-forward,
//    duplicate, future-dated and stale samples are dropped before anything is
//    decided, and a sustained condition is never inferred across a gap.

// ── Categories and timings ────────────────────────────────────────────────

export const CATEGORY_KEYS = [
  "urgent_low",
  "below_range",
  "above_range",
  "missing_readings",
] as const;

export type Category = (typeof CATEGORY_KEYS)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  urgent_low: "Urgent low",
  below_range: "Below comfort zone",
  above_range: "Above comfort zone",
  missing_readings: "Readings haven't updated",
};

/** The app's existing urgent-low threshold, mirrored (never re-derived). */
export const URGENT_LOW_MGDL = 55;

/**
 * How old a reading may be and still start a notification.
 *
 * The app holds two freshness gates: the live display treats a reading as
 * current for 8 minutes, while the follower email path allows 15. This system
 * takes the STRICTER of the two (8), deliberately, because a notification is
 * read later than a screen and must never present an old value as current.
 * Sharing's 15-minute gate is left exactly as it is — health classification in
 * the app is unchanged; this constant governs notification eligibility only.
 */
export const NOTIFICATION_FRESHNESS_MINUTES = 8;

/** A run of readings is contiguous only while consecutive samples stay this close. */
export const MAX_READING_GAP_MINUTES = 20;

/** How far back an episode may be traced. */
export const EPISODE_LOOKBACK_MINUTES = 360;

/** Readings this far in the future are treated as bad data, not as news. */
export const FUTURE_TOLERANCE_MINUTES = 2;

/** The duration choices offered for a sustained high. Explicitly chosen, never defaulted. */
export const ABOVE_RANGE_DURATION_CHOICES = [15, 30, 60] as const;

/** Delay choices for a missing-readings notice. All exceed the 5 minute sync. */
export const MISSING_DELAY_CHOICES = [15, 20, 30] as const;

/** A missing-reading delay below this could fire during the normal sync gap. */
export const MINIMUM_MISSING_DELAY_MINUTES = 15;

/**
 * A broken stream is only news while it is still recent. Past this, the notice
 * is not sent at all rather than replaying a condition nobody acted on.
 */
export const MISSING_NOTICE_MAX_AGE_MINUTES = 180;

export const SYNC_GRACE_MINUTES = 5;

export const MGDL_PER_MMOL = 18.0182;

export const PUSH_CHANNEL = "push";

// ── Samples ───────────────────────────────────────────────────────────────

export interface ReadingRow {
  id?: string;
  value?: unknown;
  recorded_at?: unknown;
  source?: unknown;
  user_id?: string;
}

export interface Sample {
  id: string;
  value: number;
  /** Epoch milliseconds of the measurement itself. */
  at: number;
  source: string;
}

/**
 * Keep only genuine observations, in order.
 *
 * Drops synthetic carry-forward ("system"), unusable values, future-dated rows,
 * and any second row for a measurement time already seen (a duplicate).
 */
export function normalizeSamples(rows: ReadingRow[] | null | undefined, nowMs: number): Sample[] {
  const toleranceMs = FUTURE_TOLERANCE_MINUTES * 60_000;
  const seen = new Set<number>();
  const out: Sample[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const value = Number(row?.value);
    const at = Date.parse(String(row?.recorded_at ?? ""));
    if (!Number.isFinite(value) || !Number.isFinite(at)) continue;
    const source = String(row?.source ?? "manual").toLowerCase();
    if (source === "system") continue;
    if (at > nowMs + toleranceMs) continue;
    if (seen.has(at)) continue;
    seen.add(at);
    out.push({ id: String(row?.id ?? `${at}`), value, at, source });
  }
  return out.sort((a, b) => a.at - b.at);
}

export type SampleClass = "urgent" | "below" | "above" | "inRange" | "unknown";

/** Urgent low is strictly below the urgent threshold; the range is inclusive. */
export function classifySample(value: unknown, targetLow: unknown, targetHigh: unknown): SampleClass {
  const v = Number(value);
  const low = Number(targetLow);
  const high = Number(targetHigh);
  if (!Number.isFinite(v)) return "unknown";
  if (v < URGENT_LOW_MGDL) return "urgent";
  if (Number.isFinite(low) && v < low) return "below";
  if (Number.isFinite(high) && v > high) return "above";
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "unknown";
  return "inRange";
}

export function isFreshSample(sample: Sample | null | undefined, nowMs: number): boolean {
  if (!sample) return false;
  const ageMinutes = (nowMs - sample.at) / 60_000;
  return ageMinutes >= 0 && ageMinutes <= NOTIFICATION_FRESHNESS_MINUTES;
}

// ── Episodes ──────────────────────────────────────────────────────────────

export interface Episode {
  /** Stable identity: the earliest reading of the run. */
  key: string;
  samples: Sample[];
  spanMinutes: number;
  hasUrgent: boolean;
  reachedAbove: boolean;
}

function familyOf(sample: Sample, targetLow: unknown, targetHigh: unknown): "low" | "high" | "clear" {
  const cls = classifySample(sample.value, targetLow, targetHigh);
  if (cls === "urgent" || cls === "below") return "low";
  if (cls === "above") return "high";
  return "clear";
}

/**
 * Trace the current run of one condition, newest first.
 *
 * A run survives a single clearing reading: it is only re-armed once TWO
 * consecutive real readings have cleared the condition, so one noisy sample
 * cannot make the same episode speak twice. A gap longer than
 * MAX_READING_GAP_MINUTES, or a reading of the opposite condition, ends it —
 * so a sustained condition is never assembled across missing intervals.
 */
export function buildEpisode(
  samples: Sample[],
  kind: "low" | "high",
  targetLow: unknown,
  targetHigh: unknown,
  nowMs: number
): Episode | null {
  const ordered = Array.isArray(samples) ? samples : [];
  if (!ordered.length) return null;

  const lookbackMs = EPISODE_LOOKBACK_MINUTES * 60_000;
  const gapMs = MAX_READING_GAP_MINUTES * 60_000;
  const run: Sample[] = [];
  let clears = 0;
  // The sample considered on the previous step (always the newer neighbour), so
  // a gap is measured against the reading immediately after it in time —
  // including one that merely cleared the condition.
  let newerNeighbour: Sample | null = null;

  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const sample = ordered[i];
    if (sample.at > nowMs + FUTURE_TOLERANCE_MINUTES * 60_000) continue;
    if (sample.at < nowMs - lookbackMs) break;
    if (newerNeighbour && newerNeighbour.at - sample.at > gapMs) break;
    newerNeighbour = sample;
    const family = familyOf(sample, targetLow, targetHigh);
    if (family === kind) {
      run.unshift(sample);
      clears = 0;
      continue;
    }
    if (family === "clear") {
      clears += 1;
      if (clears >= 2) break;
      continue;
    }
    break;
  }

  if (run.length === 0) return null;

  const first = run[0];
  const last = run[run.length - 1];
  return {
    key: `${kind}:${first.id}`,
    samples: run,
    spanMinutes: Math.max(0, (last.at - first.at) / 60_000),
    hasUrgent: run.some((s) => classifySample(s.value, targetLow, targetHigh) === "urgent"),
    reachedAbove: run.some((s) => classifySample(s.value, targetLow, targetHigh) === "above"),
  };
}

export interface ReadingDecision {
  category: Category;
  episodeKey: string;
  /** The measurement this decision rests on. */
  sample: Sample;
  /** Only meaningful for a sustained high. */
  durationMinutes: number | null;
}

export interface ReadingDecisionInput {
  rows: ReadingRow[] | null | undefined;
  nowMs: number;
  targetLow: number;
  targetHigh: number;
  /** Explicitly chosen sustained-high duration, or null when the person has not chosen one. */
  aboveMinutes?: number | null;
}

/**
 * What, if anything, the newest reading justifies.
 *
 * Urgent takes precedence over below for the same sample. A low episode that
 * has already reached urgent never reports "below" on the way back down, so
 * there is one escalation and no lower-severity message on de-escalation.
 */
export function decideReadingNotification(input: ReadingDecisionInput): ReadingDecision | null {
  const samples = normalizeSamples(input.rows, input.nowMs);
  if (!samples.length) return null;

  const latest = samples[samples.length - 1];
  if (!isFreshSample(latest, input.nowMs)) return null;

  const cls = classifySample(latest.value, input.targetLow, input.targetHigh);

  if (cls === "urgent") {
    const episode = buildEpisode(samples, "low", input.targetLow, input.targetHigh, input.nowMs);
    if (!episode) return null;
    return { category: "urgent_low", episodeKey: episode.key, sample: latest, durationMinutes: null };
  }

  if (cls === "below") {
    const episode = buildEpisode(samples, "low", input.targetLow, input.targetHigh, input.nowMs);
    if (!episode) return null;
    // Already escalated inside this episode: no lower-severity notice.
    if (episode.hasUrgent) return null;
    return { category: "below_range", episodeKey: episode.key, sample: latest, durationMinutes: null };
  }

  if (cls === "above") {
    const duration = Number(input.aboveMinutes);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    const episode = buildEpisode(samples, "high", input.targetLow, input.targetHigh, input.nowMs);
    if (!episode) return null;
    // Sustained means: at least two real samples, contiguous, spanning the chosen time.
    if (episode.samples.length < 2) return null;
    if (episode.spanMinutes + 1e-9 < duration) return null;
    return { category: "above_range", episodeKey: episode.key, sample: latest, durationMinutes: duration };
  }

  return null;
}

export interface MissingDecision {
  category: "missing_readings";
  episodeKey: string;
  /** The last real reading, whose receipt time the notice reports. */
  lastSample: Sample;
  quietMinutes: number;
}

export interface MissingDecisionInput {
  rows: ReadingRow[] | null | undefined;
  nowMs: number;
  delayMinutes?: number | null;
  /** The person's own glucose source connection, or null when none is established. */
  connection: { status?: string } | null | undefined;
}

/**
 * A missing-readings notice needs an established connection and a real prior
 * reading: a manual-only or brand-new account is never told its readings have
 * stopped, because nothing was ever streaming.
 */
export function decideMissingNotification(input: MissingDecisionInput): MissingDecision | null {
  const delay = Number(input.delayMinutes);
  if (!Number.isFinite(delay) || delay < MINIMUM_MISSING_DELAY_MINUTES) return null;
  if (delay <= SYNC_GRACE_MINUTES) return null;

  const status = String(input.connection?.status ?? "").toLowerCase();
  if (status !== "connected") return null;

  const samples = normalizeSamples(input.rows, input.nowMs);
  if (!samples.length) return null;

  const last = samples[samples.length - 1];
  const quietMinutes = (input.nowMs - last.at) / 60_000;
  if (!Number.isFinite(quietMinutes) || quietMinutes < delay) return null;
  if (quietMinutes > MISSING_NOTICE_MAX_AGE_MINUTES) return null;

  // One notice per gap: the key is the reading that stopped the stream.
  return {
    category: "missing_readings",
    episodeKey: `missing:${last.id}`,
    lastSample: last,
    quietMinutes,
  };
}

// ── Privacy and previews ──────────────────────────────────────────────────

export const GENERIC_TITLE = "Stackd update";
export const GENERIC_BODY = "Open Stackd for details.";

export function formatGlucoseValue(value: unknown, units: unknown): string {
  const v = Number(value);
  if (!Number.isFinite(v)) return "-";
  return String(units).toLowerCase() === "mmol/l" ? (v / MGDL_PER_MMOL).toFixed(1) : String(Math.round(v));
}

export function unitLabel(units: unknown): string {
  return String(units).toLowerCase() === "mmol/l" ? "mmol/L" : "mg/dL";
}

/** 24-hour-safe clock in the recipient's own zone; never a relative claim. */
export function formatClock(value: string | number | null | undefined, timeZone: string | null | undefined): string | null {
  if (value == null) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(date);
  }
}

export interface CopyInput {
  category: Category;
  /** Only used when details are allowed. */
  value?: number | null;
  units?: string | null;
  readingAt?: number | null;
  timeZone?: string | null;
  /** True only when the recipient opted into health details in previews. */
  showDetails: boolean;
  /** The person being followed, for a follower's detailed preview. */
  personName?: string | null;
  durationMinutes?: number | null;
}

export interface PushCopy {
  title: string;
  body: string;
}

/**
 * The whole of what a preview may say.
 *
 * Generic unless the recipient explicitly asked for details, and even then only
 * facts: the category, the measured value with its unit, and when it was
 * measured. Nothing judges, guesses, advises or promises freshness.
 */
export function buildNotificationCopy(input: CopyInput): PushCopy {
  if (!input.showDetails) return { title: GENERIC_TITLE, body: GENERIC_BODY };

  const units = unitLabel(input.units);
  const clock = formatClock(input.readingAt ?? null, input.timeZone);
  const who = typeof input.personName === "string" && input.personName.trim() ? input.personName.trim() : null;
  const prefix = who ? `${who}: ` : "";
  const value = formatGlucoseValue(input.value, input.units);

  switch (input.category) {
    case "urgent_low":
      return {
        title: who ? `${who}: urgent low` : "Urgent low",
        body: `${prefix}${value} ${units}${clock ? ` at ${clock}` : ""}.`,
      };
    case "below_range":
      return {
        title: who ? `${who}: below comfort zone` : "Below comfort zone",
        body: `${prefix}${value} ${units}${clock ? ` at ${clock}` : ""}.`,
      };
    case "above_range": {
      const held = Number(input.durationMinutes);
      const sustained = Number.isFinite(held) && held > 0 ? `, sustained for ${Math.round(held)} minutes` : "";
      return {
        title: who ? `${who}: above comfort zone` : "Above comfort zone",
        body: `${prefix}${value} ${units}${clock ? ` at ${clock}` : ""}${sustained}.`,
      };
    }
    case "missing_readings":
    default:
      return {
        title: who ? `${who}: readings haven't updated` : "Your readings haven’t updated",
        body: who
          ? `${prefix}last reading received at ${clock || "the last update"}.`
          : `Your last reading was received at ${clock || "the last update"}.`,
      };
  }
}

// ── Quiet hours ───────────────────────────────────────────────────────────

export interface QuietHours {
  enabled?: boolean;
  startHour?: number | null;
  endHour?: number | null;
  timeZone?: string | null;
  urgentDuringQuiet?: boolean;
}

/** The wall-clock hour in a real IANA zone, so DST shifts resolve themselves. */
export function zonedHour(nowMs: number, timeZone: string | null | undefined): number | null {
  const date = new Date(nowMs);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      hour: "numeric",
      hour12: false,
    }).format(date);
    const hour = Number(part.replace(/[^0-9]/g, ""));
    return Number.isFinite(hour) ? hour % 24 : null;
  } catch {
    return null;
  }
}

export function isValidTimeZone(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isWithinQuietWindow(hour: number | null, startHour: unknown, endHour: unknown): boolean {
  const start = Number(startHour);
  const end = Number(endHour);
  if (hour == null || !Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/**
 * Whether quiet hours hold this notification back. Urgent low is only allowed
 * inside the window when the recipient turned that on separately.
 */
export function isHeldByQuietHours(
  category: Category,
  quiet: QuietHours | null | undefined,
  nowMs: number
): boolean {
  if (!quiet?.enabled) return false;
  const hour = zonedHour(nowMs, quiet.timeZone);
  if (hour == null) return false;
  if (!isWithinQuietWindow(hour, quiet.startHour, quiet.endHour)) return false;
  if (category === "urgent_low" && quiet.urgentDuringQuiet === true) return false;
  return true;
}

// ── Keys, destinations and authorization predicates ───────────────────────

export function notificationEventKey(
  category: string,
  ownerUserId: string,
  recipientUserId: string,
  episodeKey: string
): string {
  return [category, ownerUserId, recipientUserId, episodeKey, PUSH_CHANNEL].map((p) => String(p ?? "")).join("|");
}

/** Personal notifications open the home screen; follower ones the shared view. */
export function destinationFor(audience: "self" | "follower"): string {
  return audience === "follower" ? "/shared" : "/";
}

export interface RelationshipLike {
  status?: string;
  follower_user_id?: string;
  scopes?: Record<string, boolean> | null;
  invitation_expires_at?: string | null;
  push?: Record<string, boolean> | null;
}

/** Only an active, accepted, glucose-scoped relationship can carry a notification. */
export function relationshipAllowsPush(row: RelationshipLike | null | undefined, nowMs: number): boolean {
  if (!row) return false;
  if (String(row.status) !== "active") return false;
  if (!row.follower_user_id) return false;
  if (row.scopes?.glucose !== true) return false;
  if (row.invitation_expires_at) {
    const expires = Date.parse(String(row.invitation_expires_at));
    if (Number.isFinite(expires) && expires < nowMs) return false;
  }
  return true;
}

/** The sharer's own per-category permission. Absent means off. */
export function sharerGrants(row: RelationshipLike | null | undefined): Record<Category, boolean> {
  const raw = (row?.push || {}) as Record<string, unknown>;
  return {
    urgent_low: raw.urgent_low === true,
    below_range: raw.below_range === true,
    above_range: raw.above_range === true,
    missing_readings: raw.missing_readings === true,
  };
}

/**
 * What a follower may actually receive: the sharer's grant, narrowed by the
 * follower's own opt-in. A follower can never widen this.
 */
export function effectiveFollowerCategories(
  row: RelationshipLike | null | undefined,
  followerCategories: Record<string, unknown> | null | undefined
): Record<Category, boolean> {
  const granted = sharerGrants(row);
  const chosen = (followerCategories || {}) as Record<string, unknown>;
  return {
    urgent_low: granted.urgent_low && chosen.urgent_low === true,
    below_range: granted.below_range && chosen.below_range === true,
    above_range: granted.above_range && chosen.above_range === true,
    missing_readings: granted.missing_readings && chosen.missing_readings === true,
  };
}

/** Clamp a submitted follower category set to what the sharer permits. */
export function clampFollowerCategories(
  row: RelationshipLike | null | undefined,
  submitted: Record<string, unknown> | null | undefined
): Record<Category, boolean> {
  return effectiveFollowerCategories(row, submitted);
}

/** Which account may open a linked view right now. */
export function resolveTapAccess(
  audience: "self" | "follower",
  row: RelationshipLike | null | undefined,
  nowMs: number
): { allowed: boolean; destination: string | null } {
  if (audience === "follower") {
    if (!relationshipAllowsPush(row, nowMs)) return { allowed: false, destination: null };
    return { allowed: true, destination: destinationFor("follower") };
  }
  return { allowed: true, destination: destinationFor("self") };
}

// ── Settings validation ───────────────────────────────────────────────────

export interface PersonalPreferences {
  master_enabled: boolean;
  categories: Record<Category, boolean>;
  above_range_minutes: number | null;
  missing_delay_minutes: number | null;
  show_health_details: boolean;
  quiet_hours_enabled: boolean;
  quiet_start_hour: number | null;
  quiet_end_hour: number | null;
  quiet_timezone: string | null;
  urgent_during_quiet: boolean;
}

export const EMPTY_PERSONAL_PREFERENCES: PersonalPreferences = {
  master_enabled: false,
  categories: {
    urgent_low: false,
    below_range: false,
    above_range: false,
    missing_readings: false,
  },
  above_range_minutes: null,
  missing_delay_minutes: null,
  show_health_details: false,
  quiet_hours_enabled: false,
  quiet_start_hour: null,
  quiet_end_hour: null,
  quiet_timezone: null,
  urgent_during_quiet: false,
};

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readHour(value: unknown): number | null {
  const hour = Number(value);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  return Math.trunc(hour);
}

/** Only the durations actually offered may be stored — no free-form number. */
export function readDurationChoice(value: unknown, choices: readonly number[]): number | null {
  const n = Number(value);
  return choices.includes(n) ? n : null;
}

export interface SanitizeResult<T> {
  value: T;
  error: string | null;
}

/**
 * Build the stored personal preferences from a submitted patch, starting from
 * what is already saved. Enabling a category that needs a timing requires that
 * timing to have been chosen explicitly — it is never filled in silently.
 */
export function sanitizePersonalPreferences(
  submitted: Record<string, unknown> | null | undefined,
  existing: Partial<PersonalPreferences> | null | undefined
): SanitizeResult<PersonalPreferences> {
  const base: PersonalPreferences = {
    ...EMPTY_PERSONAL_PREFERENCES,
    ...(existing || {}),
    categories: { ...EMPTY_PERSONAL_PREFERENCES.categories, ...(existing?.categories || {}) },
  };
  const input = submitted || {};

  const categories: Record<Category, boolean> = { ...base.categories };
  if (input.categories && typeof input.categories === "object") {
    for (const key of CATEGORY_KEYS) {
      if (typeof (input.categories as Record<string, unknown>)[key] === "boolean") {
        categories[key] = (input.categories as Record<string, boolean>)[key];
      }
    }
  }

  const master = readBoolean(input.master_enabled, base.master_enabled);

  // A timing is only written when the person picks one of the offered values.
  let aboveMinutes = base.above_range_minutes ?? null;
  if ("above_range_minutes" in input) {
    aboveMinutes = readDurationChoice(input.above_range_minutes, ABOVE_RANGE_DURATION_CHOICES);
    if (input.above_range_minutes != null && aboveMinutes == null) {
      return { value: base, error: "invalid_above_range_minutes" };
    }
  }

  let missingMinutes = base.missing_delay_minutes ?? null;
  if ("missing_delay_minutes" in input) {
    missingMinutes = readDurationChoice(input.missing_delay_minutes, MISSING_DELAY_CHOICES);
    if (input.missing_delay_minutes != null && missingMinutes == null) {
      return { value: base, error: "invalid_missing_delay_minutes" };
    }
  }

  if (master && categories.above_range && aboveMinutes == null) {
    return { value: base, error: "above_range_minutes_required" };
  }
  if (master && categories.missing_readings && missingMinutes == null) {
    return { value: base, error: "missing_delay_minutes_required" };
  }

  let quietTimezone = base.quiet_timezone ?? null;
  if ("quiet_timezone" in input) {
    if (input.quiet_timezone == null || input.quiet_timezone === "") {
      quietTimezone = null;
    } else if (isValidTimeZone(input.quiet_timezone)) {
      quietTimezone = String(input.quiet_timezone);
    } else {
      return { value: base, error: "invalid_timezone" };
    }
  }

  const quietEnabled = readBoolean(input.quiet_hours_enabled, base.quiet_hours_enabled);
  const quietStart = "quiet_start_hour" in input ? readHour(input.quiet_start_hour) : base.quiet_start_hour ?? null;
  const quietEnd = "quiet_end_hour" in input ? readHour(input.quiet_end_hour) : base.quiet_end_hour ?? null;

  if (quietEnabled && (quietStart == null || quietEnd == null)) {
    return { value: base, error: "quiet_hours_required" };
  }
  if (quietEnabled && !quietTimezone) {
    return { value: base, error: "quiet_timezone_required" };
  }

  return {
    value: {
      master_enabled: master,
      categories,
      above_range_minutes: aboveMinutes,
      missing_delay_minutes: missingMinutes,
      show_health_details: readBoolean(input.show_health_details, base.show_health_details),
      quiet_hours_enabled: quietEnabled,
      quiet_start_hour: quietStart,
      quiet_end_hour: quietEnd,
      quiet_timezone: quietTimezone,
      urgent_during_quiet: readBoolean(input.urgent_during_quiet, base.urgent_during_quiet),
    },
    error: null,
  };
}

export interface FollowerPreferences {
  master_enabled: boolean;
  categories: Record<Category, boolean>;
  /** The follower's own explicit delay choice for a missing-readings notice. */
  missing_delay_minutes: number | null;
  show_health_details: boolean;
  quiet_hours_enabled: boolean;
  quiet_start_hour: number | null;
  quiet_end_hour: number | null;
  quiet_timezone: string | null;
  urgent_during_quiet: boolean;
}

export const EMPTY_FOLLOWER_PREFERENCES: FollowerPreferences = {
  master_enabled: false,
  categories: {
    urgent_low: false,
    below_range: false,
    above_range: false,
    missing_readings: false,
  },
  missing_delay_minutes: null,
  show_health_details: false,
  quiet_hours_enabled: false,
  quiet_start_hour: null,
  quiet_end_hour: null,
  quiet_timezone: null,
  urgent_during_quiet: false,
};

/** A follower's own choices, always clamped to what the sharer allows. */
export function sanitizeFollowerPreferences(
  submitted: Record<string, unknown> | null | undefined,
  existing: Partial<FollowerPreferences> | null | undefined,
  relationship: RelationshipLike | null | undefined
): SanitizeResult<FollowerPreferences> {
  const base: FollowerPreferences = {
    ...EMPTY_FOLLOWER_PREFERENCES,
    ...(existing || {}),
    categories: { ...EMPTY_FOLLOWER_PREFERENCES.categories, ...(existing?.categories || {}) },
  };
  const input = submitted || {};

  const chosen: Record<string, unknown> = { ...base.categories };
  if (input.categories && typeof input.categories === "object") {
    for (const key of CATEGORY_KEYS) {
      if (typeof (input.categories as Record<string, unknown>)[key] === "boolean") {
        chosen[key] = (input.categories as Record<string, boolean>)[key];
      }
    }
  }
  const categories = clampFollowerCategories(relationship, chosen);

  let quietTimezone = base.quiet_timezone ?? null;
  if ("quiet_timezone" in input) {
    if (input.quiet_timezone == null || input.quiet_timezone === "") {
      quietTimezone = null;
    } else if (isValidTimeZone(input.quiet_timezone)) {
      quietTimezone = String(input.quiet_timezone);
    } else {
      return { value: base, error: "invalid_timezone" };
    }
  }

  const quietEnabled = readBoolean(input.quiet_hours_enabled, base.quiet_hours_enabled);
  const quietStart = "quiet_start_hour" in input ? readHour(input.quiet_start_hour) : base.quiet_start_hour ?? null;
  const quietEnd = "quiet_end_hour" in input ? readHour(input.quiet_end_hour) : base.quiet_end_hour ?? null;

  if (quietEnabled && (quietStart == null || quietEnd == null)) {
    return { value: base, error: "quiet_hours_required" };
  }
  if (quietEnabled && !quietTimezone) {
    return { value: base, error: "quiet_hours_required" };
  }

  let missingDelay = base.missing_delay_minutes ?? null;
  if ("missing_delay_minutes" in input) {
    missingDelay = readDurationChoice(input.missing_delay_minutes, MISSING_DELAY_CHOICES);
    if (input.missing_delay_minutes != null && missingDelay == null) {
      return { value: base, error: "invalid_missing_delay_minutes" };
    }
  }
  if (readBoolean(input.master_enabled, base.master_enabled) && categories.missing_readings && missingDelay == null) {
    return { value: base, error: "missing_delay_minutes_required" };
  }

  return {
    value: {
      master_enabled: readBoolean(input.master_enabled, base.master_enabled),
      categories,
      missing_delay_minutes: missingDelay,
      show_health_details: readBoolean(input.show_health_details, base.show_health_details),
      quiet_hours_enabled: quietEnabled,
      quiet_start_hour: quietStart,
      quiet_end_hour: quietEnd,
      quiet_timezone: quietTimezone,
      urgent_during_quiet: readBoolean(input.urgent_during_quiet, base.urgent_during_quiet),
    },
    error: null,
  };
}

/** Sharer-side grants are plain booleans, all defaulting to off. */
export function sanitizeSharerGrants(submitted: Record<string, unknown> | null | undefined): Record<Category, boolean> {
  const input = submitted || {};
  const out = { ...EMPTY_PERSONAL_PREFERENCES.categories } as Record<Category, boolean>;
  for (const key of CATEGORY_KEYS) {
    out[key] = input[key] === true;
  }
  return out;
}

// ── Scheduler invocation ──────────────────────────────────────────────────

/**
 * Only the platform's own workflow run (which arrives as an admin) may ask the
 * evaluator to look at real data. Everyone else is refused outright.
 */
export function assertSchedulerCaller(user: { id?: string; role?: string } | null | undefined): {
  status: number;
  error: string | null;
} {
  if (!user?.id) return { status: 401, error: "unauthorized" };
  if (user.role !== "admin") return { status: 403, error: "forbidden" };
  return { status: 200, error: null };
}