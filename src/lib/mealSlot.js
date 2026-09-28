/**
 * Meal slot classification — clock is the source of truth.
 *
 * The food's identity never determines the slot. Only time, size, and
 * whether the entry is beverage-only decide the label.
 *
 * Rules:
 * 1. CLOCK: breakfast 5:00-10:30, lunch 11:00-15:00, dinner 17:00-21:00,
 *    snack for all other times.
 * 2. SIZE NUDGES: a large entry (60+ carbs or ~600+ cal) just outside a
 *    meal window gets the adjacent meal with a "late"/"early" modifier.
 *    A small entry inside a meal window stays "snack".
 * 3. BEVERAGES: if the entry contains only drinks, show a time-of-day word
 *    (Morning / Afternoon / Evening / Late night) instead of a meal name.
 */

// Meal windows in decimal hours (24-hour clock)
const BREAKFAST = { start: 5, end: 10.5 };
const LUNCH = { start: 11, end: 15 };
const DINNER = { start: 17, end: 21 };

// Size thresholds
const LARGE_CARBS = 60;
const LARGE_CAL = 600;
const SMALL_CARBS = 30;
const SMALL_CAL = 400;

// How far outside a meal window (minutes) a large entry can still get the
// adjacent meal label with a "late"/"early" modifier.
const NUDGE_MIN = 60;

// Common beverage keywords — if the food name contains one of these AND no
// solid-food keyword, the entry is treated as beverage-only.
const BEVERAGE_KEYWORDS = [
  "beer", "ipa", "ale", "lager", "stout", "porter", "pilsner", "witbier",
  "hazy", "seltzer", "hard seltzer", "white claw", "truly",
  "wine", "rosé", "rose", "champagne", "prosecco", "cava", "sake",
  "cocktail", "martini", "margarita", "mimosa", "mojito", "daiquiri",
  "negroni", "manhattan", "gimlet", "old fashioned", "mai tai",
  "piña colada", "pina colada",
  "tequila", "vodka", "rum", "gin", "whiskey", "whisky", "bourbon",
  "scotch", "cognac", "brandy", "liqueur", "cordial", "absinthe",
  "aperol", "campari", "mezcal", "soju",
  "juice", "smoothie", "lemonade", "limeade", "punch", "cider",
  "latte", "cappuccino", "espresso", "americano", "macchiato", "mocha",
  "coffee", "tea", "chai", "matcha", "cocoa", "hot chocolate",
  "soda", "coke", "sprite", "pepsi", "cola", "dr pepper", "mountain dew",
  "sparkling water", "kombucha", "kefir",
  "milkshake", "shake",
  "corona", "heineken", "budweiser", "bud light", "coors", "pabst",
  "modelo", "stella", "guinness", "blue moon",
  "sauvignon", "chardonnay", "pinot", "merlot", "cabernet", "riesling",
  "moscato",
  "gin and tonic", "gin tonic", "vodka soda", "rum and coke",
];

// Solid-food keywords — if any of these appear in the name, the entry is
// NOT beverage-only, even if a beverage keyword also appears.
const SOLID_FOOD_KEYWORDS = [
  "sandwich", "burger", "taco", "burrito", "pizza", "pasta", "spaghetti",
  "chicken", "steak", "salmon", "shrimp", "rice", "noodle", "soup",
  "salad", "wings", "brisket", "ribs", "sushi", "ramen", "curry",
  "stew", "chili", "casserole", "quesadilla", "fajita", "enchilada",
  "lasagna", "risotto", "oatmeal", "pancake", "waffle", "omelet",
  "omelette", "scramble", "bagel", "toast", "bread", "wrap", "roll",
  "fries", "chips", "nachos", "guacamole", "salsa",
  "cheesesteak", "philly", "sub", "hoagie", "grinder",
  "bowl", "plate", "hot dog", "corndog", "corn dog",
  "tender", "nugget", "pork", "beef", "turkey", "ham", "bacon",
  "sausage", "meatball", "lobster", "crab", "scallop", "oyster",
  "potato", "corn", "beans", "lentil",
  "cake", "cookie", "brownie", "pie", "donut", "doughnut", "muffin",
  "croissant", "danish", "pastry", "scone", "biscuit",
  "yogurt", "parfait", "granola", "cereal",
  "egg", "eggs", "hash",
  "dumpling", "dumplings", "potsticker", "bao", "bun",
  "kebab", "gyro", "shawarma", "falafel", "hummus",
  "pho", "bibimbap", "katsu", "tempura", "teriyaki",
  "popcorn", "nuts", "pretzel",
  "cheeseburger", "mac and cheese", "grilled cheese",
  "queso", "queso dip",
  "oat", "porridge",
  "avocado", "tomato", "onion", "carrot",
];

