// The only place a trend arrow may come from.
//
// A reading's `trend` is the categorical value the CGM itself reported
// (Dexcom Share/API: DoubleUp … DoubleDown, Flat, None). It is copied through
// unchanged and mapped here; nothing is ever computed, interpolated or inferred
// from a value comparison, and there is no fallback direction.
//
// null means "say nothing about direction", which is the only truthful answer
// for a manual reading, a missing field, "None", "NotComputable",
// "RateOutOfRange", or any string this file does not recognise.

export type TrendDirection = "up" | "flat" | "down";

import { trendGlyph } from './trendPresentation.ts';

// Alert eligibility keeps its original accepted sensor categories.
const TREND_KEYS = new Set(['doubleup', 'singleup', 'fortyfiveup', 'flat', 'fortyfivedown', 'singledown', 'doubledown']);

/** The recognised trend key, or null. Never guesses. */
export function normalizeTrendWord(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.toLowerCase().replace(/[^a-z]/g, "");
  return TREND_KEYS.has(key) ? key : null;
}

/**
 * The arrow a category is allowed to show, or null when the source did not
 * support one. A pace alert is never contradicted by its own arrow: "falling
 * fast" shows nothing rather than a rising figure.
 */
export function trendArrowFor(category: string, trend: unknown): string | null {
  return trendGlyph(trend);
}