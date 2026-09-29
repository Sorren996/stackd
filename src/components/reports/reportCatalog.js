// Report-type catalog for the Stackd Reports system. Each entry carries the
// picker checkbox label + a one-line plain-language description (no clinical
// jargon), and a stable id used by the backend + viewer.

export const REPORT_TYPES = [
  {
    id: "overview",
    label: "Overview",
    description: "Headline stats, time in range, and your full-range glucose curve at a glance.",
  },
  {
    id: "patterns",
    label: "Patterns",
    description: "Your best and hardest days side by side, plus recurring highs and lows that keep showing up.",
  },
  {
    id: "overlay",
    label: "Overlay",
    description: "Every day of each week layered on one 24-hour chart so you can compare weekdays at a glance.",
  },
  {
    id: "daily",
    label: "Daily",
    description: "A full day-by-day walk through your glucose, with meals and support doses marked on each day.",
  },
  {
    id: "compare",
    label: "Compare",
    description: "This stretch of time against the same stretch just before it, side by side.",
  },
  {
    id: "dailyStats",
    label: "Daily Statistics",
    description: "A Monday–Sunday statistical breakdown, split into daytime and overnight.",
  },
  {
    id: "hourlyStats",
    label: "Hourly Statistics",
    description: "The same statistics, hour by hour, across all 24 hours of the day.",
  },
  {
    id: "agp",
    label: "AGP",
    description: "The standard glucose profile chart against clinical goals, plus a week-by-week texture view.",
  },
];

export const REPORT_TYPE_BY_ID = Object.fromEntries(REPORT_TYPES.map((r) => [r.id, r]));

// Sort order for rendering paginated report pages in the viewer.
export const REPORT_ORDER = [
  "overview",
  "patterns",
  "overlay",
  "daily",
  "compare",
  "dailyStats",
  "hourlyStats",
  "agp",
];

export const DISCLAIMER =
  "Describes your own logged data. Not medical advice. Not a dose recommendation.";