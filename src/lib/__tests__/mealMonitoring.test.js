import { describe, it, expect } from "vitest";
import {
  hasDelayedRise,
  getHighProteinFatMonitoringStatus,
  getDelayedRiseCautionStatus,
  HIGH_PROTEIN_FAT_MONITORING_HOURS,
} from "../mealMonitoring";

const MONITORING_MS = HIGH_PROTEIN_FAT_MONITORING_HOURS * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

// Helper: a qualifying high-fat meal at a given offset from now.
function fatMeal(offsetMs, overrides = {}) {
  return {
    id: `meal_${offsetMs}`,
    food_name: "Pizza",
    carbs: 60,
    fat_grams: 45,
    protein_grams: 20,
    consumed_at: new Date(Date.now() + offsetMs).toISOString(),
    ...overrides,
  };
}

// Helper: a non-qualifying low-fat meal.
function plainMeal(offsetMs, overrides = {}) {
  return {
    id: `plain_${offsetMs}`,
    food_name: "Apple",
    carbs: 20,
    fat_grams: 0,
    protein_grams: 0,
    consumed_at: new Date(Date.now() + offsetMs).toISOString(),
    ...overrides,
  };
}

describe("hasDelayedRise", () => {
  it("qualifies when fat >= 40g", () => {
    expect(hasDelayedRise({ fat_grams: 40, protein_grams: 0, carbs: 0 })).toBe(true);
    expect(hasDelayedRise({ fat_grams: 45, protein_grams: 10, carbs: 30 })).toBe(true);
  });

  it("qualifies when protein >= 30g with carbs", () => {
    expect(hasDelayedRise({ fat_grams: 0, protein_grams: 30, carbs: 10 })).toBe(true);
    expect(hasDelayedRise({ fat_grams: 5, protein_grams: 35, carbs: 5 })).toBe(true);
  });

  it("qualifies when protein >= 75g with no carbs", () => {
    expect(hasDelayedRise({ fat_grams: 0, protein_grams: 75, carbs: 0 })).toBe(true);
  });

  it("does not qualify for low fat/protein", () => {
    expect(hasDelayedRise({ fat_grams: 10, protein_grams: 15, carbs: 30 })).toBe(false);
    expect(hasDelayedRise({ fat_grams: 0, protein_grams: 50, carbs: 0 })).toBe(false);
  });

  it("handles missing/invalid values safely", () => {
    expect(hasDelayedRise(null)).toBe(false);
    expect(hasDelayedRise({})).toBe(false);
    expect(hasDelayedRise({ fat_grams: NaN, protein_grams: 30, carbs: 10 })).toBe(false);
    expect(hasDelayedRise({ fat_grams: "abc", protein_grams: 30, carbs: 10 })).toBe(false);
  });
});

