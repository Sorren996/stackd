export const STALE_GLUCOSE_MINUTES = 20;
export const MEANINGFUL_ACTIVE_INSULIN_UNITS = 0.1;
export const MEANINGFUL_ACTIVE_CARBS_GRAMS = 1;

export function normalizeSupportTrend(trend) {
  const icon = trend?.icon;
  if (icon === "up") return "rising";
  if (icon === "up-right") return "slowly_rising";
  if (icon === "right") return "steady";
  if (icon === "down-right") return "slowly_falling";
  if (icon === "down") return "falling";
  return "steady";
}

function hashSupportSeed(value) {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickMessage(options, seed) {
  return options[hashSupportSeed(seed) % options.length];
}

export const SCENE_INTENTS = {
  mountain: {
    rising: "Ascending the Ridge",
    slowly_rising: "Climbing Gently",
    steady: "Holding the Summit",
    slowly_falling: "Easing Downward",
    falling: "Descending the Mountain",
  },
  forest: {
    rising: "Rising on the Trail",
    slowly_rising: "Drifting Upward",
    steady: "Resting by the River",
    slowly_falling: "Easing Gently Lower",
    falling: "Descending Through the Trees",
  },
  valley: {
    rising: "Rising From the Valley",
    slowly_rising: "Climbing Gently",
    steady: "Resting in the Valley",
    slowly_falling: "Drifting Deeper",
    falling: "Deep in the Hollow",
  },
  unknown: {
    steady: "Awaiting Your Journey",
  },
};

const SCENE_MESSAGES = {
  mountain: {
    rising: [
      "The climb is swift today. You are stronger than the incline.",
      "Rising above the treeline — the air is thin but your resolve is steady.",
      "The mountain asks for patience. One breath at a time.",
      "You're ascending quickly. The summit will come, then the gentle descent.",
      "High ground rising. Trust your body — it knows the way back down.",
    ],
    slowly_rising: [
      "A gentle ascent through the upper trees. No rush — the trail is yours.",
      "Slowly climbing the ridge. The pace is yours to hold.",
      "The mountain lifts you softly. Breathe into the rise.",
      "A gradual climb. You're moving with care, and that matters.",
      "Easing upward on the slope. The journey is steady and unhurried.",
    ],
    steady: [
      "Holding the summit. The view is wide — take a moment here.",
      "Resting on high ground. Your body is working beneath the surface.",
      "The ridge holds firm. You are steady, even at altitude.",
      "Perched above the valley. Breathe — the descent will come naturally.",
      "Stillness on the peak. Trust that your body is finding its way.",
    ],
    slowly_falling: [
      "The path begins to descend. A gentle slope back toward the trees.",
      "Easing down the mountainside. Each step is a quiet return.",
      "The air thickens as you descend. Your body is responding.",
      "A slow, welcome descent. The forest waits below.",
      "Drifting lower from the ridge. The trail winds gently home.",
    ],
    falling: [
      "Descending the mountain — the valley welcomes you back.",
      "The slope falls away. You're returning to familiar ground.",
      "Swift descent. The river grows louder below.",
      "The mountain releases you. Trust the path downward.",
      "Quickly descending. The forest is close now.",
    ],
  },
  forest: {
    rising: [
      "The trail lifts beneath your feet. You're moving with the land.",
      "Rising through the canopy. The river hums nearby.",
      "The path climbs. You're navigating beautifully.",
      "A swift rise along the trail. The forest holds you steady.",
      "Moving upward through the trees. Your rhythm is strong.",
    ],
    slowly_rising: [
      "A gentle rise on the forest path. The breeze is soft.",
      "Slowly ascending through the trees. All is well here.",
      "The trail tilts upward, barely. You're in a good place.",
      "Drifting up through the canopy. The river flows beside you.",
      "A quiet climb. The forest is patient with you.",
    ],
    steady: [
      "Resting by the river. The water flows steady, just like you.",
      "Deep in the forest, all is calm. This is your place of balance.",
      "The trail is flat and the air is still. Enjoy this moment.",
      "Grounded among the trees. You are in perfect rhythm.",
      "The river murmurs softly. You are here, and that is enough.",
      "Stillness in the forest. Your body and the land are one.",
    ],
    slowly_falling: [
      "The path drifts lower. A gentle slope, nothing more.",
      "Slowly descending through the trees. The river guides you.",
      "A soft decline on the trail. You're grounded and at ease.",
      "The forest path eases downward. All is well.",
      "Drifting gently lower. The valley is still far away.",
    ],
    falling: [
      "The trail descends. The valley is close — stay with it.",
      "Dropping through the forest. The river grows quieter.",
      "The path falls away beneath you. Keep your footing.",
      "A swift descent toward the valley. You're moving with care.",
      "The forest thins as you descend. Stay close to the trend.",
    ],
  },
  valley: {
    rising: [
      "Rising from the valley. The mist is clearing above you.",
      "The climb out is swift — you're finding your way back.",
      "Lifting toward the treeline. The forest welcomes you.",
      "Rising from the low ground. Each step is progress.",
      "The valley releases you. You're ascending toward balance.",
    ],
    slowly_rising: [
      "A gentle climb from the valley. The air is warming.",
      "Slowly rising toward the trees. No rush — you're moving.",
      "The mist thins as you ascend. Patience — you're on your way.",
      "Easing upward from the low ground. The trail is with you.",
      "A quiet ascent from the valley. Your body is finding its rhythm.",
    ],
    steady: [
      "Resting in the valley. Take a gentle moment to nourish yourself.",
      "The low ground holds you. The climb back is yours when you're ready.",
      "Stillness in the valley. The river pools here, gathering strength.",
      "You're in the low country. Treat yourself with kindness.",
      "The valley is quiet. Take a breath — support is near.",
    ],
    slowly_falling: [
      "Drifting deeper into the valley. Take care of yourself now.",
      "The path slopes gently lower. A kind moment for nourishment.",
      "Slowly descending. The valley floor is close — be gentle with yourself.",
      "Easing into the low ground. Your body is asking for support.",
      "The trail drops softly. Listen to what you need right now.",
    ],
    falling: [
      "Deep in the hollow. Focus on yourself — everything else can wait.",
      "The valley deepens. Take care of this moment, one step at a time.",
      "Falling into the low ground. You deserve care and attention.",
      "The path drops quickly. Be gentle — nourishment is here.",
      "Deep in the valley now. You are worth every moment of care.",
    ],
  },
  unknown: {
    steady: [
      "Waiting for your next reading. The river flows on.",
      "The trail is quiet for now. We'll pick up from the next step.",
    ],
  },
};

const CONTEXT_MESSAGES = {
  missing: [
    "Waiting for your next reading. The river flows on.",
    "No reading yet. The forest is patient — we'll begin when you're ready.",
    "Your journey awaits. We'll be here when the next reading comes.",
    "The trail is quiet for now. We'll pick up from the next step.",
  ],
  stale: [
    "This reading has settled. A fresh one will show us the current path.",
    "The river has moved since this reading. Let's check in again.",
    "This moment may have passed. A new reading will guide us.",
    "The forest changes — let's get a fresh view of where you are.",
  ],
  lowActiveCarbs: [
    "Nourishment is finding its way. The valley will release you soon.",
    "The food is settling in. Stay close — the climb is beginning.",
    "Carbs are working like sunlight in the valley. Give them a moment.",
    "You've already taken a step. The mist is starting to lift.",
    "The river is rising in the valley. You're being carried upward.",
  ],
  lowUrgent: [
    "Focus on yourself right now. Everything else can wait.",
    "Take care of this moment. You are worth every ounce of care.",
    "One step at a time. Nourish yourself — the valley will lift.",
    "Be gentle with yourself. This moment is asking for your attention.",
  ],
  highInsulinCarbs: [
    "Support and nourishment are both flowing. The mountain will ease.",
    "The river and the rain work together on the mountain. Give it time.",
    "Much is in motion on the ridge. Let the elements find their balance.",
    "Insulin and carbs are both active. Trust the process unfolding.",
    "The mountain holds many things at once. Patience — it will settle.",
  ],
  highInsulinRising: [
    "You've already sent support up the mountain. Give it time to work.",
    "The river is flowing toward the peak. It will reach — be patient.",
    "Support is on its way up. The climb will slow soon.",
    "You've taken action. The mountain listens, even if slowly.",
    "Insulin is moving through the high ground. Trust the journey.",
  ],
  highInsulinStable: [
    "Holding on the ridge, with support flowing beneath. Steady.",
    "The mountain is still, but the river works below. Give it time.",
    "You're holding with support in motion. The descent will come.",
    "Insulin is present on the summit. Let it do its quiet work.",
    "Support is with you on the high ground. Breathe into the stillness.",
  ],
  highInsulinFalling: [
    "The mountain is releasing you. The river is guiding you down.",
    "Descending with support beside you. The forest grows closer.",
    "The slope eases with insulin flowing. You're heading home.",
    "Support and descent together — a gentle return to the trees.",
    "The mountain lets you go. The river carries you downward.",
  ],
};

function getScene(glucoseValue, targetLow, targetHigh) {
  if (!Number.isFinite(glucoseValue)) return "unknown";
  if (glucoseValue < targetLow) return "valley";
  if (glucoseValue > targetHigh) return "mountain";
  return "forest";
}

export function getSceneIntent(glucoseValue, targetLow, targetHigh, normalizedTrend) {
  const scene = getScene(glucoseValue, targetLow, targetHigh);
  const trendKey = normalizedTrend || "steady";
  return SCENE_INTENTS[scene]?.[trendKey] || SCENE_INTENTS.unknown.steady;
}

export function getSupportiveGlucoseMessage({
  glucose,
  targetLow,
  targetHigh,
  trend,
  activeInsulin,
  activeCarbs,
  readingAgeMinutes,
  seed,
}) {
  const value = Number(glucose?.value);
  const normalizedTrend = normalizeSupportTrend(trend);
  const hasActiveInsulin = Number(activeInsulin) >= MEANINGFUL_ACTIVE_INSULIN_UNITS;
  const hasActiveCarbs = Number(activeCarbs) >= MEANINGFUL_ACTIVE_CARBS_GRAMS;
  const isStale = Number.isFinite(readingAgeMinutes) && readingAgeMinutes >= STALE_GLUCOSE_MINUTES;
  const isRising = normalizedTrend === "rising" || normalizedTrend === "slowly_rising";
  const isFalling = normalizedTrend === "falling" || normalizedTrend === "slowly_falling";

  const scene = getScene(value, targetLow, targetHigh);
  const messageSeed = seed || glucose?.id || glucose?.recorded_at || "current";

  let contextKey = null;

  if (!glucose || !Number.isFinite(value)) {
    contextKey = "missing";
  } else if (isStale) {
    contextKey = "stale";
  } else if (value <= 54) {
    contextKey = hasActiveCarbs ? "lowActiveCarbs" : "lowUrgent";
  } else if (value < targetLow) {
    if (hasActiveCarbs) contextKey = "lowActiveCarbs";
  } else if (value > targetHigh) {
    if (hasActiveInsulin && hasActiveCarbs) contextKey = "highInsulinCarbs";
    else if (hasActiveInsulin && isFalling) contextKey = "highInsulinFalling";
    else if (hasActiveInsulin && normalizedTrend === "steady") contextKey = "highInsulinStable";
    else if (hasActiveInsulin) contextKey = "highInsulinRising";
  }

  let message;
  if (contextKey) {
    message = pickMessage(CONTEXT_MESSAGES[contextKey], messageSeed);
  } else {
    const sceneMessages = SCENE_MESSAGES[scene] || SCENE_MESSAGES.unknown;
    const trendMessages = sceneMessages[normalizedTrend] || sceneMessages.steady || [];
    message = pickMessage(trendMessages.length ? trendMessages : SCENE_MESSAGES.unknown.steady, messageSeed);
  }

  const intent = getSceneIntent(value, targetLow, targetHigh, normalizedTrend);

  return { intent, message, scene, trend: normalizedTrend, context: contextKey };
}