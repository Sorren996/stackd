// In-app alert chimes and vibration.
//
// Three tones, one timbre. Every note is a pure sine with the same envelope: a
// 20 ms exponential attack, an exponential fall back to near-silence at
// +420 ms, and the oscillator stopped at +450 ms. Only the notes, the peak gain
// and the buzz differ:
//
//   neutral  G5 → C6          the original two-note doorbell (unchanged)
//   rising   G5 → B5 → D6     ascending, for a rising-fast alert
//   falling  D6 → B5 → G5     descending, for a falling-fast alert
//
// These are the tones THIS device plays while Stackd is open. The alert tone on
// a locked or closed phone is chosen by iOS from Stackd's own notification
// settings and cannot be set from here.
//
// Both audio and vibration are best-effort and never throw: a browser without
// audio, or a device with no vibration motor, simply stays quiet.

let context = null;

function audioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}

const ENVELOPE = { attack: 0.02, decay: 0.42, stop: 0.45 };

export const ALERT_TONES = {
  neutral: {
    label: "Current",
    gain: 0.14,
    vibration: [18, 70, 18],
    notes: [
      { frequency: 784, at: 0 },
      { frequency: 1046.5, at: 0.16 },
    ],
  },
  rising: {
    label: "Rising",
    gain: 0.16,
    vibration: [18, 60, 18, 60, 18],
    notes: [
      { frequency: 784, at: 0 },
      { frequency: 987.77, at: 0.15 },
      { frequency: 1174.66, at: 0.3 },
    ],
  },
  falling: {
    label: "Falling",
    gain: 0.16,
    vibration: [18, 90, 18],
    notes: [
      { frequency: 1174.66, at: 0 },
      { frequency: 987.77, at: 0.15 },
      { frequency: 784, at: 0.3 },
    ],
  },
};

/**
 * The tone a category asks for: direction-specific for the two pace alerts,
 * neutral for every other category. This is the ONLY rule for choosing a tone,
 * so nothing can answer differently in two places.
 */
export function alertToneFor(category) {
  if (category === "rising_fast") return "rising";
  if (category === "falling_fast") return "falling";
  return "neutral";
}

/**
 * Sound files bundled for the two direction-specific tones. The names are the
 * ones a native iOS target must carry at its bundle root: APNs only plays a
 * custom sound that ships inside the app. `neutral` has no file — the platform
 * default tone stays in charge of every other category.
 */
export const ALERT_SOUND_FILES = {
  rising: "stackd_chime_rising.wav",
  falling: "stackd_chime_falling.wav",
};

/** The bundled file for a tone, or null when the platform default applies. */
export function alertSoundFile(tone) {
  return ALERT_SOUND_FILES[tone] || null;
}

/** Synthesise a tone's notes through the shared AudioContext. */
export function playAlertChime(tone = "neutral") {
  const spec = ALERT_TONES[tone] || ALERT_TONES.neutral;
  const ctx = audioContext();
  if (!ctx) return;

  const start = ctx.currentTime;
  spec.notes.forEach(({ frequency, at }) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(spec.gain, start + at + ENVELOPE.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + ENVELOPE.decay);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start + at);
    oscillator.stop(start + at + ENVELOPE.stop);
  });
}

/** Buzz for a tone, on devices that support haptics. */
export function vibrateAlert(tone = "neutral") {
  const spec = ALERT_TONES[tone] || ALERT_TONES.neutral;
  try {
    navigator.vibrate?.(spec.vibration);
  } catch {
    // No vibration motor — the chime carries the alert.
  }
}

/** The full in-app confirmation for a tone: its chime and its buzz. */
export function playNotificationFeedback(tone = "neutral") {
  playAlertChime(tone);
  vibrateAlert(tone);
}

// Decoded sound files, kept so a repeat preview starts instantly.
const soundBuffers = new Map();

async function soundBuffer(ctx, tone) {
  const file = alertSoundFile(tone);
  if (!file) return null;
  if (soundBuffers.has(file)) return soundBuffers.get(file);
  const response = await fetch(`/sounds/${file}`);
  if (!response.ok) throw new Error("tone unavailable");
  const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
  soundBuffers.set(file, buffer);
  return buffer;
}

/**
 * Play a tone for preview on this device: the bundled file through the same
 * AudioContext the synthesized chime uses, so what you hear is the file that
 * ships. The neutral tone has no file, and any failure falls back to the
 * synthesized notes rather than staying silent.
 */
export async function previewAlertTone(tone = "neutral") {
  const ctx = audioContext();
  if (!ctx) return;
  try {
    const buffer = await soundBuffer(ctx, tone);
    if (!buffer) {
      playAlertChime(tone);
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  } catch {
    playAlertChime(tone);
  }
}

/** Kept for existing callers: the original two-note tone. */
export function playConfirmationChime() {
  playAlertChime("neutral");
}

/** Kept for existing callers: the original double buzz. */
export function vibrateConfirmation() {
  vibrateAlert("neutral");
}