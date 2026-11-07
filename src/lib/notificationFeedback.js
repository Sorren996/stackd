// In-app confirmation chime and vibration.
//
// The push integration accepts only a recipient, a title and a message, so a
// notification's own tone and buzz are chosen by the device's Stackd
// notification settings, not by the app. This plays a short chime and a buzz on
// the device that triggers the test, so you can hear and feel straight away that
// it went out.
//
// Both are best-effort and never throw: a browser without audio, or a device
// with no vibration motor, simply stays quiet.

let context = null;

function audioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}

/** Two soft rising tones — a doorbell, not an alarm. */
export function playConfirmationChime() {
  const ctx = audioContext();
  if (!ctx) return;

  const start = ctx.currentTime;
  [
    { frequency: 784, at: 0 },
    { frequency: 1046.5, at: 0.16 },
  ].forEach(({ frequency, at }) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(0.14, start + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.42);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start + at);
    oscillator.stop(start + at + 0.45);
  });
}

/** Short double buzz on devices that support haptics. */
export function vibrateConfirmation() {
  try {
    navigator.vibrate?.([18, 70, 18]);
  } catch {
    // No vibration motor — the chime carries the confirmation.
  }
}

export function playNotificationFeedback() {
  playConfirmationChime();
  vibrateConfirmation();
}