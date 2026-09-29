// Shared page geometry, palette and formatting for the typeset reports PDF.

// ── A4 portrait (points) + hard safe margins ────────────────────────────────
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN_X = 40;
export const MARGIN_Y = 48;

// The content box. Nothing — including the footer — may paint outside it.
export const BOX = {
  x: MARGIN_X,
  y: MARGIN_Y,
  w: PAGE_W - MARGIN_X * 2,
  right: PAGE_W - MARGIN_X,
  bottom: PAGE_H - MARGIN_Y,
};

// The footer lives inside the bottom of the content box; flowing content
// stops above it with a clear gap.
export const FOOTER_RULE_Y = BOX.bottom - 18;
export const FLOW_BOTTOM = FOOTER_RULE_Y - 10;

// Typography metrics: line box = size * LINE, baseline = top + size * ASCENT.
export const LINE = 1.28;
export const ASCENT = 0.78;

// ── Ink & grid (all WCAG AA on white) ───────────────────────────────────────
export const INK = [26, 26, 26];
export const GRAY = [72, 72, 72];
export const MUTED = [96, 96, 96];
export const FAINT = [120, 120, 120];
export const GRID = [232, 232, 232];
export const HAIR = [206, 206, 206];
export const CURVE = [40, 108, 140];

export const RANGE = {
  veryLow: [176, 58, 46],
  low: [214, 69, 65],
  target: [63, 162, 79],
  high: [224, 166, 32],
  veryHigh: [209, 138, 18],
};
export const RANGE_LABEL = {
  veryLow: "Very Low",
  low: "Low",
  target: "Target",
  high: "High",
  veryHigh: "Very High",
};
export const BAND_ORDER = ["veryLow", "low", "target", "high", "veryHigh"];

export const WEEK_COLORS = [
  [120, 120, 120], [100, 150, 120], [145, 120, 170], [200, 140, 60],
  [80, 130, 170], [170, 100, 100], [90, 150, 150],
];
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const FOOTER_TEXT =
  "Describes your own logged data. Not medical advice. Not a dose recommendation.";

// ── Formatting ──────────────────────────────────────────────────────────────
export function fmtDate(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDay(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function fmtTime(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function targetOf(reports) {
  return { low: reports?.targetLow ?? 70, high: reports?.targetHigh ?? 180 };
}