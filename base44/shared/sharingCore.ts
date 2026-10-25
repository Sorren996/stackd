// Pure, dependency-free core of the Stackd sharing / follower feature.
//
// Everything security-relevant that can be expressed as a pure function lives
// here so that it is the SINGLE source of truth for BOTH sides:
//   - the owner's "Preview what this person can see" (same projection, no bypass)
//   - the follower's data endpoints
//   - the urgent-low alert evaluator
//
// This module deliberately has no runtime imports, no network access and no
// crypto, so it can be unit-tested directly with `node --test`.
//
// Written in erasable TypeScript (no enums, no namespaces, no parameter
// properties) so Node can run it under --experimental-strip-types.

// ── Scope model ────────────────────────────────────────────────────────────

export type ScopeKey = "glucose" | "insulin" | "location" | "urgent_low_call";
export type AlertScopeKey = "urgent_low_email" | "urgent_low_sms";

export const SCOPE_KEYS: ScopeKey[] = ["glucose", "insulin", "location", "urgent_low_call"];
export const ALERT_SCOPE_KEYS: AlertScopeKey[] = ["urgent_low_email", "urgent_low_sms"];

export const SCOPE_LABELS: Record<ScopeKey, string> = {
  glucose: "Glucose",
  insulin: "Insulin",
  location: "Latest location",
  urgent_low_call: "Call on urgent low",
};

export const SCOPE_DESCRIPTIONS: Record<ScopeKey, string> = {
  glucose: "Glucose readings for the last 24 hours and today's daily balance.",
  insulin: "Recent insulin doses, and an estimated active rapid-acting amount when one can be validly worked out.",
  location: "The last location shared, with its own timestamp and accuracy. Never a movement history.",
  urgent_low_call: "Permission to place a call during a permitted urgent-low reading. Shares no data on its own.",
};

export const ALERT_SCOPE_LABELS: Record<AlertScopeKey, string> = {
  urgent_low_email: "Urgent-low email",
  urgent_low_sms: "Urgent-low text message",
};

// ── Tunables ───────────────────────────────────────────────────────────────

export const INVITE_TTL_HOURS = 48;
export const INVITE_RESEND_COOLDOWN_SECONDS = 60;
export const MAX_INVITE_ATTEMPTS = 5;
export const GLUCOSE_WINDOW_HOURS = 24;
export const INSULIN_WINDOW_HOURS = 24;
export const STALE_READING_MINUTES = 15;
export const URGENT_LOW_THRESHOLD = 55;
export const MIN_READINGS_FOR_DIRECTION = 3;
export const DIRECTION_WINDOW_MINUTES = 20;
export const MAX_ALERT_ATTEMPTS = 3;
export const LOCATION_STALE_MINUTES = 60;

export const SCOPE_RESOURCES: Record<string, ScopeKey> = {
  glucose: "glucose",
  insulin: "insulin",
  location: "location",
};

// ── Email handling ─────────────────────────────────────────────────────────

/**
 * Provider-consistent email normalization: trim, unicode NFC, lowercase.
 * Aliases are deliberately NOT stripped (no dot-removal, no +tag removal) —
 * "+tag" and dot variations are distinct mailboxes at many providers, and
 * collapsing them would let an unintended address redeem an invitation.
 */
export function normalizeEmail(email: unknown): string {
  if (typeof email !== "string") return "";
  return email.trim().normalize("NFC").toLowerCase();
}

export function emailsMatch(a: unknown, b: unknown): boolean {
  const na = normalizeEmail(a);
  const nb = normalizeEmail(b);
  return na !== "" && na === nb;
}

export function isPlausibleEmail(email: unknown): boolean {
  const e = normalizeEmail(email);
  return e.length >= 5 && e.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e);
}

// ── Contact number ─────────────────────────────────────────────────────────

/** Keep digits only; a leading + and country code are supplied separately. */
export function normalizePhoneDigits(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[^\d]/g, "");
}

export function normalizeCountryCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}

/** Owner-facing display: never reveal the full number in list views. */
export function maskPhone(countryCode: unknown, digits: unknown): string {
  const cc = normalizeCountryCode(countryCode);
  const d = normalizePhoneDigits(digits);
  if (!d) return "";
  const last2 = d.slice(-2);
  return `${cc} •••• ••${last2}`;
}

