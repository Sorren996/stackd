// Regression tests for the verification screen's state machine.
//
// These cover exactly what the owner could not do on the iPhone: enter a code,
// correct it, resend and then use the NEWEST code. No network, no real email,
// no account is touched.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  CODE_LENGTH,
  canSubmit,
  initialOtpState,
  isCompleteCode,
  otpReducer,
  sanitizeCode,
} from "../otpState.js";

const edit = (state, value) => otpReducer(state, { type: "edit", value });

/** Simulates a controlled input: each keystroke rewrites the whole value. */
function typeAll(text, state = initialOtpState) {
  let next = state;
  for (let i = 1; i <= text.length; i++) next = edit(next, text.slice(0, i));
  return next;
}

describe("code sanitising", () => {
  test("keeps digits only and caps at six", () => {
    assert.equal(sanitizeCode("12a3 4-5"), "12345");
    assert.equal(sanitizeCode("1234567890"), "123456");
    assert.equal(sanitizeCode(null), "");
    assert.equal(sanitizeCode(undefined), "");
    assert.equal(CODE_LENGTH, 6);
  });

  test("a leading zero is part of the code, never dropped", () => {
    const state = edit(initialOtpState, "012345");
    assert.equal(state.code, "012345");
    assert.equal(state.code.length, 6);
    assert.equal(isCompleteCode(state.code), true);
    assert.equal(canSubmit(state), true);
  });
});

describe("entering a code", () => {
  test("typing six digits one at a time completes the code", () => {
    const state = typeAll("123456");
    assert.equal(state.code, "123456");
    assert.equal(canSubmit(state), true);
  });

  test("paste with spaces and dashes is accepted", () => {
    const state = edit(initialOtpState, "123 456");
    assert.equal(state.code, "123456");
    assert.equal(canSubmit(state), true);
    assert.equal(edit(initialOtpState, "123-456").code, "123456");
  });

  test("autofill of the whole message is accepted", () => {
    const state = edit(initialOtpState, "  654321  ");
    assert.equal(state.code, "654321");
    assert.equal(canSubmit(state), true);
  });

  test("backspace shortens the code and blocks submitting it", () => {
    const full = typeAll("123456");
    const shorter = edit(full, "12345");
    assert.equal(shorter.code, "12345");
    assert.equal(isCompleteCode(shorter.code), false);
    assert.equal(canSubmit(shorter), false);
  });

  test("replacing a digit is allowed and clears the old complaint", () => {
    const failed = otpReducer(typeAll("123456"), { type: "submit" });
    const withError = otpReducer(failed, { type: "failed", message: "Invalid code" });
    const corrected = edit(withError, "129456");
    assert.equal(corrected.code, "129456");
    assert.equal(corrected.error, "");
    assert.equal(canSubmit(corrected), true);
  });
});

describe("an incomplete code is never judged", () => {
  test("submitting an empty field sends nothing and claims nothing", () => {
    const state = otpReducer(initialOtpState, { type: "submit" });
    assert.equal(state, initialOtpState);
    assert.equal(state.sending, false);
    assert.equal(state.error, "");
  });

  test("submitting five digits sends nothing", () => {
    const five = typeAll("12345");
    assert.equal(otpReducer(five, { type: "submit" }), five);
    assert.equal(five.sending, false);
  });
});

describe("a wrong or expired code", () => {
  test("failure is reported, the spinner clears, and the code is kept to correct", () => {
    const submitted = otpReducer(typeAll("123456"), { type: "submit" });
    assert.equal(submitted.sending, true);

    const failed = otpReducer(submitted, {
      type: "failed",
      message: "Invalid or expired verification code.",
    });
    assert.equal(failed.sending, false);
    assert.equal(failed.error, "Invalid or expired verification code.");
    assert.equal(failed.code, "123456");
    assert.equal(failed.done, false);
  });

  test("a failure with no server message still says something usable", () => {
    const submitted = otpReducer(typeAll("123456"), { type: "submit" });
    const failed = otpReducer(submitted, { type: "failed" });
    assert.match(failed.error, /did not work/i);
    assert.equal(failed.sending, false);
  });
});

describe("resending", () => {
  const stale = otpReducer(
    otpReducer(typeAll("111111"), { type: "submit" }),
    {
      type: "failed",
      message: "Invalid or expired verification code. Please request a new one.",
    }
  );

  test("a resend clears the spent code and the stale error", () => {
    const resending = otpReducer(stale, { type: "resend-start" });
    assert.equal(resending.sendingResend, true);

    const resent = otpReducer(resending, { type: "resent" });
    assert.equal(resent.code, "");
    assert.equal(resent.error, "");
    assert.equal(resent.sendingResend, false);
    // The field is not left disabled behind an earlier submit.
    assert.equal(resent.sending, false);
    assert.equal(canSubmit(resent), false);
  });

  test("the obsolete code cannot be submitted after a resend", () => {
    const resent = otpReducer(otpReducer(stale, { type: "resend-start" }), { type: "resent" });
    assert.equal(canSubmit(resent), false);
    assert.equal(otpReducer(resent, { type: "submit" }), resent);
  });

  test("the newest code is accepted after a resend", () => {
    const resent = otpReducer(otpReducer(stale, { type: "resend-start" }), { type: "resent" });
    const typed = typeAll("222222", resent);
    assert.equal(typed.code, "222222");
    assert.equal(canSubmit(typed), true);
    const verified = otpReducer(typed, { type: "verified" });
    assert.equal(verified.done, true);
    assert.equal(verified.error, "");
  });

  test("a second resend while one is in flight is ignored", () => {
    const resending = otpReducer(stale, { type: "resend-start" });
    assert.equal(otpReducer(resending, { type: "resend-start" }), resending);
  });

  test("a failed resend keeps the current code so nothing is silently lost", () => {
    const resending = otpReducer(stale, { type: "resend-start" });
    const failed = otpReducer(resending, { type: "resend-failed", message: "Too many requests" });
    assert.equal(failed.sendingResend, false);
    assert.equal(failed.error, "Too many requests");
    assert.equal(failed.code, "111111");
  });
});