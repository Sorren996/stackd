// Shared glucose-event interpretation, extracted from interpretGlucoseEvents
// so runAnalysisJobs can interpret newly created events immediately after
// creating them — eliminating the need for a separate 10-minute scan of all
// users. The prompt, gating, fingerprint dedup, and deterministic fallback are
// identical to the original interpretGlucoseEvents implementation.

import { buildInsightFingerprint } from "./insightFingerprint.ts";
import { ANALYSIS_VERSION, PROMPT_VERSION } from "./analysisVersion.ts";
import { canCreateInsight } from "./insightGating.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 2;

const INSIGHT_TYPE_BY_EVENT: Record<string, string> = {
  high: "high_event",
  low: "low_event",
  correction_response: "correction_response",
  overnight: "overnight_pattern",
};

function buildPrompt(events: any[]): string {
  return `You are the Stackd Wellness Coach. A deterministic engine has already identified and verified the following glucose events from the user's actual logged data. Your job is to write ONE warm, supportive, two-to-four-sentence observation for each event — the kind of thing a caring friend who is good at noticing patterns would say.

## STRICT BOUNDARIES — NEVER VIOLATE
- You MUST NOT provide dosing, insulin, medication, or treatment advice.
- You MUST NOT say a dose was too high, too low, an overdose, or an underdose.
- You MUST NOT recommend corrections, split doses, ratio changes, or timing changes.
- You MUST NOT use clinical labels (uncontrolled, hypoglycemia, insulin resistance, dawn phenomenon, etc.).
- You MUST NOT claim causation from timing alone.
- You MUST NOT use absolute language (always, never, definitely, proves, means).
- Speak in calm, natural, uplifting language. Frame excursions as check-ins, not failures.
- Describe only what the verified data shows; do not invent values or context.

## MEANINGFULNESS
- Highlight what makes this event genuinely notable — a connection, a timing pattern, or how the recovery unfolded — not just a restatement of the numbers.
- If the event is minor or unremarkable, keep the message honest and brief rather than overstating its importance.

## EVENTS (verified, from real logs)
${JSON.stringify(events, null, 2)}

## INSTRUCTIONS
For each event, return an object with:
- source_event_id: the event id
- title: a short, warm headline (max ~40 characters)
- message: 2-4 sentences, grounded in the event's values (glucose, duration, time of day), non-clinical and supportive
- confidence: 0 to 1 based on data completeness (use the event's confidence as a guide)

Keep each message distinct and specific to that event. Respond with the JSON schema.`;
}

