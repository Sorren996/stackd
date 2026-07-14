export const SPLIT_STRATEGIES = {
  SINGLE: "single",
  SPLIT: "split",
  DECIDE_LATER: "decide_later",
};

export const PLAN_STATUSES = {
  DRAFT: "draft",
  PLANNED: "planned",
  REVIEW_APPROACHING: "review_approaching",
  REVIEW_DUE: "review_due",
  POSTPONED: "postponed",
  COMPLETED: "completed",
  MODIFIED: "modified",
  SKIPPED: "skipped",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
};

const TERMINAL_STATUSES = [
  PLAN_STATUSES.COMPLETED,
  PLAN_STATUSES.MODIFIED,
  PLAN_STATUSES.SKIPPED,
  PLAN_STATUSES.EXPIRED,
  PLAN_STATUSES.CANCELLED,
];

export const REVIEW_OPTIONS = [
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
  { value: 150, label: "2.5 hours" },
  { value: 180, label: "3 hours" },
];

export const POSTPONE_OPTIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
];

const MINUTE_MS = 60 * 1000;

export function calculateFirstUnits(total, percentage) {
  const t = Number(total);
  const p = Number(percentage);
  if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(p)) return "";
  const units = (t * p) / 100;
  return (Math.round(units * 10) / 10).toString();
}

export function calculatePercentage(total, units) {
  const t = Number(total);
  const u = Number(units);
  if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(u) || u <= 0) return "";
  return Math.round((u / t) * 100).toString();
}

export function calculateRemaining(total, first) {
  const t = Number(total);
  const f = Number(first);
  if (!Number.isFinite(t) || !Number.isFinite(f)) return "";
  const remaining = Math.max(0, t - f);
  return (Math.round(remaining * 10) / 10).toString();
}

export function getPlanStatus(plan, now = Date.now()) {
  if (!plan) return PLAN_STATUSES.DRAFT;

  if (TERMINAL_STATUSES.includes(plan.status)) return plan.status;

  if (plan.status === PLAN_STATUSES.POSTPONED) {
    const reviewTime = new Date(plan.current_review_at).getTime();
    if (now >= reviewTime) return PLAN_STATUSES.REVIEW_DUE;
    if (reviewTime - now <= 15 * MINUTE_MS) return PLAN_STATUSES.REVIEW_APPROACHING;
    return PLAN_STATUSES.POSTPONED;
  }

  const reviewTime = new Date(plan.current_review_at || plan.original_review_at).getTime();
  if (!Number.isFinite(reviewTime)) return PLAN_STATUSES.PLANNED;

  if (now >= reviewTime) return PLAN_STATUSES.REVIEW_DUE;
  if (reviewTime - now <= 15 * MINUTE_MS) return PLAN_STATUSES.REVIEW_APPROACHING;

  return PLAN_STATUSES.PLANNED;
}

export function isActivePlan(plan, now = Date.now()) {
  if (!plan) return false;
  const status = getPlanStatus(plan, now);
  return !TERMINAL_STATUSES.includes(status);
}

export function formatReviewDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours === Math.floor(hours)) return `${hours} hour${hours > 1 ? "s" : ""}`;
  return `${hours.toFixed(1)} hours`;
}

export function formatTimeRemaining(targetTime, now = Date.now()) {
  if (!targetTime) return "";
  const diff = new Date(targetTime).getTime() - now;
  if (diff <= 0) return "Review ready now";

  const minutes = Math.round(diff / MINUTE_MS);
  if (minutes < 60) return `Review in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  if (remainingMin) return `Review in ${hours}h ${remainingMin}m`;
  return `Review in ${hours}h`;
}

export function formatElapsedTime(startTime, now = Date.now()) {
  if (!startTime) return "";
  const elapsed = now - new Date(startTime).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / MINUTE_MS));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  if (remainingMin) return `${hours}h ${remainingMin}m ago`;
  return `${hours}h ago`;
}

export function formatClockTime(time) {
  if (!time) return "";
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export const STATUS_LABELS = {
  draft: "Plan saved",
  planned: "Split plan active",
  review_approaching: "Review approaching",
  review_due: "Review ready",
  postponed: "Review postponed",
  completed: "Completed",
  modified: "Modified",
  skipped: "Remaining portion skipped",
  expired: "Expired",
  cancelled: "Cancelled",
};