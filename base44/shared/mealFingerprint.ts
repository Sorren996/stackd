// Shared meal fingerprinting and similarity scoring for Meal Memory.
// Imported by both the log-time matcher (findMealMemory) and the retrospective
// response-analysis pipeline so fingerprints are computed identically everywhere.

const STOP_WORDS = new Set([
  "meal", "food", "plate", "dish", "dinner", "lunch", "breakfast", "snack",
  "serving", "portion", "a", "an", "the", "of", "with", "and", "on", "in",
  "for", "some", "my", "little", "big", "small", "large", "fresh", "homemade",
  "restaurant", "order", "ordered", "had", "ate", "eating", "eat", "today",
  "yesterday", "this", "that", "style", "style", "piece", "pieces", "cup",
  "cups", "bowl", "bowls", "side", "sides", "oz", "g", "gm",
]);

const ALIASES: Record<string, string> = {
  chiken: "chicken", chciken: "chicken", chickn: "chicken", chiken: "chicken",
  alfrdo: "alfredo", alfredo: "alfredo",
  pasta: "pasta", noodle: "noodles", noodles: "noodles", spagetti: "spaghetti",
  spaghetti: "spaghetti",
  potato: "potato", potatos: "potato", potatoes: "potato",
  tomato: "tomato", tomatos: "tomato", tomatoes: "tomato",
  burger: "burger", burgers: "burger", hamburger: "burger", hamburgers: "burger",
  fries: "fries", "french": "fries",
  pizza: "pizza", pizzas: "pizza",
  rice: "rice",
  beef: "beef", steak: "steak",
  pork: "pork",
  fish: "fish",
  shrimp: "shrimp", scampi: "shrimp",
  salad: "salad",
  soup: "soup",
  sandwich: "sandwich", sandwiches: "sandwich",
  taco: "taco", tacos: "taco",
  burrito: "burrito", burritos: "burrito",
  sushi: "sushi",
  curry: "curry",
  wings: "wings",
  oatmeal: "oatmeal",
  cereal: "cereal",
  egg: "eggs", eggs: "eggs",
  pancake: "pancakes", pancakes: "pancakes",
  waffle: "waffles", waffles: "waffles",
  toast: "toast",
  bagel: "bagel",
  smoothie: "smoothie",
  yogurt: "yogurt",
  cheese: "cheese",
  bread: "bread",
  sauce: "sauce",
  cream: "cream", creamy: "cream",
  alfredo: "alfredo",
  marinara: "marinara",
  coke: "coke", cola: "coke",
  juice: "juice",
};

const CUISINE_WORDS: Record<string, string> = {
  italian: "italian", mexican: "mexican", asian: "asian", chinese: "chinese",
  japanese: "japanese", thai: "thai", indian: "indian", american: "american",
  mediterranean: "mediterranean", greek: "greek", korean: "korean",
  vietnamese: "vietnamese", french: "french", spanish: "spanish",
};

const PREP_WORDS: Record<string, string> = {
  grilled: "grilled", fried: "fried", baked: "baked", roasted: "roasted",
  steamed: "steamed", boiled: "boiled", sauteed: "sauteed", stir: "stir-fried",
  smoked: "smoked", broiled: "broiled", raw: "raw", crispy: "crispy",
  blackened: "blackened", broiled: "broiled",
};

const CATEGORY_WORDS: Record<string, string> = {
  pasta: "pasta", noodles: "noodles", spaghetti: "pasta", pizza: "pizza",
  burger: "burger", salad: "salad", soup: "soup", sandwich: "sandwich",
  rice: "rice", taco: "taco", burrito: "burrito", sushi: "sushi",
  curry: "curry", steak: "steak", wings: "wings", fries: "fries",
  oatmeal: "oatmeal", cereal: "cereal", eggs: "eggs", pancakes: "pancakes",
  waffles: "waffles", toast: "toast", bagel: "bagel", smoothie: "smoothie",
  yogurt: "yogurt", porridge: "porridge",
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function normalizeToken(raw: string): string {
  let tok = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!tok) return "";
  if (ALIASES[tok]) tok = ALIASES[tok];
  // simple plural strip
  if (tok.length > 4 && tok.endsWith("s") && !tok.endsWith("ss")) {
    tok = tok.slice(0, -1);
  }
  return tok;
}

function findFirst(tokens: string[], dict: Record<string, string>): string | null {
  for (const t of tokens) {
    if (dict[t]) return dict[t];
    // fuzzy: tolerate one-edit typos for cuisine/prep/category
    for (const key of Object.keys(dict)) {
      if (t.length >= 4 && levenshtein(t, key) <= 1) return dict[key];
    }
  }
  return null;
}

export function normalizeMealName(name: string): string {
  if (!name) return "";
  const lowered = name.toLowerCase();
  const rawTokens = lowered.split(/[^a-z0-9]+/).filter(Boolean);
  const tokens = rawTokens.map(normalizeToken).filter((t) => t && !STOP_WORDS.has(t));
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const t of tokens) {
    if (!seen.has(t)) {
      seen.add(t);
      ordered.push(t);
    }
  }
  return ordered.join(" ");
}

