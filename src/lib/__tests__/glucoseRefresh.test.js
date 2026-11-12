import { describe, it, expect } from "vitest";
import {
  normalizeSourceVerification,
  deriveGlucoseFreshness,
  VERIFICATION,
  CHECKING_COPY,
  REFRESH_ERROR_COPY,
} from "../glucoseRefresh/verification";
import {
  requestGlucoseRefresh,
  getGlucoseRefreshState,
} from "../glucoseRefresh/coordinator";
import { STALE_READING_MINUTES } from "../glucoseStaleness";

// The rules under test — freshness presentation only:
//   * a cached row is never evidence that the source was checked
//   * the stale warning speaks only after a completed check THIS lifecycle
//   * a failed check is unverified, never "the sensor sent nothing"
//   * nothing here touches thresholds, alerts, insulin math or dose settings

const NOW = Date.parse("2026-11-12T02:00:00.000Z");
const MIN = 60 * 1000;
const readingAt = (minutesAgo, value = 112) => ({
  recorded_at: new Date(NOW - minutesAgo * MIN).toISOString(),
  value,
  source: "dexcom_share",
});

const freshness = (overrides = {}) =>
  deriveGlucoseFreshness({
    now: NOW,
    connected: true,
    verification: VERIFICATION.IDLE,
    checking: false,
    ...overrides,
  });

describe("the existing stale threshold is used, not a new one", () => {
  it("is the app's glucose staleness window", () => {
    expect(STALE_READING_MINUTES).toBe(8);
    expect(freshness({ reading: readingAt(9) }).staleMinutes).toBe(8);
  });
});

describe("reopening with an old cached reading", () => {
  it("shows checking, not the connection warning", () => {
    const state = freshness({ reading: readingAt(45), checking: true, verification: VERIFICATION.PENDING });
    expect(state.showChecking).toBe(true);
    expect(state.showStaleWarning).toBe(false);
    expect(state.showRefreshError).toBe(false);
  });

  it("does not flash a warning before the first check starts", () => {
    const state = freshness({ reading: readingAt(45) });
    expect(state.showStaleWarning).toBe(false);
  });

  it("keeps the reading, its age and the threshold verdict", () => {
    const state = freshness({ reading: readingAt(45), checking: true, verification: VERIFICATION.PENDING });
    expect(state.hasReading).toBe(true);
    expect(state.ageMinutes).toBe(45);
    expect(state.overThreshold).toBe(true);
  });
});

describe("a completed check that returned a newer reading", () => {
  it("clears checking state and keeps a fresh reading quiet", () => {
    const state = freshness({ reading: readingAt(2), verification: VERIFICATION.NEW_READING });
    expect(state.showChecking).toBe(false);
    expect(state.showStaleWarning).toBe(false);
    expect(state.answered).toBe(true);
  });

  it("treats a newer-but-still-stale reading as confirmed stale", () => {
    const state = freshness({ reading: readingAt(20), verification: VERIFICATION.NEW_READING });
    expect(state.showStaleWarning).toBe(true);
  });
});

describe("a completed check confirming no newer reading", () => {
  it("says nothing below the threshold", () => {
    const state = freshness({ reading: readingAt(5), verification: VERIFICATION.CONFIRMED_NO_NEW });
    expect(state.showStaleWarning).toBe(false);
  });

  it("uses the existing check-connection state at or past the threshold", () => {
    expect(freshness({ reading: readingAt(8), verification: VERIFICATION.CONFIRMED_NO_NEW }).showStaleWarning).toBe(true);
    expect(freshness({ reading: readingAt(90), verification: VERIFICATION.CONFIRMED_NO_NEW }).showStaleWarning).toBe(true);
  });
});