/** Follower-facing display, only ever built when the sharer released the number. */
export function formatPhone(countryCode: unknown, digits: unknown): string {
  const cc = normalizeCountryCode(countryCode);
  const d = normalizePhoneDigits(digits);
  if (!d) return "";
  return `${cc} ${d}`.trim();
}

/** Digits-only tel: href value (no tel: prefix). */
export function telHref(countryCode: unknown, digits: unknown): string {
  const cc = normalizeCountryCode(countryCode).replace("+", "");
  const d = normalizePhoneDigits(digits);
  if (!d) return "";
  return `${cc}${d}`;
}

// ── Relationship state ─────────────────────────────────────────────────────

export interface SharedAccessLike {
  id?: string;
  sharer_user_id?: string;
  sharer_display_name?: string;
  invited_email?: string;
  follower_user_id?: string;
  scopes?: Record<string, unknown> | null;
  alert_scopes?: Record<string, unknown> | null;
  contact_shared?: boolean;
  status?: string;
  permission_version?: number;
  invitation_expires_at?: string;
  accepted_at?: string;
  paused_at?: string;
  revoked_at?: string;
  follower_prefs?: Record<string, unknown> | null;
}

function nowMs(value: unknown): number {
  if (value == null) return Date.now();
  if (typeof value === "number") return value;
  const t = new Date(value as string).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

/** Coerce an arbitrary object into a strict boolean scope map. Unknown keys are dropped. */
export function sanitizeScopes(input: unknown): Record<ScopeKey, boolean> {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out = { glucose: false, insulin: false, location: false, urgent_low_call: false } as Record<
    ScopeKey,
    boolean
  >;
  for (const key of SCOPE_KEYS) out[key] = src[key] === true;
  return out;
}

export function sanitizeAlertScopes(input: unknown): Record<AlertScopeKey, boolean> {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out = { urgent_low_email: false, urgent_low_sms: false } as Record<AlertScopeKey, boolean>;
  for (const key of ALERT_SCOPE_KEYS) out[key] = src[key] === true;
  return out;
}

/** A pending relationship whose invitation window has closed is expired. */
export function isPendingExpired(access: SharedAccessLike, now: unknown = Date.now()): boolean {
  if (!access || access.status !== "pending") return false;
  const exp = access.invitation_expires_at;
  if (!exp) return false;
  return nowMs(exp) <= nowMs(now);
}

/** Lifecycle status with lazy expiry applied. */
export function effectiveStatus(access: SharedAccessLike, now: unknown = Date.now()): string {
  if (!access) return "revoked";
  if (isPendingExpired(access, now)) return "expired";
  return typeof access.status === "string" ? access.status : "revoked";
}

/** Only an `active` relationship conveys any health access, ever. */
export function isAccessUsable(access: SharedAccessLike, now: unknown = Date.now()): boolean {
  return effectiveStatus(access, now) === "active";
}

export function accessBlockReason(access: SharedAccessLike, now: unknown = Date.now()): string | null {
  const status = effectiveStatus(access, now);
  return status === "active" ? null : status;
}

/**
 * Resolved scopes. Every scope is false unless the relationship is active —
 * this is the single gate every server response goes through.
 */
export function effectiveScopes(
  access: SharedAccessLike | null | undefined,
  now: unknown = Date.now()
): Record<ScopeKey, boolean> {
  if (!access || !isAccessUsable(access, now)) return sanitizeScopes(null);
  return sanitizeScopes(access.scopes);
}

export function effectiveAlertScopes(
  access: SharedAccessLike | null | undefined,
  now: unknown = Date.now()
): Record<AlertScopeKey, boolean> {
  if (!access || !isAccessUsable(access, now)) return sanitizeAlertScopes(null);
  return sanitizeAlertScopes(access.alert_scopes);
}

export function canReadScope(
  access: SharedAccessLike | null | undefined,
  scope: ScopeKey,
  now: unknown = Date.now()
): boolean {
  return effectiveScopes(access, now)[scope] === true;
}

export function canCall(access: SharedAccessLike | null | undefined, now: unknown = Date.now()): boolean {
  return (
    canReadScope(access, "urgent_low_call", now) &&
    access?.contact_shared === true
  );
}

export interface FollowerPrefs {
  notify_email: boolean;
  notify_sms: boolean;
  quiet_hours_start: number;
  quiet_hours_end: number;
}

export function sanitizeFollowerPrefs(input: unknown): FollowerPrefs {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const hour = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
  };
  return {
    notify_email: src.notify_email === true,
    notify_sms: src.notify_sms === true,
    quiet_hours_start: hour(src.quiet_hours_start, 21),
    quiet_hours_end: hour(src.quiet_hours_end, 7),
  };
}

