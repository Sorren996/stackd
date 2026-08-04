// Frontend surfacing gate for CoachInsights. From the unread list, selects the
// ones to actually surface so the user sees at most MAX_PER_DAY per 24h, each
// spaced at least MIN_GAP_HOURS apart (newest-first). This is a safety net on
// top of the backend generation gate; it also keeps any older accumulated
// unread insights from flooding the chat on reopen.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const MAX_PER_DAY = 2;
const MIN_GAP_HOURS = 8;

export function selectSurfaceableInsights(insights, now = new Date()) {
  const ts = (i) => new Date(i.generated_at || i.created_date || i.created_at).getTime();
  const valid = (insights || [])
    .filter((i) => !i.expires_at || new Date(i.expires_at).getTime() > now.getTime())
    .sort((a, b) => ts(b) - ts(a));
  const dayAgo = now.getTime() - DAY;
  const kept = [];
  for (const ins of valid) {
    const withinDay = kept.filter((k) => ts(k) > dayAgo);
    if (withinDay.length >= MAX_PER_DAY) break;
    const t = ts(ins);
    const tooClose = kept.some((k) => Math.abs(ts(k) - t) < MIN_GAP_HOURS * HOUR);
    if (tooClose) continue;
    kept.push(ins);
  }
  return kept;
}