function deterministicFallback(e: any): { title: string; message: string; confidence: number } {
  const time = e.start_time ? new Date(e.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "earlier";
  const dur = Number.isFinite(e.duration_minutes) ? Math.round(e.duration_minutes) : null;
  const durText = dur ? ` over about ${dur} minutes` : "";

  if (e.event_type === "high") {
    return {
      title: "A gentle rise to notice",
      message: `Your glucose rose above your target range${durText} starting around ${time}, reaching ${Math.round(e.peak_glucose)} before easing back. That's useful information to have captured — it gives you a clearer picture of how the day unfolded. I'm keeping an eye on how this fits with your other recent entries.`,
      confidence: 0.6,
    };
  }
  if (e.event_type === "low") {
    return {
      title: "A dip worth noticing",
      message: `Your glucose dipped below your target range${durText} around ${time}, down to ${Math.round(e.lowest_glucose)} before recovering. I'm glad this was logged so you can see the full picture. I'll keep watching how your evenings and recoveries are trending.`,
      confidence: 0.6,
    };
  }
  if (e.event_type === "correction_response") {
    return {
      title: "How a correction unfolded",
      message: `A correction entry around ${time} was followed by your glucose moving toward your target range${durText}. Capturing the full sequence like this makes it easier to spot how these moments tend to go. I'll keep this in mind as I learn your patterns.`,
      confidence: 0.55,
    };
  }
  if (e.event_type === "overnight") {
    return {
      title: "An overnight check-in",
      message: `Overnight around ${time}, your glucose traced a path that stayed mostly within your range${durText}. Nights like this are helpful to have on record. I'll keep watching your overnight rhythms as more data comes in.`,
      confidence: 0.55,
    };
  }
  return {
    title: "A moment to notice",
    message: `I recorded a glucose event around ${time} and want to keep it on your radar as part of your bigger picture. Logging these moments helps me learn your unique rhythms over time.`,
    confidence: 0.5,
  };
}

// Interpret uninterpreted glucose events for a single user. Called by
// runAnalysisJobs after it creates new GlucoseEvent records, and by
// interpretGlucoseEvents for backward compatibility. Returns the number of
// insights created.
export async function interpretEventsForUser(
  sr: any,
  userId: string,
  now: Date
): Promise<number> {
  // Respect user preference
  const settingsRows = await sr.entities.UserSettings.filter({ created_by_id: userId }, "-created_date", 1);
  const settings = settingsRows[0];
  if (settings?.coach_reviews_enabled === false) return 0;

  // Consent gate
  try {
    const users = await sr.entities.User.filter({ id: userId }, "-created_date", 1);
    if (!users[0] || users[0].health_data_consent_active === false) return 0;
  } catch {
    return 0;
  }

  const sinceISO = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS).toISOString();
  const events = await sr.entities.GlucoseEvent.filter(
    { user_id: userId, start_time: { $gte: sinceISO } },
    "-start_time",
    20
  );
  if (!events.length) return 0;

  // Find which events already have an insight (source_event_id set).
  const existing = await sr.entities.CoachInsight.filter(
    { user_id: userId },
    "-generated_at",
    50
  );
  const interpretedIds = new Set(
    existing.map((i: any) => i.source_event_id).filter((id: any) => Boolean(id))
  );

  const pending = events.filter((e: any) => !interpretedIds.has(e.id));
  if (!pending.length) return 0;

  // Selective gating
  const allowed = await canCreateInsight(sr, userId, now);
  if (!allowed) return 0;

  // Surface only the single most notable event this run
  pending.sort((a: any, b: any) =>
    (Number(b.duration_minutes) || 0) - (Number(a.duration_minutes) || 0)
  );
  const focus = pending.slice(0, 1);

  let aiInsights: any[] = [];
  try {
    const res: any = await sr.integrations.Core.InvokeLLM({
      prompt: buildPrompt(focus),
      response_json_schema: {
        type: "object",
        properties: {
          insights: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source_event_id: { type: "string" },
                title: { type: "string" },
                message: { type: "string" },
                confidence: { type: "number" },
              },
            },
          },
        },
        required: ["insights"],
      },
    });
    aiInsights = Array.isArray(res?.insights) ? res.insights : [];
  } catch {
    aiInsights = [];
  }

  const records: any[] = [];
  for (const e of focus) {
    const ai = aiInsights.find((i: any) => i.source_event_id === e.id);
    const valid = ai && typeof ai.title === "string" && ai.title.trim() && typeof ai.message === "string" && ai.message.trim();
    const fallback = deterministicFallback(e);
    const title = valid ? ai.title.trim() : fallback.title;
    const message = valid ? ai.message.trim() : fallback.message;
    const confidence = valid && Number.isFinite(ai.confidence) ? ai.confidence : fallback.confidence;
    const generatedBy = valid ? "ai" : "deterministic";
    const insightType = INSIGHT_TYPE_BY_EVENT[e.event_type] || "glucose_rhythm";

    const fingerprint = buildInsightFingerprint(userId, e.id, insightType, undefined, ANALYSIS_VERSION);

    const dup = await sr.entities.CoachInsight.filter(
      { user_id: userId, insight_fingerprint: fingerprint },
      "-generated_at",
      1
    );
    if (dup.length) continue;

    records.push({
      user_id: userId,
      created_by_id: userId,
      insight_type: insightType,
      insight_category: e.event_type,
      source_event_id: e.id,
      source_event_type: e.event_type,
      title,
      summary: message,
      message,
      priority: 1,
      confidence,
      supporting_metrics: {
        classification: e.classification,
        duration_minutes: e.duration_minutes,
        peak_glucose: e.peak_glucose,
        lowest_glucose: e.lowest_glucose,
      },
      insight_fingerprint: fingerprint,
      generated_by: generatedBy,
      prompt_version: PROMPT_VERSION,
      analysis_version: ANALYSIS_VERSION,
      status: "unread",
      generated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 3 * DAY_MS).toISOString(),
    });
  }

  if (records.length) {
    await sr.entities.CoachInsight.bulkCreate(records);
  }

  return records.length;
}