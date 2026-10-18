// Frontend mirror of the pure insight-generation helpers.
//
// The backend (base44/shared/insightGeneration.ts) owns the full pipeline
// including persistence; this mirror exposes only the pure, testable
// construction functions so the frontend and vitest can validate the same
// logic without crossing the frontend/backend boundary. Kept in sync with the
// backend module — the message construction must match exactly.

export const INSIGHT_PROMPT_VERSION = "1.1.0-insight-gen";
export const MIN_PATTERN_OCCURRENCES = 2;

// ── CoachInsight draft construction ──────────────────────────────────────────

export function buildInsightDrafts(events, recentEventCounts = {}) {
  const drafts = [];
  for (const ev of events) {
    const draft = eventToInsightDraft(ev, recentEventCounts);
    if (draft) drafts.push(draft);
  }
  return drafts;
}

function eventToInsightDraft(ev, recentCounts) {
  const type = ev.event_type;
  const classification = ev.classification || "unclear";
  const confounders = Array.isArray(ev.confounders) ? ev.confounders : [];
  const peak = Number(ev.peak_glucose);
  const lowest = Number(ev.lowest_glucose);
  const duration = Number(ev.duration_minutes) || 0;
  const startISO = ev.start_time;
  const endISO = ev.end_time || ev.start_time;

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

export function buildPatternDrafts(events, existingPatterns = []) {
  const groups = {};
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

  const existingByKey = {};
  for (const p of existingPatterns) {
    existingByKey[p.pattern_key] = p;
  }

  const drafts = [];
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

function hourBucket(hour) {
  if (hour >= 22 || hour < 6) return "overnight";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}