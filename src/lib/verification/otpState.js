// The verification screen's state, as one small pure reducer.
//
// Every transition the person depends on lives here rather than in the view:
// typing, a wrong code, a resend, then the newest code. Keeping it pure means
// each one is testable without a phone, a network or a real email.

export const CODE_LENGTH = 6;

/**
 * Digits only. Deliberately never Number()/parseInt — the code is a string and
 * a leading zero is part of it.
 */
export function sanitizeCode(raw) {
  return String(raw ?? "").replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function isCompleteCode(code) {
  return sanitizeCode(code).length === CODE_LENGTH;
}

export const initialOtpState = {
  code: "",
  error: "",
  sending: false,
  sendingResend: false,
  done: false,
};

export function otpReducer(state, action) {
  switch (action.type) {
    // A keystroke makes the previous verdict obsolete: a stale "invalid or
    // expired" must never sit under a code the person is typing right now.
    case "edit":
      return { ...state, code: sanitizeCode(action.value), error: "" };

    // An incomplete code is not a wrong code. Never ask the server, and never
    // surface an expiry message for a field nobody has finished filling in.
    case "submit":
      if (state.sending || !isCompleteCode(state.code)) return state;
      return { ...state, sending: true, error: "" };

    case "failed":
      return {
        ...state,
        sending: false,
        error: action.message || "That code did not work. Please try again.",
      };

    case "verified":
      return { ...state, sending: false, error: "", done: true };

    case "resend-start":
      if (state.sendingResend) return state;
      return { ...state, sendingResend: true };

    // The newest code replaces the old one, so the old code AND the old
    // complaint are both cleared. `sending` is reset too, so a resend never
    // leaves the field locked behind an earlier submit.
    case "resent":
      return {
        ...state,
        sendingResend: false,
        code: "",
        error: "",
        sending: false,
      };

    case "resend-failed":
      return {
        ...state,
        sendingResend: false,
        error: action.message || "We could not send a new code. Please try again.",
      };

    default:
      return state;
  }
}

export function canSubmit(state) {
  return Boolean(state) && !state.sending && isCompleteCode(state.code);
}