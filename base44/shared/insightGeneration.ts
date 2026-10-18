// Stackd Insight Generation — converts detected GlucoseEvents into grounded,
// per-user-adapted CoachInsight and UserPatternProfile records.
//
// Stage 2 of the insight pipeline: the deterministic event detector
// (glucoseEventDetection) produces objective glucose events; this module
// interprets them into human-facing wellness observations and recurring
// pattern profiles. No LLM — every message is grounded in verified event
// data and adapted to the user's observed history (frequency, recency).
//
// Wellness voice: uplifting and motivational, never medicinal. Describes
// patterns the user can reflect on, never prescribes a dose or treatment.
//
// Self-contained (no base44:runtime, no npm: imports) so it runs in both the
// backend runtime and the vitest test environment.

import { ANALYSIS_VERSION } from "./analysisVersion.ts";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const INSIGHT_PROMPT_VERSION = "1.1.0-insight-gen";

// Minimum occurrences of a recurring time-of-day window to persist a pattern.
const MIN_PATTERN_OCCURRENCES = 2;

// ── CoachInsight draft construction ──────────────────────────────────────────
//
// One insight per notable GlucoseEvent. The message adapts to the user's
// recent event history (how often this pattern has appeared) so insights
// are not one static template — they vary by observed frequency and context.

export interface InsightDraft {
  insight_type: string;
  insight_category: string;
  source_event_id: string;
  source_event_type: string;
  title: string;
  message: string;
  priority: number;
  confidence: number;
  supporting_metrics: Record<string, any>;
  insight_fingerprint: string;
  observation_start_at: string;
  observation_end_at: string;
}

export function buildInsightDrafts(
  events: any[],
  recentEventCounts: Record<string, number> = {}
): InsightDraft[] {
  const drafts: InsightDraft[] = [];
  for (const ev of events) {
    const draft = eventToInsightDraft(ev, recentEventCounts);
    if (draft) drafts.push(draft);
  }
  return drafts;
}

function eventToInsightDraft(
  ev: any,
  recentCounts: Record<string, number>
): InsightDraft | null {
  const type = ev.event_type;
  const classification = ev.classification || "unclear";
  const confounders: string[] = Array.isArray(ev.confounders) ? ev.confounders : [];
  const peak = Number(ev.peak_glucose);
  const lowest = Number(ev.lowest_glucose);
  const duration = Number(ev.duration_minutes) || 0;
  const startISO = ev.start_time;
  const endISO = ev.end_time || ev.start_time;

  // Adaptation: how many times has this event type appeared recently?
  const count = Number(recentCounts[type]) || 0;
  const isRecurring = count >= 3;
  const freqNote = isRecurring
    ? `You've noticed this pattern ${count} times recently — a meaningful rhythm to reflect on.`
    : count >= 2
      ? "This has shown up a couple of times lately."
      : "";

  let insightType = "";
  let category = "";
  let title = "";
  let message = "";
  let priority = 5;
  let confidence = Number(ev.confidence) || 0.7;

  if (type === "high") {
    insightType = "high_event";
    category = "high_event";
    const peakStr = Number.isFinite(peak) ? `${Math.round(peak)} mg/dL` : "above your range";
    title = classification === "rebound_high"
      ? "A rebound high after a low"
      : "Glucose rose above your range";
    message =
      `Your glucose reached ${peakStr}` +
      (duration > 0 ? ` and stayed elevated for about ${Math.round(duration)} min` : "") +
      "." +
      (classification === "rebound_high"
        ? " This followed a low — a gentle reminder that rebounds are common after treating a low."
        : classification === "high_followed_by_low"
          ? " A low followed shortly after, which is worth noting for next time."
          : "") +
      (freqNote ? ` ${freqNote}` : "");
    priority = 2;
  } else if (type === "low") {
    insightType = "low_event";
    category = "low_event";
    const lowStr = Number.isFinite(lowest) ? `${Math.round(lowest)} mg/dL` : "below your range";
    title = classification === "overnight_low"
      ? "An overnight low"
      : "Glucose dipped below your range";
    message =
      `Your glucose dipped to ${lowStr}` +
      (classification === "post_correction_low"
        ? " shortly after a correction dose — a gentle signal to watch the timing."
        : classification === "recurrent_low"
          ? " and this has happened again recently."
          : "") +
      (freqNote ? ` ${freqNote}` : "");
    priority = 1;
  } else if (type === "correction_response") {
    insightType = "correction_response";
    category = "correction_response";
    title =
      classification === "resolved_to_range"
        ? "A correction brought glucose back to range"
        : classification === "correction_followed_by_low"
          ? "A correction led to a low"
          : "How a correction dose landed";
    const startStr = Number.isFinite(Number(ev.starting_glucose))
      ? `from ${Math.round(Number(ev.starting_glucose))} mg/dL`
      : "";
    message =
      `Your correction dose landed ${startStr}` +
      (classification === "resolved_to_range"
        ? " and returned comfortably to range."
        : classification === "correction_followed_by_low"
          ? " and dipped below range afterward — a sign the dose may have been a touch strong."
          : ".") +
      (freqNote ? ` ${freqNote}` : "");
    priority = 3;
  } else if (type === "overnight") {
    insightType = "overnight_pattern";
    category = "overnight_pattern";
    title =
      classification === "dawn_rise"
        ? "A gentle dawn rise overnight"
        : classification === "overnight_low"
          ? "An overnight low"
          : classification === "overnight_high"
            ? "Glucose ran high overnight"
            : "A steady overnight";
    const avg = ev.metrics?.average_glucose;
    const avgStr = Number.isFinite(avg) ? `around ${Math.round(avg)} mg/dL` : "";
    message =
      `Overnight your glucose stayed ${avgStr}` +
      (classification === "dawn_rise"
        ? " with a gentle rise toward morning — a natural rhythm many people share."
        : classification === "overnight_low"
          ? " and dipped below range — worth a kind check-in with your care team."
          : ".") +
      (freqNote ? ` ${freqNote}` : "");
    priority = 4;
  } else {
    return null;
  }

  // Avoid confounded, low-confidence events surfacing as insights.
  if (confounders.includes("missing_glucose_data") || confidence < 0.4) {
    return null;
  }

  const fingerprint = `${type}:${ev.start_time}:${category}:${INSIGHT_PROMPT_VERSION}`;

  return {
    insight_type: insightType,
    insight_category: category,
    source_event_id: ev.id || "",
    source_event_type: type,
    title,
    message,
    priority,
    confidence: Math.round(confidence * 100) / 100,
    supporting_metrics: {
      peak_glucose: peak || null,
      lowest_glucose: lowest || null,
      duration_minutes: duration || null,
      classification,
      confounders,
      recent_count: count,
    },
    insight_fingerprint: fingerprint,
    observation_start_at: startISO,
    observation_end_at: endISO,
  };
}

