/**
 * Centralized supportive error messages for the app.
 * All wording stays in line with wellness, uplifting, and motivational tone — never clinical or alarming.
 */

export const SUPPORTIVE_ERRORS = {
  save: "We couldn't quite catch that moment. A deep breath — and let's try again?",
  load: "The connection feels a bit quiet right now. Please check your rhythm and try again.",
  network: "The path seems a little turbulent. Let's pause and try once more.",
  delete: "We had trouble letting that go. Please try again in a moment.",
  update: "That change didn't settle in yet. Let's give it another gentle try.",
  submit: "The river seems a bit turbulent right now. Let's try that step again.",
};

export const SUPPORTIVE_SUCCESS = {
  save: "Your settings have been saved.",
  delete: "Moment gently removed.",
  update: "Moment updated.",
};

/**
 * Returns a supportive error message based on the error type.
 * If the error contains a known clinical validation message, pass it through.
 */
export function getSupportiveErrorMessage(error, fallbackKey = "save") {
  if (!error) return SUPPORTIVE_ERRORS[fallbackKey] || SUPPORTIVE_ERRORS.save;

  const message = error.message || String(error);

  // Pass through validation messages that guide the user
  if (message.includes("values need adjustment") || message.includes("Please check your entries")) {
    return message;
  }

  // Network / connection errors
  if (
    message.includes("network") ||
    message.includes("Network") ||
    message.includes("fetch") ||
    message.includes("Failed to fetch") ||
    message.includes("ERR_INTERNET")
  ) {
    return SUPPORTIVE_ERRORS.network;
  }

  return SUPPORTIVE_ERRORS[fallbackKey] || SUPPORTIVE_ERRORS.save;
}