function estimateCalories(carbs, fat, protein) {
  return (carbs || 0) * 4 + (fat || 0) * 9 + (protein || 0) * 4;
}

function isLarge(carbs, fat, protein) {
  return (carbs || 0) >= LARGE_CARBS || estimateCalories(carbs, fat, protein) >= LARGE_CAL;
}

function isSmall(carbs, fat, protein) {
  return (carbs || 0) < SMALL_CARBS && estimateCalories(carbs, fat, protein) < SMALL_CAL;
}

function isBeverageOnly(foodName) {
  const lower = String(foodName || "").toLowerCase().trim();
  if (!lower) return false;
  const hasBeverage = BEVERAGE_KEYWORDS.some((kw) => lower.includes(kw));
  if (!hasBeverage) return false;
  const hasSolid = SOLID_FOOD_KEYWORDS.some((kw) => lower.includes(kw));
  return !hasSolid;
}

function getTimeOfDayWord(hour) {
  if (hour >= 5 && hour < 11) return "Morning";
  if (hour >= 11 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Late night";
}

function inWindow(hour, window) {
  return hour >= window.start && hour < window.end;
}

/**
 * Returns the meal slot label for a logged entry.
 *
 * @param {Object} opts
 * @param {number|string} opts.time — timestamp (ms epoch or ISO string)
 * @param {number} [opts.carbs=0] — total carbohydrates in grams
 * @param {number} [opts.fatGrams=0] — total fat in grams
 * @param {number} [opts.proteinGrams=0] — total protein in grams
 * @param {string} [opts.foodName=""] — the food name (combined for groups)
 * @returns {string} — e.g. "Breakfast", "Lunch", "Late lunch", "Evening", "Snack"
 */
export function getMealSlotLabel({ time, carbs = 0, fatGrams = 0, proteinGrams = 0, foodName = "" }) {
  const d = new Date(time);
  if (isNaN(d.getTime())) return "Snack";

  const hour = d.getHours();
  const minute = d.getMinutes();
  const totalMin = hour * 60 + minute;

  // Rule 3: beverage-only entries always get time-of-day words
  if (isBeverageOnly(foodName)) {
    return getTimeOfDayWord(hour);
  }

  const large = isLarge(carbs, fatGrams, proteinGrams);
  const small = isSmall(carbs, fatGrams, proteinGrams);

  // Rule 1 + Rule 2 (small inside a meal window → "Snack")
  if (inWindow(hour, BREAKFAST)) return small ? "Snack" : "Breakfast";
  if (inWindow(hour, LUNCH)) return small ? "Snack" : "Lunch";
  if (inWindow(hour, DINNER)) return small ? "Snack" : "Dinner";

  // In a gap — Rule 2: large entries get adjacent meal with modifier
  if (large) {
    // Gap between breakfast end (10:30) and lunch start (11:00)
    if (totalMin >= BREAKFAST.end * 60 && totalMin < LUNCH.start * 60) {
      return "Early lunch";
    }
    // Gap between lunch end (15:00) and dinner start (17:00)
    if (totalMin >= LUNCH.end * 60 && totalMin < DINNER.start * 60) {
      const distFromLunch = totalMin - LUNCH.end * 60;
      if (distFromLunch <= NUDGE_MIN) return "Late lunch";
      return "Early dinner";
    }
    // After dinner end (21:00) — late dinner within 1 hour
    if (totalMin >= DINNER.end * 60 && totalMin < DINNER.end * 60 + NUDGE_MIN) {
      return "Late dinner";
    }
    // Before breakfast start (5:00) — early breakfast within 1 hour
    if (totalMin < BREAKFAST.start * 60 && totalMin >= BREAKFAST.start * 60 - NUDGE_MIN) {
      return "Early breakfast";
    }
  }

  // Default: snack for all other times
  return "Snack";
}