describe("a check that could not establish freshness", () => {
  it("reports a failed refresh as unverified, never as a quiet sensor", () => {
    const state = freshness({ reading: readingAt(45), verification: VERIFICATION.UNVERIFIED });
    expect(state.showRefreshError).toBe(true);
    expect(state.showStaleWarning).toBe(false);
    expect(state.showChecking).toBe(false);
    expect(state.hasReading).toBe(true); // last reading stays visible
    expect(state.ageMinutes).toBe(45); // its real age stays visible
  });

  it("does not treat a returned database row as proof of a current check", () => {
    // The gate skipped the source (fresh cache / in-flight lock).
    const skipped = normalizeSourceVerification({
      status: "skipped_fresh_cache",
      skipped: true,
      latest_glucose_timestamp: new Date(NOW - 40 * MIN).toISOString(),
      source_check_success: false,
      verification: "pending",
    });
    expect(skipped.verification).toBe(VERIFICATION.PENDING);
    const state = freshness({ reading: readingAt(40), verification: skipped.verification });
    expect(state.showStaleWarning).toBe(false);
    expect(state.showRefreshError).toBe(false);
  });

  it("keeps a source failure behind the unverified verdict, not a stale claim", () => {
    const failed = normalizeSourceVerification({ status: "error", source_check_success: false });
    expect(failed.verification).toBe(VERIFICATION.UNVERIFIED);
    expect(freshness({ reading: readingAt(30), verification: failed.verification }).showStaleWarning).toBe(false);
  });

  it("does not duplicate the app's own connection copy for a missing connection", () => {
    const notConnected = normalizeSourceVerification({ status: "not_connected", source_check_success: false });
    expect(notConnected.verification).toBe(VERIFICATION.SOURCE_ERROR);
    const state = freshness({ reading: null, connected: false, verification: notConnected.verification });
    expect(state.showRefreshError).toBe(false);
    expect(state.showStaleWarning).toBe(false);
  });
});

describe("first use with nothing stored", () => {
  it("claims nothing about old data", () => {
    const state = freshness({ reading: null, verification: VERIFICATION.CONFIRMED_NO_NEW });
    expect(state.hasReading).toBe(false);
    expect(state.overThreshold).toBe(false);
    expect(state.showStaleWarning).toBe(false);
    expect(state.showChecking).toBe(false);
  });
});

describe("server verdict mapping", () => {
  it("reads the server's own verification metadata first", () => {
    const confirmed = normalizeSourceVerification({
      status: "no_new_records",
      source_check_success: true,
      source_checked_at: new Date(NOW).toISOString(),
      no_new_reading: true,
      verification: "confirmed_no_new",
      latest_source_measurement_at: new Date(NOW - 12 * MIN).toISOString(),
    });
    expect(confirmed.verification).toBe(VERIFICATION.CONFIRMED_NO_NEW);
    expect(confirmed.sourceCheckSuccess).toBe(true);
    expect(confirmed.latestSourceMeasurementAt).toBe(new Date(NOW - 12 * MIN).toISOString());

    const newer = normalizeSourceVerification({
      status: "synced",
      source_check_success: true,
      no_new_reading: false,
      verification: "new_reading",
    });
    expect(newer.verification).toBe(VERIFICATION.NEW_READING);
  });

  it("treats an in-flight skip as pending, not answered", () => {
    expect(normalizeSourceVerification({ status: "skipped_in_flight", skipped: true }).verification).toBe(
      VERIFICATION.PENDING
    );
  });

  it("treats a missing payload (timeout or thrown call) as unverified", () => {
    expect(normalizeSourceVerification(null).verification).toBe(VERIFICATION.UNVERIFIED);
  });
});

