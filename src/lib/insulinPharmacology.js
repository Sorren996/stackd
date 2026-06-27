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
    color: "#284575ff",
  },
  "Humalog (Lispro)": {
    category: "Rapid-Acting",
    onsetMin: 15,
    onsetMax: 30,
    peakMin: 30,
    peakMax: 150,
    durationMin: 180,
    durationMax: 390,
    color: "#402976ff",
  },
  "Apidra (Glulisine)": {
    category: "Rapid-Acting",
    onsetMin: 15,
    onsetMax: 30,
    peakMin: 60,
    peakMax: 90,
    durationMin: 180,
    durationMax: 300,
    color: "#712049ff",
  },
  "Regular (Novolin R / Humulin R)": {
    category: "Short-Acting",
    onsetMin: 30,
    onsetMax: 60,
    peakMin: 120,
    peakMax: 240,
    durationMin: 300,
    durationMax: 480,
    color: "#b97807ff",
  },
  "NPH (Novolin N / Humulin N)": {
    category: "Intermediate-Acting",
    onsetMin: 60,
    onsetMax: 180,
    peakMin: 240,
    peakMax: 720,
    durationMin: 720,
    durationMax: 1080,
    color: "#157152ff",
  },
  "Lantus (Glargine)": {
    category: "Long-Acting",
    onsetMin: 60,
    onsetMax: 120,
    peakMin: null,
    peakMax: null,
    durationMin: 1200,
    durationMax: 1440,
    color: "#1f207fff",
  },
  "Levemir (Detemir)": {
    category: "Long-Acting",
    onsetMin: 60,
    onsetMax: 120,
    peakMin: 360,
    peakMax: 480,
    durationMin: 720,
    durationMax: 1440,
    color: "#166c62ff",
  },
  "Tresiba (Degludec)": {
    category: "Ultra-Long-Acting",
    onsetMin: 60,
    onsetMax: 60,
    peakMin: null,
    peakMax: null,
    durationMin: 2520,
    durationMax: 2520,
    color: "#045a82ff",
  },
};

function getDoseDurationMultiplier(units) {
  const doseUnits = Number(units) || 0;

  if (doseUnits <= 5) return 0.75;
  if (doseUnits <= 15) return 1;
  if (doseUnits <= 30) return 1.2;
  if (doseUnits <= 50) return 1.4;

  return 1.6;
}

function getDosePeakMultiplier(units) {
  const doseUnits = Number(units) || 0;

  if (doseUnits <= 5) return 0.9;
  if (doseUnits <= 15) return 1;
  if (doseUnits <= 30) return 1.1;
  if (doseUnits <= 50) return 1.2;

  return 1.3;
}

function getDoseTiming(dose) {
  const profile = INSULIN_PROFILES[dose.insulin_type];
  if (!profile) return null;

  const onset = (profile.onsetMin + profile.onsetMax) / 2;

  const baseDuration = (profile.durationMin + profile.durationMax) / 2;
  const duration = baseDuration * getDoseDurationMultiplier(dose.units);

  const hasPeak = profile.peakMin !== null && profile.peakMax !== null;
  const basePeak = hasPeak ? (profile.peakMin + profile.peakMax) / 2 : null;
  const peak = hasPeak ? basePeak * getDosePeakMultiplier(dose.units) : duration / 2;

  return {
    profile,
    onset,
    peak: Math.min(peak, duration * 0.85),
    duration,
    hasPeak,
  };
}

// Generate an activity curve for a dose
// Returns an array of { time, activity } points
export function generateActivityCurve(dose, intervalMinutes = 5) {
  const timing = getDoseTiming(dose);
  if (!timing) return [];

  const { onset, peak, duration, hasPeak } = timing;
  const startTime = new Date(dose.administered_at).getTime();

  const points = [];
  const totalMinutes = duration + 30;

  for (let m = 0; m <= totalMinutes; m += intervalMinutes) {
    const time = new Date(startTime + m * 60000);
    let activity = 0;

    if (m < onset) {
      activity = 0.05 * (m / onset);
    } else if (m < peak) {
      const progress = (m - onset) / (peak - onset);
      activity = 0.05 + 0.95 * Math.sin((progress * Math.PI) / 2);
    } else if (m < duration) {
      if (hasPeak) {
        const progress = (m - peak) / (duration - peak);
        activity = Math.cos((progress * Math.PI) / 2);
      } else {
        const flatEnd = duration * 0.75;

        if (m < flatEnd) {
          activity = 0.85;
        } else {
          const progress = (m - flatEnd) / (duration - flatEnd);
          activity = 0.85 * Math.cos((progress * Math.PI) / 2);
        }
      }
    }

    points.push({
      time: time.getTime(),
      activity: Math.round(Math.max(0, activity) * 100) / 100,
    });
  }

  return points;
}

// Get the current status of a dose
export function getDoseStatus(dose) {
  const timing = getDoseTiming(dose);
  if (!timing) return { phase: "unknown", message: "" };

  const { onset, peak, duration, hasPeak } = timing;

  const now = Date.now();
  const start = new Date(dose.administered_at).getTime();
  const elapsed = (now - start) / 60000;

  if (elapsed < 0) {
    return {
      phase: "scheduled",
      message: "Scheduled",
      minutesUntil: Math.abs(elapsed),
    };
  }

  if (elapsed < onset) {
    return {
      phase: "waiting",
      message: "Absorbing - not yet active",
      minutesUntil: onset - elapsed,
    };
  }

  if (hasPeak && elapsed < peak) {
    return {
      phase: "rising",
      message: "Active - rising toward peak",
      minutesUntil: peak - elapsed,
    };
  }

  if (elapsed < duration) {
    if (hasPeak) {
      return {
        phase: "declining",
        message: "Past peak - activity declining",
        minutesUntil: duration - elapsed,
      };
    }

    return {
      phase: "active",
      message: "Active - steady level",
      minutesUntil: duration - elapsed,
    };
  }

  return {
    phase: "expired",
    message: "No longer active",
  };
}

export function formatMinutes(mins) {
  const m = Math.round(mins);

  if (m < 60) return `${m}m`;

  const h = Math.floor(m / 60);
  const remainder = m % 60;

  return remainder > 0 ? `${h}h ${remainder}m` : `${h}h`;
}