// ── Invitations ────────────────────────────────────────────────────────────

export interface InvitationLike {
  status?: string;
  invited_email?: string;
  expires_at?: string;
  accepted_by_user_id?: string;
}

/**
 * Why an invitation cannot be redeemed, or null when it can.
 * `verifiedEmail` must be the email of the already-authenticated account
 * attempting redemption.
 */
export function invitationBlockReason(
  invitation: InvitationLike | null | undefined,
  verifiedEmail: unknown,
  now: unknown = Date.now()
): string | null {
  if (!invitation) return "not_found";
  const status = typeof invitation.status === "string" ? invitation.status : "pending";
  if (status === "accepted") return "already_claimed";
  if (status === "canceled") return "canceled";
  if (status === "expired") return "expired";
  if (status !== "pending") return "not_redeemable";
  const exp = invitation.expires_at;
  if (!exp) return "expired";
  if (nowMs(exp) <= nowMs(now)) return "expired";
  if (!emailsMatch(invitation.invited_email, verifiedEmail)) return "email_mismatch";
  return null;
}

export function invitationIsRedeemable(
  invitation: InvitationLike | null | undefined,
  verifiedEmail: unknown,
  now: unknown = Date.now()
): boolean {
  return invitationBlockReason(invitation, verifiedEmail, now) === null;
}

// ── Glucose payload ────────────────────────────────────────────────────────

export interface ReadingLike {
  id?: string;
  value?: number;
  recorded_at?: string;
  source?: string;
  trend?: string;
}

/** Carry-forward "system" entries are never presented as genuine data. */
export function isRealReading(reading: ReadingLike | null | undefined): boolean {
  return !!reading && reading.source !== "system" && Number.isFinite(Number(reading?.value));
}

export function sortReadingsAsc(readings: ReadingLike[] | null | undefined): ReadingLike[] {
  if (!Array.isArray(readings)) return [];
  return readings
    .filter((r) => r && Number.isFinite(new Date(String(r.recorded_at)).getTime()))
    .slice()
    .sort((a, b) => new Date(String(a.recorded_at)).getTime() - new Date(String(b.recorded_at)).getTime());
}

/** Rolling window selection. The window is enforced here, never by the client. */
export function selectGlucoseWindow(
  readings: ReadingLike[] | null | undefined,
  now: unknown = Date.now(),
  hours: number = GLUCOSE_WINDOW_HOURS
): ReadingLike[] {
  const end = nowMs(now);
  const start = end - hours * 60 * 60 * 1000;
  return sortReadingsAsc(readings).filter((r) => {
    const t = new Date(String(r.recorded_at)).getTime();
    return t >= start && t <= end;
  });
}

export function latestReading(readings: ReadingLike[] | null | undefined): ReadingLike | null {
  const sorted = sortReadingsAsc(readings);
  return sorted.length ? sorted[sorted.length - 1] : null;
}

export function readingAgeMinutes(
  reading: ReadingLike | null | undefined,
  now: unknown = Date.now()
): number | null {
  if (!reading?.recorded_at) return null;
  const t = new Date(String(reading.recorded_at)).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((nowMs(now) - t) / 60000));
}

export function isStaleReading(
  reading: ReadingLike | null | undefined,
  now: unknown = Date.now()
): boolean {
  const age = readingAgeMinutes(reading, now);
  if (age == null) return true;
  return age > STALE_READING_MINUTES;
}

/**
 * Direction from the last 3–4 real readings over a ~15–20 minute span.
 * Returns null when there is not enough recent evidence — the caller omits
 * the line entirely rather than describing an old move as current.
 */
export function computeSharedDirection(
  readings: ReadingLike[] | null | undefined,
  now: unknown = Date.now()
): string | null {
  const points = sortReadingsAsc(readings).filter(isRealReading);
  if (points.length < MIN_READINGS_FOR_DIRECTION) return null;
  const recent = points.slice(-4);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const spanMinutes =
    (new Date(String(last.recorded_at)).getTime() - new Date(String(first.recorded_at)).getTime()) /
    60000;
  if (spanMinutes <= 0 || spanMinutes > DIRECTION_WINDOW_MINUTES) return null;
  const delta = Number(last.value) - Number(first.value);
  if (Math.abs(delta) <= 5) return "holding steady";
  if (delta > 15) return "climbing";
  if (delta > 5) return "drifting up";
  if (delta < -15) return "falling";
  return "easing down";
}

