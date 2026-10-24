// Centralized glucose-status colors, classification, and reference-line
// constants. High = amber, Low = red, In-range = sage green.
// Used across all glucose UI so status colors stay consistent everywhere.





export const GLUCOSE_STATUS_COLORS = {
  inRange: "#4d5742", // sage — in-range/positive (WCAG 6.8:1)
  high: "#d58814ff",   // mustard — above range (WCAG 5.3:1)
  low: "#d33418ff",    // clay red — below range (WCAG 5.9:1)
};

// Configurable "High" glucose reference line.
export const HIGH_REFERENCE_DEFAULT = 250;
export const HIGH_REFERENCE_MIN = 140;
export const HIGH_REFERENCE_MAX = 400;
export const HIGH_REFERENCE_STEP = 10;

// Fixed low glucose reference line.
export const FIXED_LOW_REFERENCE = 40;

export function classifyGlucose(value, targetLow, targetHigh) {
  if (!Number.isFinite(value)) return "unknown";
  if (value < targetLow) return "low";
  if (value > targetHigh) return "high";
  return "inRange";
}

export function getGlucoseColor(value, targetLow, targetHigh) {
  const status = classifyGlucose(value, targetLow, targetHigh);
  if (status === "unknown") return GLUCOSE_STATUS_COLORS.inRange;
  return GLUCOSE_STATUS_COLORS[status];
}

export function getGlucoseStatusLabel(value, targetLow, targetHigh) {
  const status = classifyGlucose(value, targetLow, targetHigh);
  if (status === "low") return "Below comfort zone";
  if (status === "high") return "Above comfort zone";
  if (status === "inRange") return "In comfort zone";
  return "No data";
}

// ── Current Glucose card: zone + direction + note copy ──────────────────────
// These drive the Home screen's Current Glucose status statements. They
// describe the data only — never the person, never a treatment.

// Clinically urgent low (mg/dL). A reading below this is surfaced directly and
// is never softened by the personal target low.
export const URGENT_LOW_THRESHOLD = 55;

// Direction is read from the most recent ~15–20 minutes of readings (the last
// 3–4 points), comparing earliest to latest. A wider window abstains rather
// than describing an old move as current.
const DIRECTION_WINDOW_MINUTES = 20;

// Zone for the Current Glucose card. Urgent low takes precedence over the
// personal target low so a critically low reading never reads as ordinary.
// When the reading is stale, urgent copy is withheld and an in-range reading
// falls back to a neutral label.
export function getCurrentGlucoseZone(value, targetLow, targetHigh, stale = false) {
  if (!Number.isFinite(value)) return { zone: "none", label: "No data" };
  if (!stale && value < URGENT_LOW_THRESHOLD) return { zone: "urgentLow", label: "Urgent low" };
  if (value < targetLow) return { zone: "below", label: "Below comfort zone" };
  if (value > targetHigh) return { zone: "above", label: "Above comfort zone" };
  if (stale) return { zone: "inRange", label: "Waiting for data" };
  return { zone: "inRange", label: "In comfort zone" };
}

// Directional phrase from the last 3–4 readings, earliest vs latest:
//   within ±5        → "holding steady"
//   up more than 5   → "drifting up"  (more than 15 → "climbing")
//   down more than 5 → "easing down"  (more than 15 → "falling")
// Returns null (omit the line) when there are fewer than 3 readings, the
// readings are stale, or the window is too wide to call "recent".
export function computeGlucoseDirection(readings, { stale = false } = {}) {
  if (stale || !Array.isArray(readings)) return null;
  const points = readings
    .filter((r) => r && r.source !== "system")
    .map((r) => ({ t: new Date(r.recorded_at).getTime(), v: Number(r.value) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  if (points.length < 3) return null;

  const recent = points.slice(-4);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const spanMinutes = (last.t - first.t) / 60000;
  if (spanMinutes <= 0 || spanMinutes > DIRECTION_WINDOW_MINUTES) return null;

  const delta = last.v - first.v;
  if (Math.abs(delta) <= 5) return "holding steady";
  if (delta > 15) return "climbing";
  if (delta > 5) return "drifting up";
  if (delta < -15) return "falling";
  return "easing down";
}

// Direction phrase for display. An upward move while below the comfort zone
// reads as an encouraging "coming back up" rather than "drifting up".
export function describeDirection(direction, zone) {
  if (!direction) return null;
  if (zone === "below" && (direction === "drifting up" || direction === "climbing")) {
    return "coming back up";
  }
  return direction;
}

// The one observational line shown under the reading, or null. Urgent low gets
// a direct attention line (no softeners, no cheer, no treatment advice); a
// below-zone reading gets a single calm observation. Stale data shows nothing.
export function getCurrentGlucoseNote(zone, direction, stale = false) {
  if (stale) return null;
  if (zone === "urgentLow") {
    const base = "Your glucose is critically low right now. Act immediately.";
    const trendingDown =
      direction === "holding steady" || direction === "easing down" || direction === "falling";
    return trendingDown ? `${base} Still trending down.` : base;
  }
  if (zone === "below") return "Watch your next few readings.";
  return null;
}

// Read the configurable High reference from localStorage (cache of server setting).
export function readHighReference() {
  if (typeof window === "undefined") return HIGH_REFERENCE_DEFAULT;
  const v = Number(window.localStorage.getItem("high_glucose_reference"));
  if (!Number.isFinite(v)) return HIGH_REFERENCE_DEFAULT;
  const clamped = Math.max(HIGH_REFERENCE_MIN, Math.min(HIGH_REFERENCE_MAX, v));
  return Math.round(clamped / HIGH_REFERENCE_STEP) * HIGH_REFERENCE_STEP;
}

// Build the list of selectable High reference values (140–400 step 10).
export function getHighReferenceOptions() {
  const options = [];
  for (let v = HIGH_REFERENCE_MIN; v <= HIGH_REFERENCE_MAX; v += HIGH_REFERENCE_STEP) {
    options.push(v);
  }
  return options;
}

// Resolve vertical positions for reference-line labels so close thresholds
// never overlap. Each label keeps its true line Y; only the text shifts when
// a same-side neighbor is too close, with the displacement exposed so a tiny
// leader can be drawn. Left and right columns are resolved independently.
export function resolveReferenceLabelPositions(labels, toY, opts = {}) {
  const minGap = opts.minGap ?? 14;
  const bySide = { left: [], right: [] };
  labels.forEach((l) => {
    const naturalY = toY(l.value);
    bySide[l.side].push({ ...l, naturalY, labelY: naturalY });
  });

  for (const side of ["left", "right"]) {
    const arr = bySide[side].sort((a, b) => a.naturalY - b.naturalY);
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const cur = arr[i];
      if (cur.labelY - prev.labelY < minGap) {
        cur.labelY = prev.labelY + minGap;
      }
    }
  }

  const result = {};
  [...bySide.left, ...bySide.right].forEach((l) => {
    result[l.id] = { y: l.labelY, delta: l.labelY - l.naturalY };
  });
  return result;
}