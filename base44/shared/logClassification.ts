// Deterministic-first classification for carb and insulin logs.
// Handles obvious cases without invoking the LLM, preserving the exact same
// classification categories the AI produces. Only genuinely ambiguous cases
// fall through to AI. This dramatically reduces integration-credit consumption
// while maintaining identical user-facing behavior for clear-cut logs.

const MINUTE_MS = 60 * 1000;

// Quick-sugar food keywords that indicate rescue carbs when glucose is low.
const QUICK_SUGAR_KEYWORDS = [
  "gummy", "gummies", "juice", "glucose tablet", "glucose gel", "candy",
  "skittle", "smarties", "airhead", "starburst", "jelly bean", "honey",
  "sugar", "soda", "coke", "sprite", "mountain dew", "regular pop",
  "marshmallow", "fruit snack", "raisin",
];

const MEAL_KEYWORDS = [
  "breakfast", "lunch", "dinner", "brunch", "supper",
  "pizza", "burger", "sandwich", "taco", "burrito", "pasta", "spaghetti",
  "chicken", "steak", "salmon", "shrimp", "rice", "noodle", "soup",
  "salad", "wings", "brisket", "ribs", "chinese", "thai", "indian",
  "mexican", "sushi", "ramen", "curry", "stew", "chili", "casserole",
  "quesadilla", "fajita", "enchilada", "lasagna", "risotto", "oatmeal",
  "pancake", "waffle", "omelet", "omelette", "scramble",
];

export interface ClassificationContext {
  logTime: number;
  carbs?: number;
  insulinType?: string;
  units?: number;
  isHighProteinFat?: boolean;
  foodName?: string;
  glucoseReadings: { value: number; recorded_at: string }[];
  nearbyCarbs: { id: string; food_name: string; carbs: number; consumed_at: string }[];
  nearbyDoses: { id: string; insulin_type: string; units: number; administered_at: string }[];
}

export interface ClassificationResult {
  classification: string;
  reasoning: string;
  confident: boolean; // false = ambiguous, should fall back to AI
}

function glucoseAtTime(readings: { value: number; recorded_at: string }[], targetTime: number, windowMs = 20 * MINUTE_MS): { value: number; trend: string } | null {
  let nearest: { value: number; dist: number } | null = null;
  for (const r of readings) {
    const t = new Date(r.recorded_at).getTime();
    if (!Number.isFinite(t)) continue;
    const dist = Math.abs(t - targetTime);
    if (dist > 30 * MINUTE_MS) continue;
    if (!nearest || dist < nearest.dist) nearest = { value: Number(r.value), dist };
  }
  if (!nearest) return null;

  // Compute trend from the few readings before the target
  const before = readings
    .map((r) => ({ t: new Date(r.recorded_at).getTime(), v: Number(r.value) }))
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.v) && r.t <= targetTime)
    .sort((a, b) => a.t - b.t);

  let trend = "unknown";
  if (before.length >= 2) {
    const first = before[0];
    const last = before[before.length - 1];
    const dt = (last.t - first.t) / MINUTE_MS;
    if (dt > 0) {
      const slope = (last.v - first.v) / dt;
      if (slope > 0.5) trend = "rising";
      else if (slope < -0.5) trend = "falling";
      else trend = "steady";
    }
  }

  return { value: nearest.value, trend };
}

function isQuickSugar(foodName: string): boolean {
  const lower = String(foodName || "").toLowerCase();
  return QUICK_SUGAR_KEYWORDS.some((kw) => lower.includes(kw));
}

function isMealFood(foodName: string): boolean {
  const lower = String(foodName || "").toLowerCase();
  return MEAL_KEYWORDS.some((kw) => lower.includes(kw));
}

// Deterministic carb classification — handles the clear cases.
export function classifyCarbDeterministic(ctx: ClassificationContext): ClassificationResult | null {
  const { logTime, carbs = 0, foodName = "", glucoseReadings, nearbyDoses } = ctx;

  const glucose = glucoseAtTime(glucoseReadings, logTime);
  const glucoseLow = glucose != null && glucose.value <= 75;
  const glucoseTrendingDown = glucose != null && glucose.trend === "falling";
  const quickSugar = isQuickSugar(foodName);

  // Rescue carbs: small amount of quick-sugar when glucose is low or falling
  if (carbs <= 15 && quickSugar && (glucoseLow || glucoseTrendingDown)) {
    return {
      classification: "rescue_carbs",
      reasoning: "Quick-sugar nourishment while your glucose was dipping — a gentle lift to bring things back toward comfortable.",
      confident: true,
    };
  }

  // Large amount is never rescue_carbs (per AI guidance)
  // Meal: 30g+ with real food, or explicit meal keywords
  if (carbs >= 30 || (isMealFood(foodName) && carbs >= 20)) {
    return {
      classification: "meal",
      reasoning: "A substantial eating occasion worth noting on your wellness journey.",
      confident: true,
    };
  }

  // Snack: under 30g, not rescue_carbs
  if (carbs < 30 && carbs > 0 && !quickSugar) {
    return {
      classification: "snack",
      reasoning: "A lighter bite between meals — a small moment of nourishment.",
      confident: true,
    };
  }

  // Ambiguous cases — fall back to AI:
  // - 15-30g with unclear context
  // - Quick-sugar but glucose is normal/high (could be a treat or a meal)
  // - Very small amount with no glucose context
  return null;
}

// Deterministic insulin classification — handles the clear cases.
export function classifyInsulinDeterministic(ctx: ClassificationContext): ClassificationResult | null {
  const { logTime, nearbyCarbs, glucoseReadings } = ctx;

  // Check for a nearby carb entry within the meal window (±90 min)
  const mealWindowMs = 90 * MINUTE_MS;
  const hasNearbyFood = nearbyCarbs.some((c) => {
    const t = new Date(c.consumed_at).getTime();
    return Number.isFinite(t) && Math.abs(t - logTime) <= mealWindowMs;
  });

  const glucose = glucoseAtTime(glucoseReadings, logTime);
  const glucoseHigh = glucose != null && glucose.value > 200;
  const glucoseVeryHigh = glucose != null && glucose.value > 250;
  const glucoseNormal = glucose != null && glucose.value >= 80 && glucose.value <= 180;

  // Meal insulin: food was logged nearby
  if (hasNearbyFood) {
    return {
      classification: "meal",
      reasoning: "Support timed alongside a food occasion — a thoughtful pairing.",
      confident: true,
    };
  }

  // Rescue insulin: very high glucose, no nearby food
  if (glucoseVeryHigh && !hasNearbyFood) {
    return {
      classification: "rescue_insulin",
      reasoning: "An unplanned dose when glucose was well above your comfortable range — a gentle nudge back toward balance.",
      confident: true,
    };
  }

  // Correction: high glucose, no nearby food
  if (glucoseHigh && !hasNearbyFood) {
    return {
      classification: "correction",
      reasoning: "A gentle correction to guide glucose back toward your comfortable range.",
      confident: true,
    };
  }

  // Ambiguous cases — fall back to AI:
  // - No nearby food and glucose is normal/unknown
  // - Glucose is mildly elevated (180-200) with no food
  // - Multiple overlapping contexts
  return null;
}