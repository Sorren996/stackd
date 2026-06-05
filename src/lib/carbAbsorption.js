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
  // ── Fast Absorbing ──────────────────────────────────────────────────────────
  { name: "White Bread",          carbs: 15, gi: 75,  category: "Fast Absorbing", profile: "fast" },
  { name: "Candy",                carbs: 25, gi: 80,  category: "Fast Absorbing", profile: "fast" },
  { name: "Apple Juice",          carbs: 30, gi: 44,  category: "Fast Absorbing", profile: "fast" },
  { name: "Regular Soda",         carbs: 39, gi: 65,  category: "Fast Absorbing", profile: "fast" },
  { name: "Glucose Tablets",      carbs:  4, gi: 100, category: "Fast Absorbing", profile: "fast" },
  { name: "White Rice",           carbs: 45, gi: 73,  category: "Fast Absorbing", profile: "fast" },
  { name: "Sports Drink",         carbs: 21, gi: 78,  category: "Fast Absorbing", profile: "fast" },
  { name: "Plain White Bagel",    carbs: 48, gi: 72,  category: "Fast Absorbing", profile: "fast" },
  { name: "French Fries",         carbs: 45, gi: 75,  category: "Fast Absorbing", profile: "fast" },
  { name: "Baked Potato",         carbs: 37, gi: 85,  category: "Fast Absorbing", profile: "fast" },
  { name: "Mashed Potatoes",      carbs: 30, gi: 82,  category: "Fast Absorbing", profile: "fast" },
  { name: "Cornflakes",           carbs: 26, gi: 81,  category: "Fast Absorbing", profile: "fast" },
  { name: "Pretzels",             carbs: 23, gi: 83,  category: "Fast Absorbing", profile: "fast" },
  { name: "Rice Cakes",           carbs: 14, gi: 82,  category: "Fast Absorbing", profile: "fast" },
  { name: "Watermelon",           carbs: 11, gi: 72,  category: "Fast Absorbing", profile: "fast" },
  { name: "Rice Krispies",        carbs: 26, gi: 82,  category: "Fast Absorbing", profile: "fast" },
  { name: "Glazed Doughnut",      carbs: 25, gi: 75,  category: "Fast Absorbing", profile: "fast" },
  { name: "Waffles",              carbs: 15, gi: 76,  category: "Fast Absorbing", profile: "fast" },
  { name: "Jelly Beans",          carbs: 10, gi: 80,  category: "Fast Absorbing", profile: "fast" },
  { name: "Instant Oatmeal",      carbs: 20, gi: 79,  category: "Fast Absorbing", profile: "fast" },
  { name: "Saltine Crackers",     carbs: 11, gi: 74,  category: "Fast Absorbing", profile: "fast" },
  { name: "Graham Crackers",      carbs: 11, gi: 74,  category: "Fast Absorbing", profile: "fast" },
  { name: "Cheerios",             carbs: 20, gi: 74,  category: "Fast Absorbing", profile: "fast" },
  { name: "Gummy Bears",          carbs: 22, gi: 78,  category: "Fast Absorbing", profile: "fast" },
  { name: "Millet",               carbs: 41, gi: 71,  category: "Fast Absorbing", profile: "fast" },
  { name: "Plain Scone",          carbs: 40, gi: 92,  category: "Fast Absorbing", profile: "fast" },
  { name: "Baguette",             carbs: 18, gi: 95,  category: "Fast Absorbing", profile: "fast" },
  { name: "Corn Chips",           carbs: 15, gi: 72,  category: "Fast Absorbing", profile: "fast" },
  { name: "Potato Chips",         carbs: 15, gi: 56,  category: "Fast Absorbing", profile: "fast" },
  { name: "Polenta",              carbs: 32, gi: 70,  category: "Fast Absorbing", profile: "fast" },
  { name: "Gnocchi",              carbs: 32, gi: 70,  category: "Fast Absorbing", profile: "fast" },
  { name: "Boiled Parsnips",      carbs: 13, gi: 85,  category: "Fast Absorbing", profile: "fast" },
  { name: "Boiled Pumpkin",       carbs:  5, gi: 75,  category: "Fast Absorbing", profile: "fast" },
  { name: "Dried Dates",          carbs: 36, gi: 103, category: "Fast Absorbing", profile: "fast" },
  { name: "Croissant",            carbs: 26, gi: 67,  category: "Fast Absorbing", profile: "fast" },
  { name: "Rice Milk",            carbs: 22, gi: 86,  category: "Fast Absorbing", profile: "fast" },
  { name: "Cotton Candy",         carbs: 25, gi: 100, category: "Fast Absorbing", profile: "fast" },
  { name: "Honey",                carbs: 17, gi: 61,  category: "Fast Absorbing", profile: "fast" },
  { name: "Table Sugar",          carbs: 13, gi: 65,  category: "Fast Absorbing", profile: "fast" },
  { name: "Maple Syrup",          carbs: 13, gi: 54,  category: "Fast Absorbing", profile: "fast" },
  { name: "White Pita Bread",     carbs: 33, gi: 57,  category: "Fast Absorbing", profile: "fast" },
  { name: "Rice Vermicelli",      carbs: 44, gi: 58,  category: "Fast Absorbing", profile: "fast" },
  { name: "Grape Juice",          carbs: 38, gi: 54,  category: "Fast Absorbing", profile: "fast" },
  { name: "Cranberry Juice",      carbs: 31, gi: 52,  category: "Fast Absorbing", profile: "fast" },
  { name: "Pineapple Juice",      carbs: 32, gi: 46,  category: "Fast Absorbing", profile: "fast" },
  { name: "Orange Juice",         carbs: 26, gi: 50,  category: "Fast Absorbing", profile: "fast" },
  { name: "Rice Pudding",         carbs: 29, gi: 69,  category: "Fast Absorbing", profile: "fast" },
  { name: "Pancakes",             carbs: 30, gi: 66,  category: "Fast Absorbing", profile: "fast" },
  { name: "French Toast",         carbs: 22, gi: 68,  category: "Fast Absorbing", profile: "fast" },
  { name: "Cheese Crackers",      carbs: 18, gi: 70,  category: "Fast Absorbing", profile: "fast" },

  // ── Medium Absorbing ────────────────────────────────────────────────────────
  { name: "Oatmeal",              carbs: 27, gi: 55,  category: "Medium Absorbing", profile: "medium" },
  { name: "Banana",               carbs: 27, gi: 51,  category: "Medium Absorbing", profile: "medium" },
  { name: "Brown Rice",           carbs: 45, gi: 50,  category: "Medium Absorbing", profile: "medium" },
  { name: "Boiled Potato",        carbs: 30, gi: 78,  category: "Medium Absorbing", profile: "medium" },
  { name: "Whole Wheat Bread",    carbs: 15, gi: 50,  category: "Medium Absorbing", profile: "medium" },
  { name: "Corn",                 carbs: 25, gi: 52,  category: "Medium Absorbing", profile: "medium" },
  { name: "Apple",                carbs: 25, gi: 36,  category: "Medium Absorbing", profile: "medium" },
  { name: "Orange",               carbs: 21, gi: 43,  category: "Medium Absorbing", profile: "medium" },
  { name: "Sweet Potato",         carbs: 24, gi: 63,  category: "Medium Absorbing", profile: "medium" },
  { name: "Rolled Oats",          carbs: 27, gi: 55,  category: "Medium Absorbing", profile: "medium" },
  { name: "Sweet Corn",           carbs: 16, gi: 56,  category: "Medium Absorbing", profile: "medium" },
  { name: "Basmati Rice",         carbs: 44, gi: 58,  category: "Medium Absorbing", profile: "medium" },
  { name: "Wild Rice",            carbs: 35, gi: 57,  category: "Medium Absorbing", profile: "medium" },
  { name: "Couscous",             carbs: 36, gi: 65,  category: "Medium Absorbing", profile: "medium" },
  { name: "Quinoa",               carbs: 39, gi: 53,  category: "Medium Absorbing", profile: "medium" },
  { name: "Buckwheat",            carbs: 33, gi: 54,  category: "Medium Absorbing", profile: "medium" },
  { name: "Rye Bread",            carbs: 15, gi: 57,  category: "Medium Absorbing", profile: "medium" },
  { name: "Sourdough Bread",      carbs: 15, gi: 54,  category: "Medium Absorbing", profile: "medium" },
  { name: "Bran Flakes",          carbs: 24, gi: 65,  category: "Medium Absorbing", profile: "medium" },
  { name: "Shredded Wheat",       carbs: 40, gi: 67,  category: "Medium Absorbing", profile: "medium" },
  { name: "Fresh Pineapple",      carbs: 22, gi: 59,  category: "Medium Absorbing", profile: "medium" },
  { name: "Fresh Mango",          carbs: 25, gi: 51,  category: "Medium Absorbing", profile: "medium" },
  { name: "Fresh Papaya",         carbs: 14, gi: 59,  category: "Medium Absorbing", profile: "medium" },
  { name: "Cantaloupe",           carbs: 13, gi: 65,  category: "Medium Absorbing", profile: "medium" },
  { name: "Raisins",              carbs: 31, gi: 64,  category: "Medium Absorbing", profile: "medium" },
  { name: "Dried Figs",           carbs: 26, gi: 61,  category: "Medium Absorbing", profile: "medium" },
  { name: "Prunes",               carbs: 26, gi: 59,  category: "Medium Absorbing", profile: "medium" },
  { name: "Boiled Beets",         carbs:  8, gi: 64,  category: "Medium Absorbing", profile: "medium" },
  { name: "Green Peas",           carbs: 11, gi: 54,  category: "Medium Absorbing", profile: "medium" },
  { name: "Flour Tortilla",       carbs: 24, gi: 60,  category: "Medium Absorbing", profile: "medium" },
  { name: "Taco Shell",           carbs: 16, gi: 68,  category: "Medium Absorbing", profile: "medium" },
  { name: "Cornbread",            carbs: 28, gi: 65,  category: "Medium Absorbing", profile: "medium" },
  { name: "Granola Bar",          carbs: 20, gi: 61,  category: "Medium Absorbing", profile: "medium" },
  { name: "Boiled New Potatoes",  carbs: 20, gi: 57,  category: "Medium Absorbing", profile: "medium" },
  { name: "Boiled Yam",           carbs: 20, gi: 54,  category: "Medium Absorbing", profile: "medium" },
  { name: "Oatmeal Cookie",       carbs: 15, gi: 55,  category: "Medium Absorbing", profile: "medium" },
  { name: "Blueberry Muffin",     carbs: 27, gi: 59,  category: "Medium Absorbing", profile: "medium" },
  { name: "Whole Wheat Pita",     carbs: 32, gi: 52,  category: "Medium Absorbing", profile: "medium" },
  { name: "Grapes",               carbs: 27, gi: 59,  category: "Medium Absorbing", profile: "medium" },
  { name: "Fresh Peach",          carbs: 14, gi: 42,  category: "Medium Absorbing", profile: "medium" },
  { name: "Kiwi",                 carbs: 11, gi: 53,  category: "Medium Absorbing", profile: "medium" },
  { name: "Fresh Apricot",        carbs:  8, gi: 57,  category: "Medium Absorbing", profile: "medium" },
  { name: "Tortilla Chips",       carbs: 18, gi: 63,  category: "Medium Absorbing", profile: "medium" },
  { name: "Air-Popped Popcorn",   carbs: 18, gi: 55,  category: "Medium Absorbing", profile: "medium" },
  { name: "Vanilla Ice Cream",    carbs: 16, gi: 57,  category: "Medium Absorbing", profile: "medium" },
  { name: "Custard",              carbs: 20, gi: 54,  category: "Medium Absorbing", profile: "medium" },
  { name: "Sweetened Fruit Yogurt", carbs: 26, gi: 60, category: "Medium Absorbing", profile: "medium" },
  { name: "Tomato Soup",          carbs: 16, gi: 54,  category: "Medium Absorbing", profile: "medium" },
  { name: "Thick Pizza Crust",    carbs: 30, gi: 65,  category: "Medium Absorbing", profile: "medium" },
  { name: "Split Pea Soup",       carbs: 26, gi: 60,  category: "Medium Absorbing", profile: "medium" },

  // ── Slow Absorbing ──────────────────────────────────────────────────────────
  { name: "Pizza",                carbs: 35, gi: 45,  category: "Slow Absorbing", profile: "slow" },
  { name: "Pasta",                carbs: 40, gi: 50,  category: "Slow Absorbing", profile: "slow" },
  { name: "Whole Wheat Pasta",    carbs: 37, gi: 42,  category: "Slow Absorbing", profile: "slow" },
  { name: "Black Beans",          carbs: 20, gi: 30,  category: "Slow Absorbing", profile: "slow" },
  { name: "Lentils",              carbs: 20, gi: 32,  category: "Slow Absorbing", profile: "slow" },
  { name: "Ice Cream",            carbs: 28, gi: 51,  category: "Slow Absorbing", profile: "slow" },
  { name: "Mixed Meal",           carbs: 50, gi: 38,  category: "Slow Absorbing", profile: "slow" },
  { name: "Fresh Apple",          carbs: 25, gi: 36,  category: "Slow Absorbing", profile: "slow" },
  { name: "Fresh Pear",           carbs: 27, gi: 38,  category: "Slow Absorbing", profile: "slow" },
  { name: "Strawberries",         carbs: 11, gi: 40,  category: "Slow Absorbing", profile: "slow" },
  { name: "Blueberries",          carbs: 21, gi: 53,  category: "Slow Absorbing", profile: "slow" },
  { name: "Raspberries",          carbs: 15, gi: 32,  category: "Slow Absorbing", profile: "slow" },
  { name: "Grapefruit",           carbs: 13, gi: 25,  category: "Slow Absorbing", profile: "slow" },
  { name: "Cherries",             carbs: 22, gi: 22,  category: "Slow Absorbing", profile: "slow" },
  { name: "Plums",                carbs: 15, gi: 39,  category: "Slow Absorbing", profile: "slow" },
  { name: "Chickpeas",            carbs: 22, gi: 28,  category: "Slow Absorbing", profile: "slow" },
  { name: "Kidney Beans",         carbs: 20, gi: 24,  category: "Slow Absorbing", profile: "slow" },
  { name: "Pinto Beans",          carbs: 22, gi: 39,  category: "Slow Absorbing", profile: "slow" },
  { name: "Lima Beans",           carbs: 16, gi: 46,  category: "Slow Absorbing", profile: "slow" },
  { name: "Edamame",              carbs:  7, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Green Beans",          carbs:  7, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Steamed Broccoli",     carbs:  6, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Steamed Cauliflower",  carbs:  5, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Boiled Carrots",       carbs:  6, gi: 39,  category: "Slow Absorbing", profile: "slow" },
  { name: "Barley",               carbs: 44, gi: 28,  category: "Slow Absorbing", profile: "slow" },
  { name: "White Pasta al dente", carbs: 40, gi: 43,  category: "Slow Absorbing", profile: "slow" },
  { name: "Whole Milk",           carbs: 12, gi: 39,  category: "Slow Absorbing", profile: "slow" },
  { name: "Skim Milk",            carbs: 12, gi: 37,  category: "Slow Absorbing", profile: "slow" },
  { name: "Plain Yogurt",         carbs:  8, gi: 14,  category: "Slow Absorbing", profile: "slow" },
  { name: "Soy Milk",             carbs:  8, gi: 34,  category: "Slow Absorbing", profile: "slow" },
  { name: "Almond Milk",          carbs:  1, gi: 25,  category: "Slow Absorbing", profile: "slow" },
  { name: "Cashew Nuts",          carbs:  9, gi: 25,  category: "Slow Absorbing", profile: "slow" },
  { name: "Peanuts",              carbs:  5, gi: 14,  category: "Slow Absorbing", profile: "slow" },
  { name: "Walnuts",              carbs:  4, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Almonds",              carbs:  6, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Pistachios",           carbs:  8, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Hummus",               carbs:  4, gi:  6,  category: "Slow Absorbing", profile: "slow" },
  { name: "Avocado",              carbs: 12, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Cooked Spinach",       carbs:  7, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Sautéed Mushrooms",    carbs:  4, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Roasted Brussels Sprouts", carbs: 11, gi: 15, category: "Slow Absorbing", profile: "slow" },
  { name: "Grilled Zucchini",     carbs:  4, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Roasted Asparagus",    carbs:  5, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Shredded Cabbage",     carbs:  5, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Celery",               carbs:  1, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Cucumber",             carbs:  4, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Cooked Eggplant",      carbs:  9, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Raw Tomato",           carbs:  5, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Chia Seeds",           carbs: 10, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Dark Chocolate 85%",   carbs: 10, gi: 20,  category: "Slow Absorbing", profile: "slow" },
  { name: "Firm Tofu",            carbs:  2, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Quinoa Vegetable Salad", carbs: 25, gi: 35, category: "Slow Absorbing", profile: "slow" },
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