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

import { sanitizeNotificationOptions } from './notificationOptions.ts';
import { notificationAgeMinutes, PUSH_FUTURE_TOLERANCE_MINUTES } from './notificationTiming.ts';
import { normalizeTrendWord } from './notificationTrend.ts';
import { trendPresentation, trendGlyph } from './trendPresentation.ts';

// ── Categories and timings ────────────────────────────────────────────────

export const CATEGORY_KEYS = [
  "custom_low", "custom_high", "falling_fast", "rising_fast",
  "urgent_low", "low_glucose",
  "below_range",
  "above_range",
  "missing_readings",
] as const;

export type Category = (typeof CATEGORY_KEYS)[number];

/**
 * Categories that are delivered but are never a settings choice of their own:
 * the optional all-readings stream and the follower recovery note. They share
 * the copy and quiet-hour machinery without appearing in any settings list.
 */
export const DELIVERY_ONLY_CATEGORIES = ["all_readings", "low_recovery"] as const;

export type DeliveryCategory = Category | (typeof DELIVERY_ONLY_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  custom_low: 'Custom low', custom_high: 'Custom high', falling_fast: 'Falling fast', rising_fast: 'Rising fast',
  urgent_low: "Urgent low", low_glucose: "Low glucose",
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
export const FUTURE_TOLERANCE_MINUTES = PUSH_FUTURE_TOLERANCE_MINUTES;

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

// Match Stackd's display convention; persisted thresholds remain mg/dL.
export const MGDL_PER_MMOL = 18;

export const PUSH_CHANNEL = "push";

// ── Samples ───────────────────────────────────────────────────────────────

export interface ReadingRow {
  id?: string;
  value?: unknown;
  recorded_at?: unknown;
  source?: unknown;
  user_id?: string;
  /** The source's own trend for this measurement, when it reported one. */
  trend?: unknown;
}

export interface Sample {
  id: string;
  value: number;
  /** Epoch milliseconds of the measurement itself. */
  at: number;
  source: string;
  /** Recognised source trend for THIS measurement, or null. Never inherited. */
  trend: string | null;
}

/** A trend is only ever taken from the reading it was reported with. */
export function sampleTrend(source: string, trend: unknown): string | null {
  return source === "dexcom" || source === "dexcom_share" ? normalizeTrendWord(trend) : null;
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
    out.push({ id: String(row?.id ?? `${at}`), value, at, source, trend: sampleTrend(source, row?.trend) });
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
  const ageMinutes = notificationAgeMinutes(sample.at, nowMs);
  return ageMinutes != null && ageMinutes <= NOTIFICATION_FRESHNESS_MINUTES;
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
export const GENERIC_BODY = "Open Stackd to review.";
export const PRIVATE_URGENT_TITLE = "Urgent Stackd alert";

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
  category: DeliveryCategory;
  /** The triggering measurement's own value, never a later fetch. */
  value?: number | null;
  units?: string | null;
  readingAt?: number | null;
  timeZone?: string | null;
  /** True only when the recipient opted into health details in previews. */
  showDetails: boolean;
  /** The person being followed, for a follower's detailed preview. */
  personName?: string | null;
  durationMinutes?: number | null;
  /** The triggering sample's own source trend, when it reported one. */
  trend?: string | null;
  resolvedTrend?: { icon: string; word: string } | null;
  /** Now, used only to state a genuinely measured age. */
  nowMs?: number | null;
  /** Every category this one send covers, after coalescing. */
  coveredCategories?: string[] | null;
  /**
   * The person's own range. Used only to word a rising arrow below that range
   * as "coming back up"; a threshold is never printed in a preview.
   */
  targetLow?: number | null;
  targetHigh?: number | null;
}

export interface PushCopy {
  title: string;
  body: string;
}

/**
 * One headline per category. Deliberately not CATEGORY_LABELS (the settings
 * labels) and never shared between categories, so a comfort-zone notice cannot
 * read as an alert-threshold notice or the other way round.
 */
const PUSH_LABELS: Record<DeliveryCategory, string> = {
  urgent_low: "Urgent low",
  custom_low: "Low glucose",
  custom_high: "High glucose",
  low_glucose: "Low glucose",
  below_range: "Glucose",
  above_range: "Glucose",
  falling_fast: "Falling fast",
  rising_fast: "Rising fast",
  missing_readings: "Readings haven't updated",
  all_readings: "Glucose",
  low_recovery: "Back in range",
};



function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function measuredMinutes(fromMs: unknown, toMs: unknown): number | null {
  if (fromMs == null || toMs == null || fromMs === "" || toMs === "") return null;
  const from = Number(fromMs);
  const to = Number(toMs);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to < from) return null;
  return Math.floor((to - from) / 60_000);
}