/** Neutral zone label — describes the data, never proposes treatment. */
export function sharedGlucoseZone(
  value: unknown,
  targetLow: unknown,
  targetHigh: unknown,
  stale: boolean
): string {
  const v = Number(value);
  const low = Number(targetLow);
  const high = Number(targetHigh);
  if (!Number.isFinite(v)) return "none";
  if (!stale && v < URGENT_LOW_THRESHOLD) return "urgentLow";
  if (Number.isFinite(low) && v < low) return "below";
  if (Number.isFinite(high) && v > high) return "above";
  if (stale) return "none";
  return "inRange";
}

// ── Insulin payload ────────────────────────────────────────────────────────

export interface DoseLike {
  insulin_type?: string;
  units?: number;
  administered_at?: string;
  category?: string;
}

export function selectInsulinWindow(
  doses: DoseLike[] | null | undefined,
  now: unknown = Date.now(),
  hours: number = INSULIN_WINDOW_HOURS
): DoseLike[] {
  if (!Array.isArray(doses)) return [];
  const end = nowMs(now);
  const start = end - hours * 60 * 60 * 1000;
  return doses
    .filter((d) => {
      const t = new Date(String(d?.administered_at)).getTime();
      // A dose with no recorded amount is not a usable dose — it must never
      // be coerced to 0 and presented as "no insulin".
      return (
        Number.isFinite(t) &&
        t >= start &&
        t <= end &&
        d?.units != null &&
        Number.isFinite(Number(d.units))
      );
    })
    .slice()
    .sort(
      (a, b) =>
        new Date(String(a.administered_at)).getTime() - new Date(String(b.administered_at)).getTime()
    );
}

export function latestDose(doses: DoseLike[] | null | undefined): DoseLike | null {
  const sorted = selectInsulinWindow(doses, Date.now(), 24 * 365 * 5);
  return sorted.length ? sorted[sorted.length - 1] : null;
}

// ── Location payload ───────────────────────────────────────────────────────

export interface LocationLike {
  latitude?: number;
  longitude?: number;
  accuracy_m?: number;
  captured_at?: string;
}

export function isValidLocation(loc: LocationLike | null | undefined): boolean {
  if (!loc) return false;
  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function locationAgeMinutes(
  loc: LocationLike | null | undefined,
  now: unknown = Date.now()
): number | null {
  if (!loc?.captured_at) return null;
  const t = new Date(String(loc.captured_at)).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((nowMs(now) - t) / 60000));
}

// ── Time zone helpers (sharer-local day boundaries) ────────────────────────

const TZ_PARTS_FORMAT: Record<string, Intl.DateTimeFormat> = {};

