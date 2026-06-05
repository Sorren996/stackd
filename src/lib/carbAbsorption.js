export const FOOD_CATEGORIES = ["Fast Absorbing", "Medium Absorbing", "Slow Absorbing"];

export const ABSORPTION_PROFILES = {
  fast:   { onsetMin: 5,  peakMin: 30,  durationMin: 90  },
  medium: { onsetMin: 15, peakMin: 65,  durationMin: 150 },
  slow:   { onsetMin: 25, peakMin: 120, durationMin: 300 },
};

export const PROFILE_COLORS = {
  fast:   "#ef4444",
  medium: "#f59e0b",
  slow:   "#a78bfa",
};

export const FOOD_DATABASE = [
  // Fast Absorbing
  { name: "White Bread",     carbs: 15, gi: 75, category: "Fast Absorbing",   profile: "fast"   },
  { name: "Candy",           carbs: 25, gi: 80, category: "Fast Absorbing",   profile: "fast"   },
  { name: "Apple Juice",     carbs: 30, gi: 40, category: "Fast Absorbing",   profile: "fast"   },
  { name: "Regular Soda",    carbs: 39, gi: 65, category: "Fast Absorbing",   profile: "fast"   },
  { name: "Glucose Tablets", carbs:  4, gi:100, category: "Fast Absorbing",   profile: "fast"   },
  { name: "White Rice",      carbs: 45, gi: 72, category: "Fast Absorbing",   profile: "fast"   },
  { name: "Sports Drink",    carbs: 21, gi: 78, category: "Fast Absorbing",   profile: "fast"   },
  // Medium Absorbing
  { name: "Oatmeal",              carbs: 27, gi: 55, category: "Medium Absorbing", profile: "medium" },
  { name: "Banana",               carbs: 27, gi: 51, category: "Medium Absorbing", profile: "medium" },
  { name: "Brown Rice",           carbs: 45, gi: 50, category: "Medium Absorbing", profile: "medium" },
  { name: "Boiled Potato",        carbs: 30, gi: 78, category: "Medium Absorbing", profile: "medium" },
  { name: "Whole Wheat Bread",    carbs: 15, gi: 50, category: "Medium Absorbing", profile: "medium" },
  { name: "Corn",                 carbs: 25, gi: 52, category: "Medium Absorbing", profile: "medium" },
  { name: "Apple",                carbs: 25, gi: 36, category: "Medium Absorbing", profile: "medium" },
  { name: "Orange",               carbs: 21, gi: 43, category: "Medium Absorbing", profile: "medium" },
  // Slow Absorbing
  { name: "Pizza",                carbs: 35, gi: 45, category: "Slow Absorbing",   profile: "slow"   },
  { name: "Pasta",                carbs: 40, gi: 50, category: "Slow Absorbing",   profile: "slow"   },
  { name: "Whole Wheat Pasta",    carbs: 37, gi: 42, category: "Slow Absorbing",   profile: "slow"   },
  { name: "Black Beans",          carbs: 20, gi: 30, category: "Slow Absorbing",   profile: "slow"   },
  { name: "Lentils",              carbs: 18, gi: 32, category: "Slow Absorbing",   profile: "slow"   },
  { name: "Ice Cream",            carbs: 28, gi: 51, category: "Slow Absorbing",   profile: "slow"   },
  { name: "Mixed Meal",           carbs: 50, gi: 38, category: "Slow Absorbing",   profile: "slow"   },
];

/** Generate a time-series absorption activity curve (0–1) for a carb entry */
export function generateCarbCurve(entry) {
  if (entry.is_custom || !entry.absorption_profile) return [];
  const profile = ABSORPTION_PROFILES[entry.absorption_profile];
  if (!profile) return [];

  const start     = new Date(entry.consumed_at).getTime();
  const step      = 3 * 60000;
  const onsetMs   = profile.onsetMin   * 60000;
  const peakMs    = profile.peakMin    * 60000;
  const durationMs = profile.durationMin * 60000;
  const end = start + durationMs;
  const result = [];

  for (let t = start; t <= end; t += step) {
    const elapsed = t - start;
    let activity;
    if (elapsed < onsetMs) {
      activity = (elapsed / onsetMs) * 0.15;
    } else if (elapsed <= peakMs) {
      activity = 0.15 + 0.85 * ((elapsed - onsetMs) / (peakMs - onsetMs));
    } else {
      activity = Math.max(0, 1 - ((elapsed - peakMs) / (durationMs - peakMs)));
    }
    result.push({ time: t, activity: Math.max(0, Math.min(1, activity)) });
  }
  return result;
}

/** Total carbohydrates currently being absorbed (grams) */
export function getActiveCarbsNow(entries) {
  const now = Date.now();
  return entries.reduce((sum, entry) => {
    if (entry.is_custom) return sum;
    const curve = generateCarbCurve(entry);
    if (!curve.length) return sum;
    if (now < curve[0].time || now > curve[curve.length - 1].time) return sum;
    let lo = 0;
    for (let i = 0; i < curve.length - 1; i++) {
      if (curve[i].time <= now && curve[i + 1].time >= now) { lo = i; break; }
    }
    const hi = Math.min(lo + 1, curve.length - 1);
    const ratio = hi === lo ? 0 : (now - curve[lo].time) / (curve[hi].time - curve[lo].time);
    const activity = curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);
    return sum + activity * entry.carbs;
  }, 0);
}

/** Sum of all carbs consumed today */
export function getTotalCarbsToday(entries) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return entries
    .filter((e) => new Date(e.consumed_at) >= today)
    .reduce((sum, e) => sum + e.carbs, 0);
}