/**
 * The whole of what a preview may say.
 *
 * Private unless the recipient explicitly asked for details: no value, no
 * trend, no name and no condition — only that something needs attention, and
 * for an urgent low that it is urgent, so a lock screen can be acted on
 * without exposing health detail. With details on, the copy states the
 * recipient's own display unit, the source's own verified trend (when it had
 * one) and one factual sentence. It never judges, guesses, predicts, advises
 * or recommends.
 */
export function buildNotificationCopy(input: CopyInput): PushCopy {
  if (!input.showDetails) {
    return input.category === "urgent_low"
      ? { title: PRIVATE_URGENT_TITLE, body: GENERIC_BODY }
      : { title: GENERIC_TITLE, body: GENERIC_BODY };
  }

  const who = typeof input.personName === "string" && input.personName.trim() ? input.personName.trim() : null;
  const lead = who ? `${who} · ` : "";

  // A stale value is never dressed up as a current one: the notice reports age
  // and receipt time only, with no value and no trend.
  if (input.category === "missing_readings") {
    const clock = formatClock(input.readingAt ?? null, input.timeZone);
    const age = measuredMinutes(input.readingAt, input.nowMs);
    const last = who ? `${possessive(who)} last reading` : "Your last reading";
    const parts: string[] = [];
    if (age != null) parts.push(`No new readings for ${age} minute${age === 1 ? "" : "s"}.`);
    if (clock) parts.push(`${last} arrived at ${clock}.`);
    if (!parts.length) parts.push(`${last} is the most recent one we have.`);
    return { title: `${lead}${PUSH_LABELS.missing_readings}`, body: parts.join(" ") };
  }

  const units = unitLabel(input.units);
  const value = formatGlucoseValue(input.value, input.units);
  const resolved = 'resolvedTrend' in input ? input.resolvedTrend : input.trend;
  const targetLow = Number(input.targetLow);
  // A rising arrow under the person's own range reads "coming back up". This is
  // wording only: it never prints the boundary the reading sits below.
  const below =
    (resolved as { word?: string } | null)?.word === "coming back up" ||
    (Number.isFinite(targetLow) && Number(input.value) < targetLow);
  const pair = trendPresentation(resolved, { below });
  const arrow = pair ? trendGlyph(pair) : null;
  const title = `${lead}${value} ${units}${arrow ? ` ${arrow}` : ""}`;

  // Every glucose preview repeats what the arrow already says — the trend word,
  // capitalised. No threshold, level or zone name ever reaches a preview.
  if (input.category === "urgent_low") return { title, body: "Urgent low, act now." };
  if (input.category === "low_recovery") return { title, body: "Back in range" };
  return { title, body: pair ? pair.word.charAt(0).toUpperCase() + pair.word.slice(1) : "New reading" };
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
  category: DeliveryCategory,
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

/**
 * The pause window for the all-readings stream.
 *
 * This holds ONLY that stream back. Every alert above keeps its own settings,
 * so nothing here can quiet an urgent low, a boundary notice, a pace notice or
 * a missing-readings notice. The window may cross midnight, and it is stored
 * with its own zone so daylight saving resolves itself.
 */
export function allReadingsHeldByPause(preferences: any, nowMs: number): boolean {
  if (preferences?.all_readings_pause_enabled !== true) return false;
  const zone = preferences?.all_readings_pause_timezone || preferences?.quiet_timezone || "UTC";
  const hour = zonedHour(nowMs, zone);
  return isWithinQuietWindow(hour, preferences?.all_readings_pause_start_hour, preferences?.all_readings_pause_end_hour);
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
  return sharerGrantsFromPush((row?.push || {}) as Record<string, unknown>);
}

/**
 * The ONE canonical shape of a sharer's per-follower push permission. Every
 * reader (persistence, the relationship payload, delivery) goes through it, so
 * a category can never be saved yet reported as absent.
 */
export function sharerGrantsFromPush(rawPush: Record<string, unknown> | null | undefined): Record<Category, boolean> {
  const raw = (rawPush || {}) as Record<string, unknown>;
  return {
    custom_low: raw.custom_low === true, custom_high: raw.custom_high === true,
    falling_fast: raw.falling_fast === true, rising_fast: raw.rising_fast === true,
    low_glucose: raw.low_glucose === true,
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
    custom_low: granted.custom_low && chosen.custom_low === true,
    custom_high: granted.custom_high && chosen.custom_high === true,
    falling_fast: granted.falling_fast && chosen.falling_fast === true,
    rising_fast: granted.rising_fast && chosen.rising_fast === true,
    ...(chosen.low_glucose == null ? {} : { low_glucose: granted.low_glucose && chosen.low_glucose === true }),
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
  /** Owner only: one quiet note for each new reading. Never a follower choice. */
  all_readings_enabled: boolean;
  all_readings_pause_enabled: boolean;
  all_readings_pause_start_hour: number | null;
  all_readings_pause_end_hour: number | null;
  all_readings_pause_timezone: string | null;
}

export const EMPTY_PERSONAL_PREFERENCES: PersonalPreferences = {
  master_enabled: false,
  categories: {
    custom_low: false, custom_high: false, falling_fast: false, rising_fast: false,
    urgent_low: false, low_glucose: false,
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
  all_readings_enabled: false,
  all_readings_pause_enabled: false,
  all_readings_pause_start_hour: null,
  all_readings_pause_end_hour: null,
  all_readings_pause_timezone: null,
};

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readHour(value: unknown): number | null {
  if (value == null || value === '') return null;
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
  if (existing && existing.categories?.low_glucose == null) delete base.categories.low_glucose;
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
  const options = sanitizeNotificationOptions(input, base, categories, master);
  if (options.error) return { value: base, error: options.error };

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

  // The all-readings stream and its pause window. The window may cross
  // midnight; when it is switched on it needs both hours and its own zone.
  const streamEnabled = readBoolean(input.all_readings_enabled, base.all_readings_enabled === true);
  const pauseEnabled = streamEnabled && readBoolean(input.all_readings_pause_enabled, base.all_readings_pause_enabled === true);
  const pauseStart = "all_readings_pause_start_hour" in input
    ? readHour(input.all_readings_pause_start_hour)
    : base.all_readings_pause_start_hour ?? null;
  const pauseEnd = "all_readings_pause_end_hour" in input
    ? readHour(input.all_readings_pause_end_hour)
    : base.all_readings_pause_end_hour ?? null;
  let pauseTimezone = base.all_readings_pause_timezone ?? null;
  if ("all_readings_pause_timezone" in input) {
    if (input.all_readings_pause_timezone == null || input.all_readings_pause_timezone === "") {
      pauseTimezone = null;
    } else if (isValidTimeZone(input.all_readings_pause_timezone)) {
      pauseTimezone = String(input.all_readings_pause_timezone);
    } else {
      return { value: base, error: "invalid_timezone" };
    }
  }
  if (pauseEnabled && (pauseStart == null || pauseEnd == null)) {
    return { value: base, error: "all_readings_pause_required" };
  }
  if (pauseEnabled && !pauseTimezone) {
    return { value: base, error: "all_readings_pause_required" };
  }

  return {
    value: {
      ...options.value,
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
      all_readings_enabled: streamEnabled,
      all_readings_pause_enabled: pauseEnabled,
      all_readings_pause_start_hour: pauseStart,
      all_readings_pause_end_hour: pauseEnd,
      all_readings_pause_timezone: pauseTimezone,
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
    custom_low: false, custom_high: false, falling_fast: false, rising_fast: false,
    urgent_low: false, low_glucose: false,
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
  if (existing && existing.categories?.low_glucose == null) delete base.categories.low_glucose;
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
  const options = sanitizeNotificationOptions(input, base, categories, readBoolean(input.master_enabled, base.master_enabled));
  if (options.error) return { value: base, error: options.error };
  if (readBoolean(input.master_enabled, base.master_enabled) && categories.above_range && options.value.above_range_minutes == null && (base.master_enabled !== true || base.categories.above_range !== true)) return { value: base, error: 'above_range_minutes_required' };

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
      ...options.value,
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

/**
 * Change ONE category of a relationship's push permission.
 *
 * Merged against the grants the server itself has stored, never against a copy
 * the browser sent. A client that does not know about a category therefore
 * cannot switch it off by leaving it out.
 */
export function applySharerGrantPatch(
  storedPush: Record<string, unknown> | null | undefined,
  category: unknown,
  value: unknown
): { grants: Record<Category, boolean>; error?: undefined } | { grants?: undefined; error: string } {
  if (typeof category !== "string" || !CATEGORY_KEYS.includes(category as Category)) {
    return { error: "invalid_grant_category" };
  }
  if (typeof value !== "boolean") return { error: "invalid_grant_value" };
  const grants = sharerGrantsFromPush(storedPush);
  grants[category as Category] = value;
  return { grants };
}

/**
 * What the FOLLOWER has chosen for themselves. Used only to tell the sharer
 * their permission is saved but waiting — never to infer or change it.
 */
export function followerPushReady(prefs: Record<string, any> | null | undefined): Record<Category, boolean> {
  const on = prefs?.master_enabled === true;
  const chosen = (prefs?.categories || {}) as Record<string, unknown>;
  const out = {} as Record<Category, boolean>;
  for (const key of CATEGORY_KEYS) out[key] = on && chosen[key] === true;
  return out;
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