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
    rising: "Climbing a bit",
    slowly_rising: "Drifting up",
    steady: "Holding high",
    slowly_falling: "Easing down",
    falling: "Coming down",
  },
  forest: {
    rising: "Rising gently",
    slowly_rising: "Drifting up",
    steady: "Nicely steady",
    slowly_falling: "Easing down",
    falling: "Coming down",
  },
  valley: {
    rising: "Lifting back up",
    slowly_rising: "Climbing back",
    steady: "A bit low",
    slowly_falling: "Drifting lower",
    falling: "Dropping",
  },
  unknown: {
    steady: "Waiting for your next check",
  },
};

const SCENE_MESSAGES = {
  mountain: {
    rising: [
      "Your numbers are climbing right now. You've got this — give the support you sent a little time to work.",
      "It's rising at the moment. Take a breath; the support you gave will kick in soon.",
      "Things are going up, and that's okay. Let's give it a moment and see how you respond.",
      "A quick rise right now. Trust the support you've already sent — it's on its way.",
    ],
    slowly_rising: [
      "A gentle rise. No need to worry — you're handling this well.",
      "Drifting up a little. Let's keep an eye on it together.",
      "Slowly climbing. You're doing everything right; give it a little time.",
      "A soft rise. You and your body are working through this together.",
    ],
    steady: [
      "Holding steady up there. The support you sent is doing its quiet work beneath the surface.",
      "You're sitting a bit high, but steady. Take a breath — your body is working on it.",
      "Steady at this level. Let the support do its gentle work.",
      "Holding for now. Trust yourself — you've already taken care of this.",
    ],
    slowly_falling: [
      "Starting to ease down. There you go — your support is doing its job.",
      "Gently coming back down. You're moving in the right direction.",
      "A soft descent. Give it a little more time; you're getting there.",
      "Easing lower. You're responding well.",
    ],
    falling: [
      "Coming down now. Nice work — let it settle in gently.",
      "Dropping back toward your range. You're doing great.",
      "On the way down. Keep a gentle eye on it; you've handled this well.",
      "A welcome descent. Let's make sure it eases in nicely.",
    ],
  },
  forest: {
    rising: [
      "Rising gently within your range. You're in a good spot right now.",
      "A small rise, and you're still right where you want to be.",
      "Moving up a touch. You're doing wonderfully here.",
      "Climbing just a little — and still in a comfortable place.",
    ],
    slowly_rising: [
      "Drifting up gently. You're right in the swing of things.",
      "A soft rise. Nothing to worry about — you're doing well.",
      "Slowly up. You're in a good rhythm.",
      "Easing upward. You and your body are in sync.",
    ],
    steady: [
      "Right in your comfortable range. You're doing beautifully.",
      "Steady and balanced. Take a moment to appreciate this.",
      "You're exactly where you want to be. Nice work.",
      "Holding steady. Your body and your choices are working together.",
      "In range and steady. This is what all your care adds up to.",
      "Settled and comfortable. Enjoy this moment.",
    ],
    slowly_falling: [
      "Easing down gently. You're still right where you want to be.",
      "A soft drift lower. All good — you're in a good place.",
      "Slowly coming down. You're doing just fine.",
      "Drifting lower, nicely within range. Keep it up.",
    ],
    falling: [
      "Coming down, but still in your range. Keep a gentle eye on it.",
      "Dropping a bit. You're okay — just stay aware.",
      "A gentle descent. Watch how you feel; you're doing well.",
      "Falling, and still comfortable. Trust yourself here.",
    ],
  },
  valley: {
    rising: [
      "Lifting back up. There you go — you're finding your footing.",
      "Rising gently. You're on your way back to comfortable.",
      "Climbing back. Well done taking care of yourself.",
      "Heading up. You responded just right.",
    ],
    slowly_rising: [
      "Slowly coming back up. Give it a little time — you're getting there.",
      "A gentle climb back. You're moving in the right direction.",
      "Easing upward. You've got this; just keep an eye on how you feel.",
      "Drifting up. Be patient with yourself; you're responding.",
    ],
    steady: [
      "A bit low right now. Something gentle to eat might help — take care of yourself.",
      "You're sitting low. Listen to what your body is asking for.",
      "Low and steady. A little nourishment could help you find your footing.",
      "Take a moment for yourself here. You deserve the care.",
      "A little low. Be gentle with yourself — support is close.",
    ],
    slowly_falling: [
      "Drifting lower. Take care of yourself — a little something to eat might help.",
      "Easing down. Listen to what you need right now.",
      "Slowly dropping. Be gentle; a little nourishment is a kind next step.",
      "Drifting lower. Your body is asking for a little support.",
    ],
    falling: [
      "Dropping quickly. Focus on yourself right now — everything else can wait.",
      "You're falling fast. Take care of this moment, one step at a time.",
      "Coming down fast. You deserve care and attention right now.",
      "A quick drop. Be gentle — reach for some nourishment.",
    ],
  },
  unknown: {
    steady: [
      "Waiting for your next check. We'll pick it up from there.",
      "No reading yet. We'll be here whenever you're ready.",
    ],
  },
};

const CONTEXT_MESSAGES = {
  missing: [
    "Waiting for your next check. We'll pick it up from there.",
    "No reading yet. We'll be here whenever you're ready.",
    "Your next reading will show us where you are. No rush.",
    "Nothing logged yet. We'll start fresh with your next check.",
  ],
  stale: [
    "This reading's a bit old. A fresh one will show us where you are now.",
    "Some time has passed since this one. Let's check in again.",
    "Things may have shifted since this reading. A new one will help us see.",
    "This moment's passed. Let's get a fresh look at where you are.",
  ],
  lowActiveCarbs: [
    "Nourishment is on its way. Give it a little time — you're being looked after.",
    "The food's settling in. Stay close — you'll feel it soon.",
    "You've already taken a step. Give it a moment to lift you back up.",
    "Carbs are working their way through. You're being carried back up.",
    "You did the right thing. Let it do its work — you'll come back up.",
  ],
  lowUrgent: [
    "Focus on yourself right now. Everything else can wait.",
    "Take care of this moment. You are worth every bit of care.",
    "One step at a time. Nourish yourself — you'll find your footing.",
    "Be gentle with yourself. This moment is asking for your attention.",
  ],
  highInsulinCarbs: [
    "Support and nourishment are both working. Give it a little time to settle.",
    "You've got both moving. Let them find their balance together.",
    "A lot's in motion right now. Trust it — it'll come together.",
    "Insulin and carbs are both active. Let the process unfold.",
    "Plenty happening at once. Be patient; it'll ease soon.",
  ],
  highInsulinRising: [
    "You've already sent support. Give it time to do its work.",
    "Support is on its way. It'll get there — be patient.",
    "You took action. It's moving, even if it feels slow right now.",
    "Insulin's working through. Trust the process.",
    "You've done your part. Let it catch up.",
  ],
  highInsulinStable: [
    "Holding, with support working beneath. Steady as she goes.",
    "You're steady, and support's in motion. Give it a little time.",
    "Holding with help on the way. The ease will come.",
    "Support's right there with you. Let it do its quiet work.",
    "You're holding, and insulin's present. Breathe — it'll come down.",
  ],
  highInsulinFalling: [
    "Coming down, with support beside you. There you go.",
    "Easing back with help along the way. You're heading in the right direction.",
    "The descent is gentle with support flowing. You're coming back.",
    "Support and easing together — a gentle return.",
    "It's letting you down easy. You're nearly back.",
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