function tzFormatter(timeZone: string): Intl.DateTimeFormat {
  if (!TZ_PARTS_FORMAT[timeZone]) {
    TZ_PARTS_FORMAT[timeZone] = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  return TZ_PARTS_FORMAT[timeZone];
}

export function isValidTimeZone(timeZone: unknown): boolean {
  if (typeof timeZone !== "string" || !timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function tzParts(date: Date, timeZone: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of tzFormatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out;
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const p = tzParts(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asUTC - date.getTime();
}

/** Local hour (0-23) in the given time zone, or null when unusable. */
export function localHourInTimeZone(date: unknown, timeZone: unknown): number | null {
  if (!isValidTimeZone(timeZone)) return null;
  const d = date instanceof Date ? date : new Date(nowMs(date));
  if (!Number.isFinite(d.getTime())) return null;
  return tzParts(d, timeZone as string).hour % 24;
}

/** UTC ms of local midnight for the day containing `date`, in `timeZone`. */
export function startOfLocalDayMs(date: unknown, timeZone: unknown): number | null {
  if (!isValidTimeZone(timeZone)) return null;
  const d = date instanceof Date ? date : new Date(nowMs(date));
  if (!Number.isFinite(d.getTime())) return null;
  const offset = timeZoneOffsetMs(d, timeZone as string);
  const shifted = new Date(d.getTime() + offset);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - offset;
}

// ── Alert decision ─────────────────────────────────────────────────────────

export interface AlertInput {
  access: SharedAccessLike | null | undefined;
  channel: "email" | "sms";
  channelConfigured: boolean;
  glucoseValue: unknown;
  /** True only for a reading that arrived through trusted fresh ingestion. */
  readingIsFresh: boolean;
  /** True when this exact event key has already been delivered. */
  alreadyDelivered: boolean;
  followerPrefs?: FollowerPrefs | null;
  sharerTimeZone?: string | null;
  now?: unknown;
}

export interface AlertDecision {
  dispatch: boolean;
  reason: string;
}

export function isUrgentLow(value: unknown): boolean {
  const v = Number(value);
  return Number.isFinite(v) && v < URGENT_LOW_THRESHOLD;
}

/** Quiet hours wrap across midnight (start 21, end 7). */
export function isWithinQuietHours(hour: number | null, start: number, end: number): boolean {
  if (hour == null || !Number.isFinite(hour)) return false;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export function alertEventKey(
  sharerUserId: unknown,
  followerUserId: unknown,
  eventId: unknown,
  channel: unknown
): string {
  return [sharerUserId, followerUserId, eventId, channel].map((p) => String(p ?? "")).join("::");
}

/**
 * Decide whether an urgent-low notice may be dispatched. Ordered so the
 * cheapest and most security-relevant checks run first. This is re-run
 * immediately before dispatch — never at scheduling time — so a revoke or a
 * paused relationship blocks a pending send.
 */
export function decideAlert(input: AlertInput): AlertDecision {
  const now = input.now ?? Date.now();
  const access = input.access;
  const status = effectiveStatus(access, now);
  if (status !== "active") return { dispatch: false, reason: status };

  const scopes = effectiveScopes(access, now);
  if (!scopes.glucose) return { dispatch: false, reason: "glucose_scope_off" };

  const alertScopes = effectiveAlertScopes(access, now);
  const channelKey: AlertScopeKey =
    input.channel === "sms" ? "urgent_low_sms" : "urgent_low_email";
  if (!alertScopes[channelKey]) return { dispatch: false, reason: "channel_not_authorized" };

  const prefs = sanitizeFollowerPrefs(input.followerPrefs);
  const optedIn = input.channel === "sms" ? prefs.notify_sms : prefs.notify_email;
  if (!optedIn) return { dispatch: false, reason: "follower_opted_out" };

  if (!input.channelConfigured) return { dispatch: false, reason: "no_delivery_capability" };
  if (!input.readingIsFresh) return { dispatch: false, reason: "not_fresh" };
  if (!isUrgentLow(input.glucoseValue)) return { dispatch: false, reason: "not_urgent" };
  if (input.alreadyDelivered) return { dispatch: false, reason: "duplicate" };

  // Quiet hours never suppress an urgent low. They exist only so a future
  // non-urgent channel can be held; this is asserted by a unit test.
  return { dispatch: true, reason: "ok" };
}

// ── Shared projection (owner preview + follower endpoint) ──────────────────

export type Resource = "summary" | "glucose" | "insulin" | "location";

export interface ProjectionContext {
  access: SharedAccessLike;
  now?: number;
  readings?: ReadingLike[] | null;
  doses?: DoseLike[] | null;
  targetLow?: number | null;
  targetHigh?: number | null;
  timeZone?: string | null;
  contact?: { country_code?: string | null; phone?: string | null } | null;
  location?: LocationLike | null;
  settingsConfirmed?: boolean;
}

export interface ProjectionResult {
  ok: boolean;
  reason?: string;
  data?: Record<string, unknown>;
}

/**
 * The ONE projection used by both the owner's preview and the follower's
 * endpoints. The preview is therefore a true rendering of what the follower
 * would receive — it is not a privileged bypass.
 */
export function projectResource(resource: Resource, ctx: ProjectionContext): ProjectionResult {
  const now = ctx.now ?? Date.now();
  const access = ctx.access;
  const status = effectiveStatus(access, now);

  if (resource === "summary") {
    const scopes = effectiveScopes(access, now);
    const alertScopes = effectiveAlertScopes(access, now);
    return {
      ok: true,
      data: {
        sharer_display_name: access.sharer_display_name || "Someone",
        status,
        accepted_at: access.accepted_at ?? null,
        permission_version: Number(access.permission_version) || 1,
        scopes,
        alert_scopes: alertScopes,
        contact_available: canCall(access, now),
        contact:
          canCall(access, now) && ctx.contact
            ? {
                country_code: normalizeCountryCode(ctx.contact.country_code),
                phone: formatPhone(ctx.contact.country_code, ctx.contact.phone),
                tel: telHref(ctx.contact.country_code, ctx.contact.phone),
              }
            : null,
        call_allowed: canCall(access, now),
      },
    };
  }

  const requiredScope = SCOPE_RESOURCES[resource];
  if (!requiredScope) return { ok: false, reason: "unknown_resource" };
  if (status !== "active") return { ok: false, reason: status };
  if (!effectiveScopes(access, now)[requiredScope]) return { ok: false, reason: "scope_off" };

  if (resource === "glucose") {
    const windowReadings = selectGlucoseWindow(ctx.readings, now, GLUCOSE_WINDOW_HOURS);
    const todayStart = startOfLocalDayMs(now, ctx.timeZone) ?? nowMs(now) - 24 * 60 * 60 * 1000;
    const todayReadings = windowReadings.filter(
      (r) => new Date(String(r.recorded_at)).getTime() >= todayStart
    );
    const latest = latestReading(windowReadings);
    // Only the fields this chart needs — no notes, no meal links, no ids of
    // anything the follower has no scope for.
    const shape = (r: ReadingLike) => ({
      id: r.id,
      value: Number(r.value),
      recorded_at: r.recorded_at,
      source: r.source,
      trend: r.trend ?? null,
    });
    return {
      ok: true,
      data: {
        window_hours: GLUCOSE_WINDOW_HOURS,
        window_start: new Date(now - GLUCOSE_WINDOW_HOURS * 3600000).toISOString(),
        window_end: new Date(now).toISOString(),
        today_start: new Date(todayStart).toISOString(),
        time_zone: isValidTimeZone(ctx.timeZone) ? ctx.timeZone : null,
        target_low:
          ctx.targetLow != null && Number.isFinite(Number(ctx.targetLow)) ? Number(ctx.targetLow) : null,
        target_high:
          ctx.targetHigh != null && Number.isFinite(Number(ctx.targetHigh))
            ? Number(ctx.targetHigh)
            : null,
        latest: latest ? shape(latest) : null,
        latest_age_minutes: readingAgeMinutes(latest, now),
        stale: isStaleReading(latest, now),
        direction: isStaleReading(latest, now) ? null : computeSharedDirection(windowReadings, now),
        zone: sharedGlucoseZone(
          latest?.value,
          ctx.targetLow,
          ctx.targetHigh,
          isStaleReading(latest, now)
        ),
        readings: windowReadings.filter((r) => r.source !== "system").map(shape),
        today_reading_count: todayReadings.filter((r) => r.source !== "system").length,
      },
    };
  }

  if (resource === "insulin") {
    const doses = selectInsulinWindow(ctx.doses, now, INSULIN_WINDOW_HOURS);
    const last = doses.length ? doses[doses.length - 1] : null;
    return {
      ok: true,
      data: {
        window_hours: INSULIN_WINDOW_HOURS,
        window_start: new Date(now - INSULIN_WINDOW_HOURS * 3600000).toISOString(),
        window_end: new Date(now).toISOString(),
        // Dose math is only valid against a confirmed plan — the same gate the
        // patient side uses. The follower client shows "Unavailable" otherwise.
        dose_math_available: ctx.settingsConfirmed === true,
        doses: doses.map((d) => ({
          insulin_type: d.insulin_type,
          units: Number(d.units),
          administered_at: d.administered_at,
        })),
        last_dose: last
          ? {
              insulin_type: last.insulin_type,
              units: Number(last.units),
              administered_at: last.administered_at,
            }
          : null,
      },
    };
  }

  if (resource === "location") {
    const loc = isValidLocation(ctx.location) ? (ctx.location as LocationLike) : null;
    return {
      ok: true,
      data: {
        location: loc
          ? {
              latitude: Number(loc.latitude),
              longitude: Number(loc.longitude),
              accuracy_m: Number.isFinite(Number(loc.accuracy_m)) ? Number(loc.accuracy_m) : null,
              captured_at: loc.captured_at ?? null,
              age_minutes: locationAgeMinutes(loc, now),
            }
          : null,
        reason: loc ? null : "none_published",
      },
    };
  }

  return { ok: false, reason: "unknown_resource" };
}