describe("the refresh coordinator", () => {
  it("coalesces duplicate lifecycle events onto one request", async () => {
    let calls = 0;
    let release;
    const run = () => {
      calls += 1;
      return new Promise((resolve) => {
        release = () =>
          resolve({ status: "no_new_records", source_check_success: true, no_new_reading: true });
      });
    };
    const a = requestGlucoseRefresh({ userId: "dedupe-user", run, trigger: "visible" });
    const b = requestGlucoseRefresh({ userId: "dedupe-user", run, trigger: "focus" });
    const c = requestGlucoseRefresh({ userId: "dedupe-user", run, trigger: "pageshow" });
    await Promise.resolve(); // let the single request reach `run`
    release();
    await Promise.all([a, b, c]);
    expect(calls).toBe(1);
    expect(getGlucoseRefreshState("dedupe-user").verification).toBe(VERIFICATION.CONFIRMED_NO_NEW);
  });

  it("starts every lifecycle at checking, never at a previous verdict", async () => {
    const run = async () => ({ status: "no_new_records", source_check_success: true, no_new_reading: true });
    await requestGlucoseRefresh({ userId: "gen-user", run });
    const settled = getGlucoseRefreshState("gen-user");
    let during = null;
    const second = requestGlucoseRefresh({
      userId: "gen-user",
      run: async () => {
        during = getGlucoseRefreshState("gen-user");
        return { status: "no_new_records", source_check_success: true, no_new_reading: true };
      },
    });
    await second;
    expect(settled.status).toBe("settled");
    expect(during.status).toBe("checking");
    expect(during.verification).toBe(VERIFICATION.PENDING);
    expect(getGlucoseRefreshState("gen-user").generation).toBe(settled.generation + 1);
  });

  it("always clears loading, even when the request hangs", async () => {
    const state = await requestGlucoseRefresh({
      userId: "slow-user",
      timeoutMs: 10,
      run: () => new Promise(() => {}),
    });
    expect(state.status).toBe("settled");
    expect(state.verification).toBe(VERIFICATION.UNVERIFIED);
    expect(state.errorCode).toBe("timeout");
  });

  it("a late answer cannot overwrite a timed-out check", async () => {
    let resolveLate;
    await requestGlucoseRefresh({
      userId: "late-user",
      timeoutMs: 10,
      run: () =>
        new Promise((resolve) => {
          resolveLate = resolve;
        }),
    });
    expect(getGlucoseRefreshState("late-user").verification).toBe(VERIFICATION.UNVERIFIED);
    resolveLate({ status: "no_new_records", source_check_success: true, no_new_reading: true });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(getGlucoseRefreshState("late-user").verification).toBe(VERIFICATION.UNVERIFIED);
  });

  it("a retry after a failure can settle as a completed check", async () => {
    const failed = await requestGlucoseRefresh({
      userId: "retry-user",
      run: async () => {
        throw new Error("offline");
      },
    });
    expect(failed.verification).toBe(VERIFICATION.UNVERIFIED);

    const retried = await requestGlucoseRefresh({
      userId: "retry-user",
      trigger: "manual",
      run: async () => ({
        status: "no_new_records",
        source_check_success: true,
        no_new_reading: true,
        source_checked_at: new Date(NOW).toISOString(),
      }),
    });
    expect(retried.verification).toBe(VERIFICATION.CONFIRMED_NO_NEW);
    expect(retried.trigger).toBe("manual");
  });

  it("keeps each account's state to itself", async () => {
    await requestGlucoseRefresh({
      userId: "account-a",
      run: async () => ({ status: "no_new_records", source_check_success: true, no_new_reading: true }),
    });
    expect(getGlucoseRefreshState("account-b").status).toBe("idle");
    expect(getGlucoseRefreshState("account-b").verification).toBe(VERIFICATION.IDLE);
    expect(getGlucoseRefreshState(undefined).status).toBe("idle");
  });

  it("does nothing without an account (a viewer never triggers a refresh)", async () => {
    const state = await requestGlucoseRefresh({ userId: null, run: async () => ({}) });
    expect(state.status).toBe("idle");
  });
});

describe("the inline copy", () => {
  it("is the approved wording", () => {
    expect(CHECKING_COPY).toBe("Receiving your latest reading…");
    expect(REFRESH_ERROR_COPY).toBe("Couldn’t refresh your reading. Please try again.");
  });
});