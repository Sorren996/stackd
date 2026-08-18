// Single source of truth for analysis logic versions and retry limits.
// Bump these when analysis logic meaningfully changes so stored events can
// be re-evaluated and deduplicated correctly.

export const ANALYSIS_VERSION = "1.0.0";
export const PROMPT_VERSION = "1.0.0";

export const MAX_JOB_ATTEMPTS = 5;
// Exponential retry base in seconds: 30s, 60s, 120s, 240s, 480s.
export const RETRY_BASE_SECONDS = 30;

// Insight cooldowns (milliseconds).
export const INDIVIDUAL_EVENT_COOLDOWN_MS = Infinity; // show an individual event insight once
export const DEVELOPING_PATTERN_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const POSITIVE_TREND_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // a few times per week

// Evidence thresholds for repeated patterns.
export const PATTERN_THRESHOLD_HINT = 2;
export const PATTERN_THRESHOLD_DEVELOPING = 3;
export const PATTERN_THRESHOLD_ESTABLISHED = 5;