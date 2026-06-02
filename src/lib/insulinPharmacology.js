// Pharmacokinetic profiles for insulin types (times in minutes)
// Based on manufacturer labeling and clinical guidelines

export const INSULIN_PROFILES = {
  "Novolog (Aspart)": {
    category: "Rapid-Acting",
    onsetMin: 10,
    onsetMax: 20,
    peakMin: 60,
    peakMax: 180,
    durationMin: 180,
    durationMax: 300,
    color: "#3B82F6", // blue
  },
  "Humalog (Lispro)": {
    category: "Rapid-Acting",
    onsetMin: 15,
    onsetMax: 30,
    peakMin: 30,
    peakMax: 150,
    durationMin: 180,
    durationMax: 390,
    color: "#8B5CF6", // violet
  },
  "Apidra (Glulisine)": {
    category: "Rapid-Acting",
    onsetMin: 15,
    onsetMax: 30,
    peakMin: 60,
    peakMax: 90,
    durationMin: 180,
    durationMax: 300,
    color: "#EC4899", // pink
  },
  "Regular (Novolin R / Humulin R)": {
    category: "Short-Acting",
    onsetMin: 30,
    onsetMax: 60,
    peakMin: 120,
    peakMax: 240,
    durationMin: 300,
    durationMax: 480,
    color: "#F59E0B", // amber
  },
  "NPH (Novolin N / Humulin N)": {
    category: "Intermediate-Acting",
    onsetMin: 60,
    onsetMax: 180,
    peakMin: 240,
    peakMax: 720,
    durationMin: 720,
    durationMax: 1080,
    color: "#10B981", // emerald
  },
  "Lantus (Glargine)": {
    category: "Long-Acting",
    onsetMin: 60,
    onsetMax: 120,
    peakMin: null, // relatively peakless
    peakMax: null,
    durationMin: 1200,
    durationMax: 1440,
    color: "#6366F1", // indigo
  },
  "Levemir (Detemir)": {
    category: "Long-Acting",
    onsetMin: 60,
    onsetMax: 120,
    peakMin: 360,
    peakMax: 480,
    durationMin: 720,
    durationMax: 1440,
    color: "#14B8A6", // teal
  },
  "Tresiba (Degludec)": {
    category: "Ultra-Long-Acting",
    onsetMin: 60,
    onsetMax: 60,
    peakMin: null,
    peakMax: null,
    durationMin: 2520,
    durationMax: 2520,
    color: "#0EA5E9", // sky
  },
};

// Generate an activity curve for a dose
// Returns an array of { time (Date), activity (0-1) } points
export function generateActivityCurve(dose, intervalMinutes = 5) {
  const profile = INSULIN_PROFILES[dose.insulin_type];
  if (!profile) return [];

  const startTime = new Date(dose.administered_at).getTime();
  const onset = (profile.onsetMin + profile.onsetMax) / 2;
  const duration = (profile.durationMin + profile.durationMax) / 2;
  const hasPeak = profile.peakMin !== null;
  const peak = hasPeak ? (profile.peakMin + profile.peakMax) / 2 : duration / 2;

  const points = [];
  const totalMinutes = duration + 30; // add buffer

  for (let m = 0; m <= totalMinutes; m += intervalMinutes) {
    const time = new Date(startTime + m * 60000);
    let activity = 0;

    if (m < onset) {
      // Ramp up from 0 to small value
      activity = 0.05 * (m / onset);
    } else if (m < peak) {
      // Rising phase: onset to peak
      const progress = (m - onset) / (peak - onset);
      activity = 0.05 + 0.95 * Math.sin((progress * Math.PI) / 2);
    } else if (m < duration) {
      // Declining phase: peak to end
      if (hasPeak) {
        const progress = (m - peak) / (duration - peak);
        activity = Math.cos((progress * Math.PI) / 2);
      } else {
        // Peakless (like Lantus/Tresiba) — flat then taper
        const flatEnd = duration * 0.75;
        if (m < flatEnd) {
          activity = 0.85 + 0.15 * Math.random() * 0; // steady ~0.85
          activity = 0.85;
        } else {
          const progress = (m - flatEnd) / (duration - flatEnd);
          activity = 0.85 * Math.cos((progress * Math.PI) / 2);
        }
      }
    }

    points.push({ time: time.getTime(), activity: Math.round(Math.max(0, activity) * 100) / 100 });
  }

  return points;
}

// Get the current status of a dose
export function getDoseStatus(dose) {
  const profile = INSULIN_PROFILES[dose.insulin_type];
  if (!profile) return { phase: "unknown", message: "" };

  const now = Date.now();
  const start = new Date(dose.administered_at).getTime();
  const elapsed = (now - start) / 60000; // minutes

  const onset = (profile.onsetMin + profile.onsetMax) / 2;
  const hasPeak = profile.peakMin !== null;
  const peak = hasPeak ? (profile.peakMin + profile.peakMax) / 2 : null;
  const duration = (profile.durationMin + profile.durationMax) / 2;

  if (elapsed < 0) {
    return { phase: "scheduled", message: "Scheduled", minutesUntil: Math.abs(elapsed) };
  }
  if (elapsed < onset) {
    return { phase: "waiting", message: "Absorbing — not yet active", minutesUntil: onset - elapsed };
  }
  if (hasPeak && elapsed < peak) {
    return { phase: "rising", message: "Active — rising toward peak", minutesUntil: peak - elapsed };
  }
  if (elapsed < duration) {
    if (hasPeak) {
      return { phase: "declining", message: "Past peak — activity declining", minutesUntil: duration - elapsed };
    }
    return { phase: "active", message: "Active — steady level", minutesUntil: duration - elapsed };
  }
  return { phase: "expired", message: "No longer active" };
}

export function formatMinutes(mins) {
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const remainder = m % 60;
  return remainder > 0 ? `${h}h ${remainder}m` : `${h}h`;
}