export interface MealFingerprint {
  primary: string;
  ingredients: string[];
  cuisine: string | null;
  preparation: string | null;
  category: string | null;
  tags: string[];
  normalized_name: string;
  carbs: number;
  high_protein_fat: boolean;
}

export function buildMealFingerprint(
  name: string,
  carbs: number,
  highProteinFat: boolean
): MealFingerprint {
  const normalized = normalizeMealName(name);
  const tokens = normalized.split(" ").filter(Boolean);
  const cuisine = findFirst(tokens, CUISINE_WORDS);
  const preparation = findFirst(tokens, PREP_WORDS);
  const category = findFirst(tokens, CATEGORY_WORDS);
  const primary = tokens[0] || normalized || "meal";
  const ingredients = tokens.slice(1);
  return {
    primary,
    ingredients,
    cuisine,
    preparation,
    category,
    tags: tokens,
    normalized_name: normalized,
    carbs: Number(carbs) || 0,
    high_protein_fat: Boolean(highProteinFat),
  };
}

// Token-set similarity with fuzzy (Levenshtein <= 1) tolerance.
function tokenSetSimilarity(setA: string[], setB: string[]): number {
  if (!setA.length || !setB.length) return 0;
  const b = setB.slice();
  let matched = 0;
  for (const ta of setA) {
    const exactIdx = b.indexOf(ta);
    if (exactIdx >= 0) {
      matched += 1;
      b.splice(exactIdx, 1);
      continue;
    }
    // fuzzy match
    const fuzzyIdx = b.findIndex((tb) => ta.length >= 4 && tb.length >= 4 && levenshtein(ta, tb) <= 1);
    if (fuzzyIdx >= 0) {
      matched += 0.85;
      b.splice(fuzzyIdx, 1);
    }
  }
  const denom = Math.max(setA.length, setB.length);
  return denom ? matched / denom : 0;
}

export interface CarbMatch {
  score: number; // 0..100
  tier: "strong" | "good" | "possible" | "none";
  diff: number;
  label: string;
}

export function carbSimilarity(currentCarbs: number, historicalCarbs: number): CarbMatch {
  const a = Number(currentCarbs) || 0;
  const b = Number(historicalCarbs) || 0;
  if (!a || !b) return { score: 0, tier: "none", diff: Math.abs(a - b), label: "" };
  const diff = Math.abs(a - b);
  const pct = diff / Math.max(a, b);
  if (diff <= 10) return { score: 100, tier: "strong", diff, label: `within ${Math.round(diff)}g` };
  if (pct <= 0.2) return { score: 85, tier: "good", diff, label: `about ${Math.round(diff)}g apart` };
  if (pct <= 0.35) return { score: 60, tier: "possible", diff, label: `${Math.round(diff)}g apart` };
  return { score: 0, tier: "none", diff, label: `${Math.round(diff)}g apart` };
}

export interface SimilarityResult {
  score: number; // 0..100
  nameScore: number;
  carbScore: number;
  tagScore: number;
  profileScore: number;
  timeScore: number;
  carbMatch: CarbMatch;
}

export function scoreMealSimilarity(
  current: MealFingerprint,
  historical: MealFingerprint,
  options: { currentMealTime?: number; historicalMealTime?: number } = {}
): SimilarityResult {
  // 45% name + semantic food similarity
  const nameScore = tokenSetSimilarity(current.tags, historical.tags) * 100;

  // 25% carb similarity
  const carbMatch = carbSimilarity(current.carbs, historical.carbs);
  const carbScore = carbMatch.score;

  // 15% ingredient / tag similarity (supporting ingredients)
  const tagScore = tokenSetSimilarity(current.ingredients, historical.ingredients) * 100;

  // 10% high-fat/protein + preparation similarity
  let profileScore = 0;
  if (current.high_protein_fat === historical.high_protein_fat) profileScore += 50;
  if (current.preparation && historical.preparation) {
    profileScore += current.preparation === historical.preparation ? 50 : 10;
  } else if (!current.preparation && !historical.preparation) {
    profileScore += 25;
  }

  // 5% time-of-day similarity
  let timeScore = 0;
  if (options.currentMealTime && options.historicalMealTime) {
    const hourA = new Date(options.currentMealTime).getHours();
    const hourB = new Date(options.historicalMealTime).getHours();
    const hourDiff = Math.min(Math.abs(hourA - hourB), 24 - Math.abs(hourA - hourB));
    timeScore = Math.max(0, 100 - hourDiff * 20);
  }

  const score =
    nameScore * 0.45 +
    carbScore * 0.25 +
    tagScore * 0.15 +
    profileScore * 0.1 +
    timeScore * 0.05;

  return {
    score: Math.round(score),
    nameScore: Math.round(nameScore),
    carbScore: Math.round(carbScore),
    tagScore: Math.round(tagScore),
    profileScore: Math.round(profileScore),
    timeScore: Math.round(timeScore),
    carbMatch,
  };
}

export function matchTier(score: number): "strong" | "useful" | "weak" | "none" {
  if (score >= 80) return "strong";
  if (score >= 65) return "useful";
  if (score >= 50) return "weak";
  return "none";
}