// ── UserPatternProfile draft construction ───────────────────────────────────
//
// Groups events into recurring time-of-day windows and builds pattern profiles
// when a window repeats enough to be meaningful. Patterns are keyed by
// (type + hour-window) so each distinct rhythm gets its own profile.

export interface PatternDraft {
  pattern_type: string;
  pattern_key: string;
  sample_size: number;
  supporting_event_ids: string[];
  metrics: Record<string, any>;
  confidence: number;
  first_observed_at: string;
  last_observed_at: string;
}

export function buildPatternDrafts(
  events: any[],
  existingPatterns: any[] = []
): PatternDraft[] {
  // Group by (type + hour bucket). Overnight = 22-06, morning = 06-12,
  // afternoon = 12-18, evening = 18-22.
  const groups: Record<string, any[]> = {};
  for (const ev of events) {
    if (!ev.start_time) continue;
    const t = new Date(ev.start_time).getTime();
    if (!Number.isFinite(t)) continue;
    const hour = new Date(t).getHours();
    const bucket = hourBucket(hour);
    const key = `${ev.event_type}:${bucket}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(ev);
  }

  // Merge with existing pattern sample sizes so the count accumulates.
  const existingByKey: Record<string, any> = {};
  for (const p of existingPatterns) {
    existingByKey[p.pattern_key] = p;
  }

  const drafts: PatternDraft[] = [];
  for (const [key, group] of Object.entries(groups)) {
    const existing = existingByKey[key];
    const priorSamples = Number(existing?.sample_size) || 0;
    const sampleSize = priorSamples + group.length;
    if (sampleSize < MIN_PATTERN_OCCURRENCES) continue;

    const sorted = group.slice().sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const type = first.event_type;
    const patternType =
      type === "overnight" ? "overnight"
      : type === "high" ? "time_of_day"
      : type === "low" ? "time_of_day"
      : "correction";

    // Metrics: average peak/duration across occurrences.
    const peaks = group.map((e) => Number(e.peak_glucose)).filter((v) => Number.isFinite(v));
    const durations = group.map((e) => Number(e.duration_minutes)).filter((v) => Number.isFinite(v));
    const avgPeak = peaks.length ? peaks.reduce((s, v) => s + v, 0) / peaks.length : null;
    const avgDuration = durations.length ? durations.reduce((s, v) => s + v, 0) / durations.length : null;

    drafts.push({
      pattern_type: patternType,
      pattern_key: key,
      sample_size: sampleSize,
      supporting_event_ids: group.map((e) => e.id).filter(Boolean),
      metrics: {
        occurrences: group.length,
        total_sample_size: sampleSize,
        average_peak_glucose: avgPeak != null ? Math.round(avgPeak) : null,
        average_duration_minutes: avgDuration != null ? Math.round(avgDuration) : null,
        hour_bucket: key.split(":")[1],
      },
      confidence: Math.min(1, 0.4 + sampleSize * 0.15),
      first_observed_at: (existing?.first_observed_at || first.start_time),
      last_observed_at: last.start_time,
    });
  }

  return drafts;
}

function hourBucket(hour: number): string {
  if (hour >= 22 || hour < 6) return "overnight";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

// ── Persistence helpers (called by runAnalysisJobs) ──────────────────────────
//
// Dedup against existing insights/patterns by fingerprint/pattern_key and
// persist only fresh ones. Returns counts for the job result summary.

export async function persistInsightsAndPatterns(
  sr: any,
  userId: string,
  events: any[],
  jobId: string,
  nowISO: string
): Promise<{ insightsCreated: number; patternsCreated: number }> {
  // Count recent events of each type (for per-user adaptation).
  const recentEventCounts: Record<string, number> = {};
  for (const ev of events) {
    recentEventCounts[ev.event_type] = (recentEventCounts[ev.event_type] || 0) + 1;
  }
  // Also include prior GlucoseEvents for this user in the last 14 days.
  try {
    const prior = await sr.entities.GlucoseEvent.filter(
      { user_id: userId, start_time: { $gte: new Date(Date.now() - 14 * 24 * HOUR_MS).toISOString() } },
      "-start_time", 500
    );
    for (const ev of prior) {
      if (!recentEventCounts[ev.event_type]) recentEventCounts[ev.event_type] = 0;
      recentEventCounts[ev.event_type] += 1;
    }
  } catch {
    // non-fatal — counts just won't include older history
  }

  const insightDrafts = buildInsightDrafts(events, recentEventCounts);
  let insightsCreated = 0;
  if (insightDrafts.length) {
    // Dedup against existing unread insights in the last 7 days.
    const recentISO = new Date(Date.now() - 7 * 24 * HOUR_MS).toISOString();
    const existing = await sr.entities.CoachInsight.filter(
      { user_id: userId, generated_at: { $gte: recentISO } },
      "-generated_at", 200
    ).catch(() => []);
    const existingFingerprints = new Set((existing || []).map((i: any) => i.insight_fingerprint));
    const fresh = insightDrafts.filter((d) => !existingFingerprints.has(d.insight_fingerprint));
    if (fresh.length) {
      const records = fresh.map((d) => ({
        user_id: userId,
        created_by_id: userId,
        insight_type: d.insight_type,
        insight_category: d.insight_category,
        source_event_id: d.source_event_id,
        source_event_type: d.source_event_type,
        title: d.title,
        message: d.message,
        priority: d.priority,
        confidence: d.confidence,
        supporting_metrics: d.supporting_metrics,
        insight_fingerprint: d.insight_fingerprint,
        deduplication_key: d.insight_fingerprint,
        generated_by: "deterministic",
        prompt_version: INSIGHT_PROMPT_VERSION,
        analysis_version: ANALYSIS_VERSION,
        review_type: "daily",
        observation_start_at: d.observation_start_at,
        observation_end_at: d.observation_end_at,
        status: "unread",
        generated_at: nowISO,
      }));
      await sr.entities.CoachInsight.bulkCreate(records);
      insightsCreated = records.length;
    }
  }

  // UserPatternProfile generation.
  let patternsCreated = 0;
  const patternDrafts = buildPatternDrafts(events);
  if (patternDrafts.length) {
    const existingPatterns = await sr.entities.UserPatternProfile.filter(
      { user_id: userId, pattern_type: { $in: ["overnight", "time_of_day", "correction"] } },
      "-last_observed_at", 100
    ).catch(() => []);
    for (const draft of patternDrafts) {
      const existing = (existingPatterns || []).find((p: any) => p.pattern_key === draft.pattern_key);
      if (existing) {
        await sr.entities.UserPatternProfile.update(existing.id, {
          sample_size: draft.sample_size,
          supporting_event_ids: draft.supporting_event_ids,
          metrics: draft.metrics,
          confidence: draft.confidence,
          last_observed_at: draft.last_observed_at,
          status: draft.sample_size >= 5 ? "established" : "developing",
          analysis_version: ANALYSIS_VERSION,
        });
      } else {
        await sr.entities.UserPatternProfile.create({
          user_id: userId,
          created_by_id: userId,
          pattern_type: draft.pattern_type,
          pattern_key: draft.pattern_key,
          sample_size: draft.sample_size,
          supporting_event_ids: draft.supporting_event_ids,
          metrics: draft.metrics,
          confidence: draft.confidence,
          first_observed_at: draft.first_observed_at,
          last_observed_at: draft.last_observed_at,
          status: "developing",
          analysis_version: ANALYSIS_VERSION,
        });
        patternsCreated++;
      }
    }
  }

  return { insightsCreated, patternsCreated };
}