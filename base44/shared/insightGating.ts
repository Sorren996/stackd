// Centralized gating for CoachInsight creation. Keeps insights selective so the
// user receives a few meaningful observations rather than a steady stream:
// at most MAX_INSIGHTS_PER_DAY per rolling 24h, spaced at least
// MIN_SPACING_HOURS apart. Both generation sources (runCoachReview and
// interpretGlucoseEvents) call canCreateInsight before writing a new record.

const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const MAX_INSIGHTS_PER_DAY = 2;
// Preferred spacing between insights (hours). The user asked for 8h minimum,
// preferably 12-16h; we enforce 12h at generation so surfaced insights are
// naturally well-spaced, while the frontend surfacing gate uses an 8h minimum.
export const MIN_SPACING_HOURS = 12;

export async function canCreateInsight(sr: any, userId: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const recent = await sr.entities.CoachInsight.filter(
    { user_id: userId, generated_at: { $gte: since } },
    '-generated_at', 10
  );
  if (!recent || recent.length === 0) return true;
  if (recent.length >= MAX_INSIGHTS_PER_DAY) return false;
  const lastGen = recent[0].generated_at ? new Date(recent[0].generated_at).getTime() : 0;
  if (now.getTime() - lastGen < MIN_SPACING_HOURS * HOUR_MS) return false;
  return true;
}