describe("getHighProteinFatMonitoringStatus — expiry lifecycle", () => {
  it("1. EXPIRY WITHOUT RELOAD: active when within window, inactive after window ends", () => {
    const meal = fatMeal(-1 * HOUR); // eaten 1h ago
    const duringWindow = getHighProteinFatMonitoringStatus([meal], Date.now());
    expect(duringWindow.isActive).toBe(true);
    expect(duringWindow.qualifyingCount).toBe(1);
    expect(duringWindow.endTime).toBeGreaterThan(Date.now());

    // Simulate time advancing past the window end (no reload, just recompute).
    const afterWindow = getHighProteinFatMonitoringStatus([meal], Date.now() + 8 * HOUR + MIN);
    expect(afterWindow.isActive).toBe(false);
    expect(afterWindow.qualifyingCount).toBe(0);
    expect(afterWindow.endTime).toBeNull();
  });

  it("2. RELOAD/RESUME WITH STALE STATE: meal whose window ended while app was closed is inactive", () => {
    // Meal was eaten 10 hours ago — window (8h) ended 2 hours ago.
    const staleMeal = fatMeal(-10 * HOUR);
    const status = getHighProteinFatMonitoringStatus([staleMeal], Date.now());
    expect(status.isActive).toBe(false);
    expect(status.remainingMs).toBe(0);
  });

  it("3. MEAL EDIT: editing fat below threshold deactivates the alert", () => {
    const meal = fatMeal(-1 * HOUR);
    expect(getHighProteinFatMonitoringStatus([meal]).isActive).toBe(true);

    // User edits the meal to remove fat — no longer qualifies.
    const edited = { ...meal, fat_grams: 5, protein_grams: 10 };
    expect(getHighProteinFatMonitoringStatus([edited]).isActive).toBe(false);
  });

  it("3b. MEAL DELETE: removing the qualifying meal deactivates the alert", () => {
    const meal = fatMeal(-1 * HOUR);
    expect(getHighProteinFatMonitoringStatus([meal]).isActive).toBe(true);

    // User deletes the meal — empty array.
    expect(getHighProteinFatMonitoringStatus([]).isActive).toBe(false);
  });

  it("4. MISSING SOURCE/TIMESTAMP: invalid consumed_at is excluded, no invented detection", () => {
    const noTimestamp = { ...fatMeal(-1 * HOUR), consumed_at: null };
    expect(getHighProteinFatMonitoringStatus([noTimestamp]).isActive).toBe(false);

    const invalidTimestamp = { ...fatMeal(-1 * HOUR), consumed_at: "not-a-date" };
    const status = getHighProteinFatMonitoringStatus([invalidTimestamp]);
    expect(status.isActive).toBe(false);

    // Mixed: one valid, one invalid — only the valid one counts.
    const valid = fatMeal(-1 * HOUR);
    const mixed = getHighProteinFatMonitoringStatus([valid, invalidTimestamp]);
    expect(mixed.isActive).toBe(true);
    expect(mixed.qualifyingCount).toBe(1);
  });

  it("5. MULTIPLE MEALS: one expiring does not clear another genuinely active alert", () => {
    const mealA = fatMeal(-7 * HOUR); // expires in ~1h
    const mealB = fatMeal(-1 * HOUR); // expires in ~7h

    // Both active now.
    const now = getHighProteinFatMonitoringStatus([mealA, mealB], Date.now());
    expect(now.isActive).toBe(true);
    expect(now.qualifyingCount).toBe(2);

    // Time advances past mealA's window end (~1h) but before mealB's (~7h) —
    // mealB keeps the alert active.
    const later = getHighProteinFatMonitoringStatus([mealA, mealB], Date.now() + 2 * HOUR);
    expect(later.isActive).toBe(true);
    expect(later.qualifyingCount).toBe(1);

    // Both expired → inactive.
    const muchLater = getHighProteinFatMonitoringStatus([mealA, mealB], Date.now() + 9 * HOUR);
    expect(muchLater.isActive).toBe(false);
  });

  it("merges multiple meals into the latest end time", () => {
    const mealA = fatMeal(-5 * HOUR); // ends in ~3h
    const mealB = fatMeal(-1 * HOUR); // ends in ~7h
    const status = getHighProteinFatMonitoringStatus([mealA, mealB], Date.now());
    expect(status.endTime).toBeGreaterThan(Date.now() + 6 * HOUR);
  });

  it("non-qualifying meals never trigger the alert", () => {
    const plain = plainMeal(-1 * HOUR);
    expect(getHighProteinFatMonitoringStatus([plain]).isActive).toBe(false);
  });

  it("empty or null input is inactive", () => {
    expect(getHighProteinFatMonitoringStatus([]).isActive).toBe(false);
    expect(getHighProteinFatMonitoringStatus(null).isActive).toBe(false);
    expect(getHighProteinFatMonitoringStatus(undefined).isActive).toBe(false);
  });
});

describe("getDelayedRiseCautionStatus — card lifecycle", () => {
  it("active within window, inactive after expiry", () => {
    const meal = fatMeal(-2 * HOUR);
    const active = getDelayedRiseCautionStatus([meal], Date.now());
    expect(active.active).toBe(true);
    expect(active.meals).toHaveLength(1);

    const expired = getDelayedRiseCautionStatus([meal], Date.now() + 9 * HOUR);
    expect(expired.active).toBe(false);
    expect(expired.meals).toHaveLength(0);
  });

  it("resolved/expired meals are not included in the meals list", () => {
    const meal = fatMeal(-10 * HOUR); // expired
    const status = getDelayedRiseCautionStatus([meal], Date.now());
    expect(status.active).toBe(false);
    expect(status.meals).toHaveLength(0);
  });

  it("multiple qualifying meals merge into one active card", () => {
    const mealA = fatMeal(-1 * HOUR);
    const mealB = fatMeal(-3 * HOUR);
    const status = getDelayedRiseCautionStatus([mealA, mealB], Date.now());
    expect(status.active).toBe(true);
    expect(status.meals).toHaveLength(2);
  });

  it("one expired meal does not keep the card active when another is still active", () => {
    const expired = fatMeal(-10 * HOUR);
    const active = fatMeal(-1 * HOUR);
    const status = getDelayedRiseCautionStatus([expired, active], Date.now());
    expect(status.active).toBe(true);
    expect(status.meals).toHaveLength(1);
    expect(status.meals[0].id).toBe(active.id);
  });

  it("invalid timestamps are excluded from the card", () => {
    const noTime = { ...fatMeal(-1 * HOUR), consumed_at: null };
    const badTime = { ...fatMeal(-1 * HOUR), consumed_at: "invalid" };
    const status = getDelayedRiseCautionStatus([noTime, badTime], Date.now());
    expect(status.active).toBe(false);
    expect(status.meals).toHaveLength(0);
  });
});